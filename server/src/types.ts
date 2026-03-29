// Canonical types. XMTP agent mirrors these from shared/types.ts.
// If you change these, update shared/types.ts and xmtp-agent/src/index.ts.

export interface ProbeResult {
  url: string;
  timestamp: number;
  success: boolean;
  latency_ms: number | null;
  status_code: number | null;
  error: string | null;
  // x402-specific probe data
  has_x402: boolean;           // Did the endpoint return a valid x402 payment-required header?
  x402_version: number | null; // x402 protocol version (1 or 2)
  x402_network: string | null; // Payment network (e.g. "eip155:8453")
  x402_price: string | null;   // Price string (e.g. "1000" in smallest unit)
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
  method: string; // HTTP method for probing (GET or POST)
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
  // x402 handshake quality
  x402_valid_rate: number;      // % of 402 responses with valid x402v2 headers
  x402_network: string | null;  // Most recent payment network
  x402_price: string | null;    // Most recent price
}
