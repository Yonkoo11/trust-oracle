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
  parseAgentkitHeader,
} from "@worldcoin/agentkit";

import { getDb, insertReport, upsertEndpoint, getEndpoints, getRecentProbes, closeDb } from "./db.js";
import { computeScore, computeAllScores } from "./score.js";
import { seedEndpoints, startProbing, stopProbing } from "./probe.js";
import { SqliteAgentKitStorage } from "./agentkit-storage.js";
import { isSafeUrl } from "./ssrf.js";

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
const agentKitStorage = new SqliteAgentKitStorage();
const agentKitHooks = createAgentkitHooks({
  storage: agentKitStorage as any, // SqliteAgentKitStorage implements AgentKitStorage
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
app.use("*", secureHeaders({
  crossOriginResourcePolicy: "cross-origin",
}));
app.use("*", cors({
  origin: "*",
  allowMethods: ["GET", "POST", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", "agentkit", "payment-signature", "x-payment", "ngrok-skip-browser-warning"],
  maxAge: 86400,
}));
app.use("*", logger());

// x402 payment middleware.
// Always defer facilitator sync (false). We manually initialize if CDP keys are set.
// This prevents the server from crashing if CDP keys are invalid.
const hasCdpKeys = !!(process.env.CDP_API_KEY_ID && process.env.CDP_API_KEY_SECRET);
app.use(paymentMiddlewareFromHTTPServer(x402HttpServer, undefined, undefined, false));

// Manually initialize the facilitator in the background if keys are present.
// This way the server starts immediately and paid routes become available once initialized.
if (hasCdpKeys) {
  x402HttpServer.initialize().then(() => {
    console.log("[x402] Facilitator initialized. Paid endpoints ready.");
  }).catch((err) => {
    console.error("[x402] Facilitator init failed. Paid endpoints will return 500:", err.message);
  });
}

// Global error handler
app.onError((err, c) => {
  console.error("[error]", err);
  return c.json({ error: "Internal server error" }, 500);
});

// --- Public Routes ---

// Machine-readable API documentation for agent discovery
app.get("/api/docs", (c) => {
  return c.json({
    service: "trust-oracle",
    version: "1.0.0",
    description: "Trust scores for x402 payment endpoints. Probes uptime, latency, and x402 handshake validity. Human quality reports verified by World ID.",
    base_url: c.req.url.replace("/api/docs", ""),
    endpoints: [
      {
        method: "GET",
        path: "/api/health",
        auth: "none",
        price: "free",
        description: "Service health check and configuration status",
      },
      {
        method: "GET",
        path: "/api/summary",
        auth: "none",
        price: "free",
        description: "Dashboard-level overview: endpoint names, trust scores, uptime %. Limited fields.",
      },
      {
        method: "GET",
        path: "/api/score/:url",
        auth: "x402",
        price: "$0.001 USDC",
        network: "eip155:8453",
        description: "Full trust score for a specific endpoint URL. Includes latency metrics, p95, x402 handshake validity, human reports.",
        agentkit: "10 free queries for World ID-verified humans",
      },
      {
        method: "GET",
        path: "/api/scores",
        auth: "x402",
        price: "$0.01 USDC",
        network: "eip155:8453",
        description: "All endpoint scores in bulk. Same detail as /api/score/:url for every tracked endpoint.",
        agentkit: "10 free queries for World ID-verified humans",
      },
      {
        method: "POST",
        path: "/api/report",
        auth: "world-id",
        price: "free",
        description: "Submit a quality report for an endpoint. Requires World ID verification via AgentKit header.",
        body: { url: "string (required)", rating: "integer 1-5 (required)", comment: "string (optional)" },
      },
    ],
    x402: {
      protocol: "x402v2",
      network: "Base mainnet (eip155:8453)",
      asset: "USDC",
      facilitator: "Coinbase CDP",
    },
    links: {
      github: "https://github.com/Yonkoo11/trust-oracle",
      dashboard: "https://trust-oracle.onrender.com",
    },
  });
});

app.get("/", (c) => {
  if (!dashboardHtml) return c.text("Dashboard not available", 404);
  return c.html(dashboardHtml);
});

// Report page (World ID + MetaMask browser flow)
app.get("/report", (c) => {
  const reportHtmlPath = path.join(__dirname, "..", "public", "report.html");
  try {
    const html = fs.readFileSync(reportHtmlPath, "utf-8");
    return c.html(html);
  } catch {
    return c.text("Report page not found", 404);
  }
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

// Dashboard summary: public, shows just enough to render the dashboard.
// Paid /api/scores returns full detail (latency, p95, probe counts, score breakdowns).
app.get("/api/summary", (c) => {
  const scores = computeAllScores();
  const recentProbes = getRecentProbes(20);
  return c.json({
    endpoints: scores.map((s) => ({
      url: s.url,
      name: s.name,
      trust_score: s.trust_score,
      // These are the dashboard-visible fields. No breakdown, no raw probe counts.
      uptime_score: s.uptime_score,
      human_reports: s.human_reports,
      last_probed: s.last_probed,
    })),
    recent_probes: recentProbes.map((p) => ({
      url: p.url,
      timestamp: p.timestamp,
      success: p.success,
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
  upsertEndpoint({ url, name: null, description: null, method: "GET", added_at: Date.now() });

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

  if (!isSafeUrl(url as string)) {
    return c.json({ error: "URL must be HTTPS with a public domain name (no IPs, no internal hosts)" }, 400);
  }

  const method = (body.method as string)?.toUpperCase() === "POST" ? "POST" : "GET";
  upsertEndpoint({
    url: url as string,
    name: (name as string) || null,
    description: (description as string) || null,
    method,
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
