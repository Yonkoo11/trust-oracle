import { getEndpoints, insertProbe, upsertEndpoint, pruneOldProbes } from "./db.js";
import type { ProbeResult } from "./types.js";

// Known x402 endpoints to seed on first run
// Mix of facilitators (infrastructure) and resource servers (actual paid services)
const SEED_ENDPOINTS = [
  // Facilitators (payment infrastructure)
  {
    url: "https://x402-worldchain.vercel.app/facilitator/supported",
    name: "Worldchain Facilitator",
    description: "x402 facilitator on Worldchain (Vercel)",
  },
  {
    url: "https://x402.org/facilitator/supported",
    name: "x402.org Facilitator",
    description: "Official x402 facilitator by Coinbase",
  },
  {
    url: "https://api.cdp.coinbase.com/platform/v2/x402/supported",
    name: "CDP x402 Facilitator",
    description: "Coinbase Developer Platform x402 facilitator",
  },
  // Resource servers (actual x402 paid services)
  {
    url: "https://stableenrich.dev/api/v1/health",
    name: "StableEnrich",
    description: "People/org search, LinkedIn, Google Maps via x402",
  },
  {
    url: "https://stablesocial.dev/api/v1/health",
    name: "StableSocial",
    description: "Social media data (Twitter, Instagram, TikTok) via x402",
  },
  {
    url: "https://stablestudio.dev/api/v1/health",
    name: "StableStudio",
    description: "AI image and video generation via x402",
  },
  {
    url: "https://stableupload.dev/api/v1/health",
    name: "StableUpload",
    description: "File hosting and sharing via x402",
  },
  {
    url: "https://stableemail.dev/api/v1/health",
    name: "StableEmail",
    description: "Email sending service via x402",
  },
];

const PROBE_TIMEOUT_MS = 10_000;

// Block probing internal/private addresses
function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    const host = parsed.hostname;
    if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "::1") return false;
    if (host === "169.254.169.254" || host === "metadata.google.internal") return false;
    if (host.endsWith(".local") || host.startsWith("10.") || host.startsWith("192.168.")) return false;
    return true;
  } catch {
    return false;
  }
}

let probeInterval: ReturnType<typeof setInterval> | null = null;
let pruneInterval: ReturnType<typeof setInterval> | null = null;

export function seedEndpoints() {
  const now = Date.now();
  for (const seed of SEED_ENDPOINTS) {
    upsertEndpoint({
      url: seed.url,
      name: seed.name,
      description: seed.description,
      added_at: now,
    });
  }
}

async function probeEndpoint(url: string): Promise<ProbeResult> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

    const resp = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: { "User-Agent": "TrustOracle/1.0" },
    });

    clearTimeout(timeout);

    // Drain response body to free the connection
    await resp.arrayBuffer();

    const latency = Date.now() - start;

    // x402 endpoints return 402 when not paying, that's healthy behavior
    // Only 5xx and network errors indicate a problem
    const success = resp.status >= 200 && resp.status < 500;

    return {
      url,
      timestamp: Date.now(),
      success,
      latency_ms: latency,
      status_code: resp.status,
      error: null,
    };
  } catch (err) {
    return {
      url,
      timestamp: Date.now(),
      success: false,
      latency_ms: Date.now() - start,
      status_code: null,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

async function runProbeRound() {
  const endpoints = getEndpoints();
  if (endpoints.length === 0) return;

  console.log(`[probe] Probing ${endpoints.length} endpoints...`);

  const safeEndpoints = endpoints.filter((ep) => isSafeUrl(ep.url));
  if (safeEndpoints.length < endpoints.length) {
    console.warn(`[probe] Skipped ${endpoints.length - safeEndpoints.length} unsafe URLs`);
  }

  const results = await Promise.allSettled(
    safeEndpoints.map((ep) => probeEndpoint(ep.url))
  );

  let successCount = 0;
  for (const result of results) {
    if (result.status === "fulfilled") {
      insertProbe(result.value);
      if (result.value.success) successCount++;
    }
  }

  console.log(`[probe] Done: ${successCount}/${safeEndpoints.length} healthy`);
}

export function startProbing(intervalMs: number = 5 * 60 * 1000) {
  // Run first probe immediately
  runProbeRound().catch((err) => console.error("[probe] Error:", err));

  // Schedule recurring probes
  probeInterval = setInterval(() => {
    runProbeRound().catch((err) => console.error("[probe] Error:", err));
  }, intervalMs);

  // Prune old data every hour
  pruneInterval = setInterval(() => {
    pruneOldProbes();
  }, 60 * 60 * 1000);

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
  console.log("[probe] Stopped");
}
