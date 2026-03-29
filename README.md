# Trust Oracle

Trust scores for x402 payment endpoints. Agents pay USDC to query reliability data. Humans report quality issues verified by World ID.

**Live:** [trust-oracle.onrender.com](https://trust-oracle.onrender.com)
**Source:** [github.com/Yonkoo11/trust-oracle](https://github.com/Yonkoo11/trust-oracle)

## The Problem

AI agents pay for API calls via x402 with zero visibility into service reliability. An endpoint that was up yesterday might be down today, or its x402 payment handshake might be broken. There's no way to check before spending tokens. Agents need a trust layer.

## How It Works

1. **Probe service** pings x402 endpoints every 5 minutes using the correct HTTP method (GET/POST). Records uptime, latency, and validates the x402v2 payment-required header (version, network, price).
2. **Trust score** combines uptime (70%) and latency (30%). When human reports are available, weights shift to 50/20/30 uptime/latency/human.
3. **Agents query scores** by paying $0.001 USDC per endpoint via x402 on Base mainnet.
4. **Humans report issues** for free using World ID verification (Sybil-resistant).
5. **XMTP bot** lets agents query basic scores via messaging.

## API

| Endpoint | Auth | Price | Description |
|----------|------|-------|-------------|
| `GET /api/health` | None | Free | Service status |
| `GET /api/docs` | None | Free | Machine-readable API docs for agent discovery |
| `GET /api/summary` | None | Free | Dashboard data (limited fields) |
| `GET /api/score/:url` | x402 | $0.001 USDC | Full trust score with latency, p95, x402 handshake validity |
| `GET /api/scores` | x402 | $0.01 USDC | All endpoint scores in bulk |
| `POST /api/report` | World ID | Free | Submit quality report (AgentKit header required) |

World ID-verified agents get 10 free queries before x402 pricing.

### Example: Paid score response

```json
{
  "url": "https://stableenrich.dev/api/exa/search",
  "name": "StableEnrich - Exa Search",
  "trust_score": 93,
  "uptime_score": 100,
  "latency_score": 80,
  "human_score": 0,
  "total_probes_24h": 288,
  "successful_probes_24h": 288,
  "avg_latency_ms": 612,
  "p95_latency_ms": 1100,
  "human_reports": 0,
  "last_probed": 1743400000000,
  "x402_valid_rate": 100,
  "x402_network": "eip155:8453",
  "x402_price": "10000"
}
```

The free `/api/summary` only returns: url, name, trust_score, uptime_score, human_reports, last_probed.

## Running Locally

```bash
cd server
npm install

# Create .env (see env.example for all variables)
# Required: CDP_API_KEY_ID, CDP_API_KEY_SECRET, PAY_TO
npm run dev
# http://localhost:3000

# Run tests
npm test
```

### XMTP Agent (requires Node 22+)

```bash
cd xmtp-agent
npm install

# Set: XMTP_WALLET_KEY, XMTP_DB_ENCRYPTION_KEY, TRUST_ORACLE_URL
npm run dev
```

## Deploy

Docker:
```bash
docker build -t trust-oracle .
docker run -p 3000:3000 \
  -e CDP_API_KEY_ID=... \
  -e CDP_API_KEY_SECRET=... \
  -e PAY_TO=0x... \
  trust-oracle
```

Currently deployed on Render. Self-pings every 10 min to prevent free-tier sleep.

## Trust Score Algorithm

```
if no probes:     score = 0 (unknown)
if no reports:    score = 0.7 * uptime + 0.3 * latency
with reports:     score = 0.5 * uptime + 0.2 * latency + 0.3 * human

uptime    = successful_probes / total_probes (24h window)
latency   = inverse of p95 (100ms=100, 5000ms=0, no data=0)
human     = avg(rating) * 20 (1-5 stars mapped to 20-100)
```

Probes also validate x402 handshake quality: does the endpoint return a valid x402v2 payment-required header with correct network and pricing?

## Security

- SSRF protection: HTTPS-only, blocks all IP address formats (IPv4, hex, octal, decimal, IPv6), .local/.internal domains, cloud metadata endpoints
- Admin endpoint (`POST /api/endpoints`) disabled without ADMIN_TOKEN
- World ID prevents Sybil report spam (one person, one vote)
- x402 prevents query spam (costs USDC)
- Secure headers (HSTS, X-Content-Type-Options, etc) with cross-origin resource policy for API consumers
- AgentKit free-trial counters persisted to SQLite (survive restarts)

## Tech Stack

| Component | Tech |
|-----------|------|
| Server | Hono, @hono/node-server |
| Payments | x402 v2 on Base mainnet (USDC) |
| Identity | World ID AgentKit (free-trial, 10 uses) |
| Database | SQLite (better-sqlite3, WAL mode) |
| Messaging | XMTP agent-sdk |
| Tests | Vitest (32 tests) |
| Deploy | Docker, Render |

## World x Coinbase Hackathon

Built for the World x Coinbase hackathon (March 26-29, 2026).

**Required tech:** x402 (payment), World ID AgentKit (human verification), XMTP (messaging)
