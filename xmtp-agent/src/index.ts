import { Agent } from "@xmtp/agent-sdk";
import type { MessageContext } from "@xmtp/agent-sdk";

// --- Config ---

const TRUST_ORACLE_URL = process.env.TRUST_ORACLE_URL ?? "http://localhost:3000";

// --- Types (mirroring server/src/types.ts) ---

interface TrustScore {
  url: string;
  name: string | null;
  trust_score: number;
  uptime_score: number;
  latency_score: number;
  human_score: number;
  total_probes_24h: number;
  successful_probes_24h: number;
  avg_latency_ms: number | null;
  p95_latency_ms: number | null;
  human_reports: number;
  last_probed: number | null;
}

interface SummaryResponse {
  endpoints: TrustScore[];
  recent_probes: unknown[];
  updated_at: number;
}

// --- Oracle API ---

async function fetchSummary(): Promise<SummaryResponse> {
  const res = await fetch(`${TRUST_ORACLE_URL}/api/summary`);
  if (!res.ok) {
    throw new Error(`Trust Oracle responded ${res.status}: ${res.statusText}`);
  }
  return res.json() as Promise<SummaryResponse>;
}

// --- Formatters ---

function trustBar(score: number): string {
  const filled = Math.round(score / 10);
  return "█".repeat(filled) + "░".repeat(10 - filled);
}

function formatScore(ep: TrustScore): string {
  const name = ep.name ? `${ep.name} (${ep.url})` : ep.url;
  const lastProbed = ep.last_probed
    ? new Date(ep.last_probed).toISOString().replace("T", " ").slice(0, 19) + " UTC"
    : "never";

  const latency = ep.avg_latency_ms !== null
    ? `avg ${ep.avg_latency_ms}ms / p95 ${ep.p95_latency_ms ?? "?"}ms`
    : "no data";

  return [
    `📊 Trust Score: ${ep.trust_score}/100 [${trustBar(ep.trust_score)}]`,
    `🔗 ${name}`,
    ``,
    `  Uptime:  ${ep.uptime_score}/100  (${ep.successful_probes_24h}/${ep.total_probes_24h} probes in 24h)`,
    `  Latency: ${ep.latency_score}/100  (${latency})`,
    `  Human:   ${ep.human_score}/100  (${ep.human_reports} report${ep.human_reports !== 1 ? "s" : ""})`,
    ``,
    `  Last probed: ${lastProbed}`,
  ].join("\n");
}

function formatListRow(ep: TrustScore): string {
  const bar = trustBar(ep.trust_score);
  const label = ep.name ?? ep.url;
  const truncated = label.length > 40 ? label.slice(0, 37) + "..." : label.padEnd(40);
  return `${ep.trust_score.toString().padStart(3)}/100 [${bar}] ${truncated}`;
}

function helpText(): string {
  return [
    "Trust Oracle — x402 endpoint reliability scores",
    "",
    "Commands:",
    "  score <url>  — trust score for a specific endpoint URL",
    "  list         — all tracked endpoints with scores",
    "  help         — show this message",
    "",
    `Oracle: ${TRUST_ORACLE_URL}`,
  ].join("\n");
}

// --- Command Handlers ---

async function handleScore(url: string): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return `Invalid URL: "${url}"\nUsage: score <url>  (e.g. score https://api.example.com/v1/pay)`;
  }

  const summary = await fetchSummary();
  const ep = summary.endpoints.find((e) => e.url === parsed.href || e.url === url);

  if (!ep) {
    return [
      `No data for: ${url}`,
      "",
      `This endpoint is not yet tracked. Known endpoints: ${summary.endpoints.length}`,
      `Try: list`,
    ].join("\n");
  }

  return formatScore(ep);
}

async function handleList(): Promise<string> {
  const summary = await fetchSummary();

  if (summary.endpoints.length === 0) {
    return "No endpoints tracked yet.";
  }

  const rows = summary.endpoints
    .slice()
    .sort((a, b) => b.trust_score - a.trust_score)
    .map(formatListRow);

  return [
    `Trust Oracle — ${summary.endpoints.length} endpoint${summary.endpoints.length !== 1 ? "s" : ""} tracked`,
    "",
    ...rows,
    "",
    `Updated: ${new Date(summary.updated_at).toISOString().replace("T", " ").slice(0, 19)} UTC`,
  ].join("\n");
}

// --- Middleware ---

async function messageHandler(ctx: MessageContext<unknown>, next: () => Promise<void> | void): Promise<void> {
  if (!ctx.isText()) {
    await next();
    return;
  }

  const raw = (ctx.message.content as string).trim();
  const lower = raw.toLowerCase();

  let reply: string;

  try {
    if (lower === "help" || lower === "?" || lower === "/help") {
      reply = helpText();
    } else if (lower === "list" || lower === "/list") {
      reply = await handleList();
    } else if (lower.startsWith("score ") || lower.startsWith("/score ")) {
      const url = raw.replace(/^\/?(score\s+)/i, "").trim();
      reply = await handleScore(url);
    } else {
      reply = `I don't recognize that command. Send "help" to see what I can do.`;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    reply = `Error querying Trust Oracle: ${msg}`;
  }

  await ctx.sendTextReply(reply);
}

// --- Entry Point ---

async function main(): Promise<void> {
  console.log(`Trust Oracle XMTP Agent starting...`);
  console.log(`Oracle URL: ${TRUST_ORACLE_URL}`);

  // Validate required env vars before attempting to connect
  if (!process.env.XMTP_WALLET_KEY) {
    console.error("XMTP_WALLET_KEY is required");
    process.exit(1);
  }
  if (!process.env.XMTP_DB_ENCRYPTION_KEY) {
    console.error("XMTP_DB_ENCRYPTION_KEY is required (64 hex chars)");
    process.exit(1);
  }

  const agent = await Agent.createFromEnv();

  console.log(`Agent address: ${agent.address}`);
  console.log(`XMTP env: ${process.env.XMTP_ENV ?? "production"}`);

  agent.use(messageHandler);

  agent.errors.use(async (err, _ctx, next) => {
    console.error("Agent error:", err);
    await next();
  });

  agent.on("start", () => {
    console.log("Agent streaming started — listening for messages");
  });

  agent.on("stop", () => {
    console.log("Agent stopped");
  });

  process.on("SIGINT", async () => {
    console.log("\nShutting down...");
    await agent.stop();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    await agent.stop();
    process.exit(0);
  });

  await agent.start();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
