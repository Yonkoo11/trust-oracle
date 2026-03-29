import { getEndpoints, getProbes24h, getReports } from "./db.js";
import type { TrustScore } from "./types.js";

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

export function computeLatencyScore(p95: number | null): number {
  if (p95 === null || p95 === 0) return 0;
  const clamped = Math.max(100, Math.min(5000, p95));
  return Math.round(((5000 - clamped) / 4900) * 100);
}

export function computeScore(url: string): TrustScore {
  const endpoints = getEndpoints();
  const endpoint = endpoints.find((e) => e.url === url);
  const probes = getProbes24h(url);
  const reports = getReports(url);

  const totalProbes = probes.length;
  const successfulProbes = probes.filter((p) => p.success).length;
  const uptimeScore = totalProbes > 0 ? Math.round((successfulProbes / totalProbes) * 100) : 0;

  const latencies = probes
    .filter((p) => p.latency_ms !== null && p.success)
    .map((p) => p.latency_ms!)
    .sort((a, b) => a - b);

  const avgLatency = latencies.length > 0
    ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
    : null;
  const p95Latency = latencies.length > 0 ? percentile(latencies, 95) : null;
  const latencyScore = computeLatencyScore(p95Latency);

  // x402 handshake quality: what % of 402 responses had valid x402v2 headers?
  const probesWithX402Check = probes.filter((p) => p.status_code === 402);
  const validX402Count = probesWithX402Check.filter((p) => p.has_x402).length;
  const x402ValidRate = probesWithX402Check.length > 0
    ? Math.round((validX402Count / probesWithX402Check.length) * 100)
    : 0;

  // Most recent x402 metadata
  const latestX402Probe = probes.find((p) => p.has_x402);

  const humanReportCount = reports.length;
  const hasHumanData = humanReportCount > 0;
  const humanScore = hasHumanData
    ? Math.round((reports.reduce((sum, r) => sum + r.rating, 0) / humanReportCount) * 20)
    : 0;

  // Trust score formula
  let trustScore: number;
  if (totalProbes === 0) {
    trustScore = 0;
  } else if (hasHumanData) {
    trustScore = Math.round(0.5 * uptimeScore + 0.2 * latencyScore + 0.3 * humanScore);
  } else {
    trustScore = Math.round(0.7 * uptimeScore + 0.3 * latencyScore);
  }

  return {
    url,
    name: endpoint?.name ?? null,
    trust_score: trustScore,
    uptime_score: uptimeScore,
    latency_score: latencyScore,
    human_score: humanScore,
    total_probes_24h: totalProbes,
    successful_probes_24h: successfulProbes,
    avg_latency_ms: avgLatency,
    p95_latency_ms: p95Latency,
    human_reports: humanReportCount,
    last_probed: probes.length > 0 ? probes[0].timestamp : null,
    x402_valid_rate: x402ValidRate,
    x402_network: latestX402Probe?.x402_network ?? null,
    x402_price: latestX402Probe?.x402_price ?? null,
  };
}

export function computeAllScores(): TrustScore[] {
  return getEndpoints().map((ep) => computeScore(ep.url));
}
