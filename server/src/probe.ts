import { getEndpoints, insertProbe, upsertEndpoint, pruneOldProbes } from "./db.js";
import type { ProbeResult } from "./types.js";
import { isSafeUrl } from "./ssrf.js";
import { computeAllScores } from "./score.js";
import {
  addLogEntry,
  generateCycleId,
  type AgentAction,
  type AgentLogEntry,
} from "./agent-log.js";
import {
  checkPreProbe,
  recordProbeCount,
  recordCycleResult,
  getGuardrailStatus,
} from "./guardrails.js";
import { submitReputation, type ReputationSubmission } from "./agent-reputation.js";
import { getCachedAgentId } from "./agent-identity.js";

// Known x402 endpoints to seed on first run.
// These are actual x402-protected paths that return 402 with payment headers.
const SEED_ENDPOINTS = [
  // Facilitators (payment infrastructure health)
  {
    url: "https://x402-worldchain.vercel.app/facilitator/supported",
    name: "Worldchain Facilitator",
    description: "x402 facilitator on Worldchain",
    method: "GET",
  },
  {
    url: "https://x402.org/facilitator/supported",
    name: "x402.org Facilitator",
    description: "Official x402 facilitator by Coinbase",
    method: "GET",
  },
  // x402 resource servers (actual paid endpoints -- should return 402)
  {
    url: "https://stableenrich.dev/api/exa/search",
    name: "StableEnrich - Exa Search",
    description: "Neural web search via x402 ($0.01)",
    method: "POST",
  },
  {
    url: "https://stableenrich.dev/api/firecrawl/scrape",
    name: "StableEnrich - Firecrawl",
    description: "Web scraping with JS rendering via x402 ($0.013)",
    method: "POST",
  },
  {
    url: "https://stableenrich.dev/api/apollo/people-search",
    name: "StableEnrich - Apollo Search",
    description: "People search via x402 ($0.02)",
    method: "POST",
  },
  {
    url: "https://stablestudio.dev/api/generate/nano-banana/generate",
    name: "StableStudio - Nano Banana",
    description: "AI image generation via x402",
    method: "POST",
  },
  {
    url: "https://stablestudio.dev/api/upload",
    name: "StableStudio - Upload",
    description: "File upload via x402 ($0.01)",
    method: "POST",
  },
  {
    url: "https://stableenrich.dev/api/reddit/search",
    name: "StableEnrich - Reddit",
    description: "Reddit search via x402 ($0.02)",
    method: "POST",
  },
];

const PROBE_TIMEOUT_MS = 10_000;

let probeInterval: ReturnType<typeof setInterval> | null = null;
let pruneInterval: ReturnType<typeof setInterval> | null = null;
let keepAliveInterval: ReturnType<typeof setInterval> | null = null;

export function seedEndpoints() {
  const now = Date.now();
  for (const seed of SEED_ENDPOINTS) {
    upsertEndpoint({
      url: seed.url,
      name: seed.name,
      description: seed.description,
      method: seed.method,
      added_at: now,
    });
  }
}

// Parse x402 payment-required header (base64-encoded JSON)
export function parseX402Header(header: string | null): {
  version: number | null;
  network: string | null;
  price: string | null;
} {
  if (!header) return { version: null, network: null, price: null };
  try {
    const decoded = JSON.parse(Buffer.from(header, "base64").toString("utf-8"));
    const version = decoded.x402Version ?? null;
    const firstAccept = decoded.accepts?.[0];
    const network = firstAccept?.network ?? null;
    const price = firstAccept?.amount ?? null;
    return { version, network, price };
  } catch {
    return { version: null, network: null, price: null };
  }
}

async function probeEndpoint(url: string, method: string = "GET"): Promise<ProbeResult> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

    const resp = await fetch(url, {
      method,
      signal: controller.signal,
      headers: {
        "User-Agent": "TrustOracle/1.0",
        ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
      },
      ...(method === "POST" ? { body: "{}" } : {}),
    });

    clearTimeout(timeout);

    // Drain response body to free the connection
    await resp.arrayBuffer();

    const latency = Date.now() - start;

    // x402 endpoints return 402 when not paying, that's healthy behavior
    // Only 5xx and network errors indicate a problem
    const success = resp.status >= 200 && resp.status < 500;

    // Check for x402 payment-required header
    const paymentHeader = resp.headers.get("payment-required");
    const x402 = parseX402Header(paymentHeader);
    const hasX402 = resp.status === 402 && x402.version !== null;

    return {
      url,
      timestamp: Date.now(),
      success,
      latency_ms: latency,
      status_code: resp.status,
      error: null,
      has_x402: hasX402,
      x402_version: x402.version,
      x402_network: x402.network,
      x402_price: x402.price,
    };
  } catch (err) {
    return {
      url,
      timestamp: Date.now(),
      success: false,
      latency_ms: Date.now() - start,
      status_code: null,
      error: err instanceof Error ? err.message : "Unknown error",
      has_x402: false,
      x402_version: null,
      x402_network: null,
      x402_price: null,
    };
  }
}

// Autonomous execution cycle: discover -> plan -> execute -> verify -> submit
async function runAgentCycle() {
  const cycleStart = Date.now();
  const cycleId = generateCycleId();
  const actions: AgentAction[] = [];

  // --- PHASE 1: DISCOVER ---
  const endpoints = getEndpoints();
  if (endpoints.length === 0) return;

  // --- PHASE 2: PLAN (guardrail check) ---
  const guardrailCheck = checkPreProbe();
  actions.push({
    type: "guardrail_check",
    result: guardrailCheck.safe ? "pass" : "blocked",
    detail: guardrailCheck.reason,
  });

  if (!guardrailCheck.safe) {
    console.warn(`[agent] Cycle ${cycleId} blocked: ${guardrailCheck.reason}`);
    const status = getGuardrailStatus();
    addLogEntry({
      cycle_id: cycleId,
      timestamp: new Date().toISOString(),
      phase: "plan",
      actions,
      budget: {
        probes_this_cycle: 0,
        probes_today: status.probes_today,
        max_daily_probes: status.max_daily_probes,
        gas_spent_today_wei: "0",
        max_daily_gas_wei: "0",
        budget_remaining_pct: status.budget_remaining_pct,
      },
      guardrails: {
        ssrf_blocked: 0,
        timeout_retries: 0,
        circuit_breaker_active: status.circuit_breaker_active,
        budget_ok: false,
        gas_price_ok: true,
      },
      duration_ms: Date.now() - cycleStart,
    });
    return;
  }

  // --- PHASE 3: EXECUTE (probe endpoints) ---
  const safeEndpoints = endpoints.filter((ep) => isSafeUrl(ep.url));
  const ssrfBlocked = endpoints.length - safeEndpoints.length;
  if (ssrfBlocked > 0) {
    actions.push({ type: "guardrail_check", result: "ssrf_blocked", detail: `${ssrfBlocked} endpoints blocked` });
  }

  console.log(`[agent] Cycle ${cycleId}: probing ${safeEndpoints.length} endpoints...`);

  const results = await Promise.allSettled(
    safeEndpoints.map((ep) => probeEndpoint(ep.url, ep.method))
  );

  let successCount = 0;
  for (const result of results) {
    if (result.status === "fulfilled") {
      insertProbe(result.value);
      if (result.value.success) successCount++;
      actions.push({
        type: "probe",
        endpoint: result.value.url,
        result: result.value.success ? "success" : "fail",
        latency_ms: result.value.latency_ms ?? undefined,
        x402_valid: result.value.has_x402,
      });
    }
  }

  recordProbeCount(safeEndpoints.length);
  const allFailed = successCount === 0 && safeEndpoints.length > 0;
  recordCycleResult(allFailed);

  // --- PHASE 4: VERIFY (compute scores) ---
  const scores = computeAllScores();
  for (const score of scores) {
    actions.push({
      type: "score_compute",
      endpoint: score.url,
      score: score.trust_score,
    });
  }

  // --- PHASE 5: SUBMIT (reputation on-chain, rate-limited to 1/hour) ---
  const agentId = getCachedAgentId();
  if (agentId !== null && scores.length > 0) {
    const submissions: ReputationSubmission[] = scores.map((s) => ({
      endpointUrl: s.url,
      trustScore: s.trust_score,
      feedbackUri: `https://trust-oracle.onrender.com/agent_log.json`,
    }));

    try {
      const repResult = await submitReputation(submissions);
      if (repResult) {
        actions.push({
          type: "reputation_submit",
          agent_id: Number(agentId),
          tx_hash: repResult.txHash,
          detail: `Submitted ${repResult.count} feedback(s)`,
        });
      }
    } catch (err) {
      actions.push({
        type: "reputation_submit",
        result: "fail",
        detail: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  // --- LOG ---
  const status = getGuardrailStatus();
  const entry: AgentLogEntry = {
    cycle_id: cycleId,
    timestamp: new Date().toISOString(),
    phase: "submit",
    actions,
    budget: {
      probes_this_cycle: safeEndpoints.length,
      probes_today: status.probes_today,
      max_daily_probes: status.max_daily_probes,
      gas_spent_today_wei: "0",
      max_daily_gas_wei: "0",
      budget_remaining_pct: status.budget_remaining_pct,
    },
    guardrails: {
      ssrf_blocked: ssrfBlocked,
      timeout_retries: 0,
      circuit_breaker_active: status.circuit_breaker_active,
      budget_ok: true,
      gas_price_ok: true,
    },
    duration_ms: Date.now() - cycleStart,
  };
  addLogEntry(entry);

  console.log(`[agent] Cycle ${cycleId}: ${successCount}/${safeEndpoints.length} healthy (${entry.duration_ms}ms)`);
}

export function startProbing(intervalMs: number = 5 * 60 * 1000) {
  // Run first agent cycle immediately
  runAgentCycle().catch((err) => console.error("[agent] Cycle error:", err));

  // Schedule recurring autonomous cycles
  probeInterval = setInterval(() => {
    runAgentCycle().catch((err) => console.error("[agent] Cycle error:", err));
  }, intervalMs);

  // Prune old data every hour
  pruneInterval = setInterval(() => {
    pruneOldProbes();
  }, 60 * 60 * 1000);

  // Self-ping to prevent Render/free-tier sleep (every 10 min)
  const selfUrl = process.env.RENDER_EXTERNAL_URL || process.env.SELF_URL;
  if (selfUrl) {
    keepAliveInterval = setInterval(() => {
      fetch(`${selfUrl}/api/health`).catch(() => {});
    }, 10 * 60 * 1000);
    console.log(`[probe] Keep-alive enabled for ${selfUrl}`);
  }

  console.log(`[probe] Started with ${intervalMs / 1000}s interval`);
}

export function stopProbing() {
  if (probeInterval) {
    clearInterval(probeInterval);
    probeInterval = null;
  }
  if (pruneInterval) {
    clearInterval(pruneInterval);
    pruneInterval = null;
  }
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
  console.log("[probe] Stopped");
}
