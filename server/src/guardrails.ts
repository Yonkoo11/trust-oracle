import { getEndpoints } from "./db.js";
import { isSafeUrl } from "./ssrf.js";
import { attemptOwsPolicy, getOwsWalletInfo } from "./ows-wallet.js";

export interface GuardrailResult {
  safe: boolean;
  reason?: string;
}

// Configurable limits
const MAX_DAILY_PROBES = parseInt(process.env.MAX_DAILY_PROBES || "500");
const MAX_GAS_GWEI = parseInt(process.env.MAX_GAS_GWEI || "100");

// State tracking
let probesToday = 0;
let consecutiveFailures = 0;
let lastResetDate = new Date().toDateString();
let circuitBreakerActive = false;

export function resetDailyCounters() {
  const today = new Date().toDateString();
  if (today !== lastResetDate) {
    probesToday = 0;
    lastResetDate = today;
  }
}

export function recordProbeCount(count: number) {
  resetDailyCounters();
  probesToday += count;
}

export function recordCycleResult(allFailed: boolean) {
  if (allFailed) {
    consecutiveFailures++;
    if (consecutiveFailures >= 3) {
      circuitBreakerActive = true;
      console.error("[guardrails] Circuit breaker ACTIVE: 3 consecutive full-cycle failures");
    }
  } else {
    consecutiveFailures = 0;
    if (circuitBreakerActive) {
      circuitBreakerActive = false;
      console.log("[guardrails] Circuit breaker reset");
    }
  }
}

export function checkPreProbe(): GuardrailResult {
  resetDailyCounters();

  if (circuitBreakerActive) {
    return { safe: false, reason: "Circuit breaker active: 3 consecutive probe cycles failed completely" };
  }

  const endpoints = getEndpoints();
  if (probesToday + endpoints.length > MAX_DAILY_PROBES) {
    return { safe: false, reason: `Daily probe limit reached: ${probesToday}/${MAX_DAILY_PROBES}` };
  }

  // Validate all endpoints
  const unsafeCount = endpoints.filter((ep) => !isSafeUrl(ep.url)).length;
  if (unsafeCount === endpoints.length && endpoints.length > 0) {
    return { safe: false, reason: "All endpoints failed SSRF validation" };
  }

  return { safe: true };
}

export async function checkPreTransaction(gasPrice?: bigint): Promise<GuardrailResult> {
  if (gasPrice && gasPrice > BigInt(MAX_GAS_GWEI) * 1_000_000_000n) {
    return { safe: false, reason: `Gas price ${gasPrice} exceeds max ${MAX_GAS_GWEI} gwei` };
  }
  return { safe: true };
}

export function initGuardrailPolicies() {
  attemptOwsPolicy();
}

export function getGuardrailStatus() {
  resetDailyCounters();
  const owsInfo = getOwsWalletInfo();
  return {
    probes_today: probesToday,
    max_daily_probes: MAX_DAILY_PROBES,
    consecutive_failures: consecutiveFailures,
    circuit_breaker_active: circuitBreakerActive,
    budget_remaining_pct: Math.round((1 - probesToday / MAX_DAILY_PROBES) * 100),
    ows_policy: owsInfo.policy,
  };
}
