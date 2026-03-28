// Shared types between server and xmtp-agent.
// If you change these, update both consumers.

export interface ProbeResult {
  url: string;
  timestamp: number;
  success: boolean;
  latency_ms: number | null;
  status_code: number | null;
  error: string | null;
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
}

// The free /api/summary response shape (limited fields)
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
