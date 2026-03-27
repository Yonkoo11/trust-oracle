# Trust Oracle - Memory

## Architecture Decisions

- **Hono over Express**: Lighter, faster, better TypeScript support. Direct integration with x402/hono middleware.
- **SQLite over Postgres**: Single-file database, zero deployment friction. Sufficient for hackathon demo. WAL mode for concurrent reads.
- **Vanilla HTML dashboard**: No React needed. Single HTML file served by Hono. Fetches /api/summary every 30s. DOM manipulation via `document.createElement` (no innerHTML for XSS safety).
- **Deferred facilitator init**: Server starts without CDP keys. Facilitator syncs lazily on first paid request. Prevents crash on startup when keys missing.
- **Free-trial mode for World ID**: 10 free queries for human-backed agents via AgentKit, then regular x402 pricing.

## Key Integration Patterns

- x402 paywall: `paymentMiddlewareFromHTTPServer(httpServer, undefined, undefined, false)` with `syncFacilitatorOnStart=false`
- AgentKit: `createAgentkitHooks({ storage, agentBook, mode: { type: "free-trial", uses: 10 } })`
- CDP facilitator: `new HTTPFacilitatorClient(facilitator)` from `@coinbase/x402`
- Network: Base mainnet `eip155:8453`

## Probe Service

- Probes every 5 minutes via setInterval
- 10s timeout per probe
- Records: url, timestamp, success, latency_ms, status_code, error
- Considers 2xx-4xx as "up" (x402 endpoints return 402 when unpaid, which is healthy)

## Trust Score Formula

- trust_score = 0.5 * uptime + 0.2 * latency + 0.3 * human_score
- uptime = successful_probes / total_probes over 24h
- latency_score = linear interpolation: 100ms = 100, 5000ms = 0
- human_score = avg(ratings) * 20, neutral (50) when no reports
