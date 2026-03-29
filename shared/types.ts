// Canonical type definitions shared between server and xmtp-agent.
// Server (server/src/types.ts) re-declares these. Keep in sync.

export interface ProbeResult {
  url: string;
  timestamp: number;
  success: boolean;
  latency_ms: number | null;
  status_code: number | null;
  error: string | null;
  has_x402: boolean;
  x402_version: number | null;
  x402_network: string | null;
  x402_price: string | null;
}

export interface Report {
  url: string;
  human_id: string;
  rating: number;
  comment: string | null;
  timestamp: number;
}

export interface Endpoint {
  url: string;
  name: string | null;
  description: string | null;
  method: string;
  added_at: number;
}

export interface TrustScore {
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
  x402_valid_rate: number;
  x402_network: string | null;
  x402_price: string | null;
}

// Free /api/summary response (limited fields)
export interface SummaryEndpoint {
  url: string;
  name: string | null;
  trust_score: number;
  uptime_score: number;
  human_reports: number;
  last_probed: number | null;
}

export interface SummaryProbe {
  url: string;
  timestamp: number;
  success: boolean;
}

export interface SummaryResponse {
  endpoints: SummaryEndpoint[];
  recent_probes: SummaryProbe[];
  updated_at: number;
}
