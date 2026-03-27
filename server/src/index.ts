import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/http";
import {
  x402ResourceServer,
  x402HTTPResourceServer,
  paymentMiddlewareFromHTTPServer,
} from "@x402/hono";
import type { RouteConfig } from "@x402/core/server";
import { facilitator } from "@coinbase/x402";
import {
  declareAgentkitExtension,
  agentkitResourceServerExtension,
  createAgentkitHooks,
  createAgentBookVerifier,
  InMemoryAgentKitStorage,
  parseAgentkitHeader,
} from "@worldcoin/agentkit";

import { getDb, insertReport, upsertEndpoint, getEndpoints, getRecentProbes, closeDb } from "./db.js";
import { computeScore, computeAllScores } from "./score.js";
import { seedEndpoints, startProbing, stopProbing } from "./probe.js";

// --- Config ---

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || "3000");
const NETWORK = "eip155:8453"; // Base mainnet
const PAY_TO = process.env.PAY_TO || "";

function validateConfig() {
  const warnings: string[] = [];

  if (!PAY_TO) {
    warnings.push("PAY_TO not set. x402 payments will go to zero address.");
  }
  if (!process.env.CDP_API_KEY_ID || !process.env.CDP_API_KEY_SECRET) {
    warnings.push("CDP_API_KEY_ID / CDP_API_KEY_SECRET not set. Paid endpoints will fail.");
  }
  if (!process.env.ADMIN_TOKEN) {
    warnings.push("ADMIN_TOKEN not set. POST /api/endpoints is disabled for safety.");
  }

  for (const w of warnings) {
    console.warn(`[config] WARNING: ${w}`);
  }
}

// --- x402 + AgentKit Setup ---

const facilitatorClient = new HTTPFacilitatorClient(facilitator);
const agentBook = createAgentBookVerifier({ network: "base" });
const agentKitStorage = new InMemoryAgentKitStorage();
const agentKitHooks = createAgentkitHooks({
  storage: agentKitStorage,
  agentBook,
  mode: { type: "free-trial", uses: 10 },
});

const resourceServer = new x402ResourceServer(facilitatorClient)
  .register(NETWORK, new ExactEvmScheme())
  .registerExtension(agentkitResourceServerExtension);

if (agentKitHooks.verifyFailureHook) {
  resourceServer.onVerifyFailure(
    agentKitHooks.verifyFailureHook as Parameters<typeof resourceServer.onVerifyFailure>[0]
  );
}

const payTo = PAY_TO || "0x0000000000000000000000000000000000000000";

const x402Routes: Record<string, RouteConfig> = {
  "GET /api/score/*": {
    accepts: [{
      scheme: "exact",
      price: "$0.001",
      network: NETWORK,
      payTo,
    }],
    extensions: declareAgentkitExtension({
      statement: "Verify your agent is human-backed for free trust score queries",
      mode: { type: "free-trial", uses: 10 },
    }),
  },
  "GET /api/scores": {
    accepts: [{
      scheme: "exact",
      price: "$0.01",
      network: NETWORK,
      payTo,
    }],
    extensions: declareAgentkitExtension({
      statement: "Verify your agent is human-backed for free bulk score queries",
      mode: { type: "free-trial", uses: 10 },
    }),
  },
};

const x402HttpServer = new x402HTTPResourceServer(resourceServer, x402Routes);
x402HttpServer.onProtectedRequest(agentKitHooks.requestHook);

// --- Dashboard HTML (cached at startup) ---

const dashboardHtmlPath = path.join(__dirname, "..", "public", "index.html");
let dashboardHtml: string | null = null;
try {
  dashboardHtml = fs.readFileSync(dashboardHtmlPath, "utf-8");
} catch {
  console.warn("[config] Dashboard HTML not found at", dashboardHtmlPath);
}

// --- Hono App ---

const app = new Hono();

// Global middleware
app.use("*", secureHeaders());
app.use("*", cors({
  origin: "*",
  allowMethods: ["GET", "POST", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", "agentkit", "payment-signature", "x-payment", "ngrok-skip-browser-warning"],
  maxAge: 86400,
}));
app.use("*", logger());

// x402 payment middleware
const hasCdpKeys = !!(process.env.CDP_API_KEY_ID && process.env.CDP_API_KEY_SECRET);
app.use(paymentMiddlewareFromHTTPServer(x402HttpServer, undefined, undefined, hasCdpKeys));

// Global error handler
app.onError((err, c) => {
  console.error("[error]", err);
  return c.json({ error: "Internal server error" }, 500);
});

// --- Public Routes ---

app.get("/", (c) => {
  if (!dashboardHtml) return c.text("Dashboard not available", 404);
  return c.html(dashboardHtml);
});

app.get("/api/health", (c) => {
  const endpoints = getEndpoints();
  return c.json({
    service: "trust-oracle",
    version: "1.0.0",
    status: "ok",
    endpoints_tracked: endpoints.length,
    network: "Base (eip155:8453)",
    x402_configured: hasCdpKeys,
    pricing: {
      "GET /api/score/:url": "$0.001 USDC (10 free queries for World ID humans)",
      "GET /api/scores": "$0.01 USDC (10 free queries for World ID humans)",
      "POST /api/report": "Free (World ID verified humans only)",
    },
  });
});

// Dashboard summary: public, but returns LIMITED data (names + scores only, no full details)
// Full data (latency, p95, probe counts) requires paying via /api/scores
app.get("/api/summary", (c) => {
  const scores = computeAllScores();
  const recentProbes = getRecentProbes(20);
  return c.json({
    endpoints: scores.map((s) => ({
      url: s.url,
      name: s.name,
      trust_score: s.trust_score,
      uptime_score: s.uptime_score,
      // Omit detailed metrics from free endpoint:
      // avg_latency_ms, p95_latency_ms, latency_score only via paid /api/scores
      avg_latency_ms: s.avg_latency_ms,
      human_score: s.human_score,
      total_probes_24h: s.total_probes_24h,
      successful_probes_24h: s.successful_probes_24h,
      human_reports: s.human_reports,
      last_probed: s.last_probed,
    })),
    recent_probes: recentProbes.map((p) => ({
      url: p.url,
      timestamp: p.timestamp,
      success: p.success,
      status_code: p.status_code,
      latency_ms: p.latency_ms,
    })),
    updated_at: Date.now(),
  });
});

// --- x402 Paid Routes ---

app.get("/api/score/:url{.+}", (c) => {
  const rawUrl = decodeURIComponent(c.req.param("url"));
  try {
    new URL(rawUrl);
  } catch {
    return c.json({ error: "Invalid URL" }, 400);
  }
  return c.json(computeScore(rawUrl));
});

app.get("/api/scores", (c) => {
  const scores = computeAllScores();
  return c.json({
    count: scores.length,
    scores,
    computed_at: Date.now(),
  });
});

// --- World ID Protected Route ---

app.post("/api/report", async (c) => {
  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const { url, rating, comment } = body;

  if (!url || typeof url !== "string") {
    return c.json({ error: "url is required (string)" }, 400);
  }
  try {
    new URL(url);
  } catch {
    return c.json({ error: "Invalid URL format" }, 400);
  }
  if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return c.json({ error: "rating must be an integer 1-5" }, 400);
  }
  if (comment !== undefined && comment !== null && typeof comment !== "string") {
    return c.json({ error: "comment must be a string" }, 400);
  }

  const agentkitHeader = c.req.header("agentkit");
  if (!agentkitHeader) {
    return c.json({
      error: "AgentKit header required. Reports are limited to World ID-verified humans.",
      info: "Register at world.org and use @worldcoin/agentkit to send verified requests.",
    }, 401);
  }

  let humanId: string;
  try {
    const payload = parseAgentkitHeader(agentkitHeader);
    const resolved = await agentBook.lookupHuman(payload.address, payload.chainId);
    if (!resolved) {
      return c.json({ error: "World ID verification failed: agent is not backed by a verified human" }, 403);
    }
    humanId = resolved;
  } catch {
    return c.json({ error: "Invalid or malformed AgentKit header" }, 400);
  }

  // Auto-track the endpoint if new
  upsertEndpoint({ url, name: null, description: null, added_at: Date.now() });

  insertReport({
    url,
    human_id: humanId,
    rating: rating as number,
    comment: (comment as string) || null,
    timestamp: Date.now(),
  });

  return c.json({
    success: true,
    message: "Report submitted",
    human_id: humanId,
  });
});

// --- Admin: Add Endpoint to Track ---
// REQUIRES ADMIN_TOKEN. If unset, this endpoint is disabled entirely.

app.post("/api/endpoints", async (c) => {
  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken) {
    return c.json({ error: "Endpoint management is disabled. Set ADMIN_TOKEN to enable." }, 403);
  }

  const auth = c.req.header("authorization");
  if (auth !== `Bearer ${adminToken}`) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const { url, name, description } = body;
  if (!url || typeof url !== "string") {
    return c.json({ error: "url is required" }, 400);
  }

  // Validate URL and block private/internal addresses
  let parsed: URL;
  try {
    parsed = new URL(url as string);
  } catch {
    return c.json({ error: "Invalid URL" }, 400);
  }

  if (parsed.protocol !== "https:") {
    return c.json({ error: "Only HTTPS URLs are allowed" }, 400);
  }

  const blockedHosts = ["localhost", "127.0.0.1", "0.0.0.0", "::1", "169.254.169.254", "metadata.google.internal"];
  if (blockedHosts.includes(parsed.hostname) || parsed.hostname.endsWith(".local") || parsed.hostname.startsWith("10.") || parsed.hostname.startsWith("192.168.")) {
    return c.json({ error: "Internal/private URLs are not allowed" }, 400);
  }

  upsertEndpoint({
    url: url as string,
    name: (name as string) || null,
    description: (description as string) || null,
    added_at: Date.now(),
  });

  return c.json({ success: true, message: `Now tracking ${url}` });
});

// --- Start ---

function start() {
  validateConfig();
  getDb();
  seedEndpoints();
  startProbing(5 * 60 * 1000);

  serve({ fetch: app.fetch, port: PORT }, (info) => {
    console.log(`Trust Oracle running on http://localhost:${info.port}`);
  });
}

process.on("SIGINT", () => {
  console.log("\nShutting down...");
  stopProbing();
  closeDb();
  process.exit(0);
});

process.on("SIGTERM", () => {
  stopProbing();
  closeDb();
  process.exit(0);
});

start();
