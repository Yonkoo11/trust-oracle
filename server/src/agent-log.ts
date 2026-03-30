import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_PATH = path.join(__dirname, "..", "data", "agent_log.json");
const MAX_ENTRIES = 100;

export interface AgentAction {
  type: "probe" | "score_compute" | "reputation_submit" | "identity_register" | "guardrail_check" | "budget_check";
  endpoint?: string;
  result?: string;
  latency_ms?: number;
  x402_valid?: boolean;
  score?: number;
  tx_hash?: string;
  agent_id?: number;
  detail?: string;
}

export interface BudgetSnapshot {
  probes_this_cycle: number;
  probes_today: number;
  max_daily_probes: number;
  gas_spent_today_wei: string;
  max_daily_gas_wei: string;
  budget_remaining_pct: number;
}

export interface GuardrailSnapshot {
  ssrf_blocked: number;
  timeout_retries: number;
  circuit_breaker_active: boolean;
  budget_ok: boolean;
  gas_price_ok: boolean;
}

export interface AgentLogEntry {
  cycle_id: string;
  timestamp: string;
  phase: "discover" | "plan" | "execute" | "verify" | "submit";
  actions: AgentAction[];
  budget: BudgetSnapshot;
  guardrails: GuardrailSnapshot;
  duration_ms: number;
}

// In-memory ring buffer
const logEntries: AgentLogEntry[] = [];

export function addLogEntry(entry: AgentLogEntry) {
  logEntries.push(entry);
  if (logEntries.length > MAX_ENTRIES) {
    logEntries.shift();
  }
  persistLog();
}

export function getLogEntries(limit?: number): AgentLogEntry[] {
  if (limit) {
    return logEntries.slice(-limit);
  }
  return [...logEntries];
}

export function generateCycleId(): string {
  return crypto.randomUUID();
}

function persistLog() {
  try {
    const dir = path.dirname(LOG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(LOG_PATH, JSON.stringify(logEntries, null, 2));
  } catch (err) {
    console.error("[agent-log] Failed to persist:", err instanceof Error ? err.message : err);
  }
}

// Load previous entries on startup
export function loadLog() {
  try {
    if (fs.existsSync(LOG_PATH)) {
      const data = JSON.parse(fs.readFileSync(LOG_PATH, "utf-8"));
      if (Array.isArray(data)) {
        logEntries.length = 0;
        // Keep only last MAX_ENTRIES
        const recent = data.slice(-MAX_ENTRIES);
        logEntries.push(...recent);
        console.log(`[agent-log] Loaded ${logEntries.length} previous entries`);
      }
    }
  } catch {
    console.log("[agent-log] No previous log found, starting fresh");
  }
}
