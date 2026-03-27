# Trust Oracle

Trust scores for x402 payment endpoints. Agents pay USDC to query reliability data. Humans report quality issues verified by World ID.

**Live dashboard:** [yonkoo11.github.io/trust-oracle](https://yonkoo11.github.io/trust-oracle/)

## The Problem

AI agents pay for API calls via x402 with zero visibility into service reliability. An endpoint that was up yesterday might be down today. There's no Yelp for agent services, no uptime page, no way to compare. Agents spend tokens on services that fail silently.

## How It Works

1. **Probe service** pings x402 endpoints every 5 minutes, records uptime and latency
2. **Trust score** combines uptime (70%), latency (30%), and human reports when available
3. **Agents query scores** by paying $0.001 USDC per endpoint via x402
4. **Humans report issues** for free using World ID verification (no Sybil attacks)
5. **XMTP bot** lets agents query scores via messaging

## Architecture

```
Agent ──x402 payment──> Trust Oracle Server ──> Trust Score Response
                              │
Human ──World ID──> Report endpoint quality
                              │
Probe Service ──5min──> Ping all tracked endpoints
                              │
XMTP Agent ──> Query server, respond to messages
```

## Tech Stack

| Component | Tech |
|-----------|------|
| Server | Hono + @hono/node-server |
| Payments | x402 v2 on Base mainnet (USDC) |
| Identity | World ID AgentKit (free-trial, 10 uses) |
| Database | SQLite (better-sqlite3, WAL mode) |
| Messaging | XMTP agent-sdk |
| Dashboard | Vanilla HTML/JS (GitHub Pages) |

## API

| Endpoint | Auth | Price |
|----------|------|-------|
| `GET /api/health` | Public | Free |
| `GET /api/summary` | Public | Free (limited data) |
| `GET /api/score/:url` | x402 | $0.001 USDC |
| `GET /api/scores` | x402 | $0.01 USDC |
| `POST /api/report` | World ID | Free |
| `POST /api/endpoints` | Admin token | Free |

World ID-verified agents get 10 free queries before x402 kicks in.

## Running Locally

```bash
cd server
npm install

# Create .env from the example
cp env.example .env
# Fill in: CDP_API_KEY_ID, CDP_API_KEY_SECRET, PAY_TO

npm run dev
# Dashboard: http://localhost:3000
# Health: http://localhost:3000/api/health
```

### XMTP Agent

```bash
cd xmtp-agent
npm install

# Set env vars: XMTP_WALLET_KEY, XMTP_DB_ENCRYPTION_KEY
npm run dev
```

## Deploy

Docker:
```bash
docker build -t trust-oracle .
docker run -p 3000:3000 --env-file server/.env trust-oracle
```

The GitHub Pages dashboard connects to any deployed instance via `?api=https://your-server.com`.

## Trust Score Algorithm

```
if no probes:     score = 0 (unknown)
if no reports:    score = 0.7 * uptime + 0.3 * latency
with reports:     score = 0.5 * uptime + 0.2 * latency + 0.3 * human

uptime  = successful_probes / total_probes (24h window)
latency = inverse of p95 (100ms=100, 5000ms=0)
human   = avg_rating * 20 (1-5 stars mapped to 20-100)
```

## Security

- SSRF protection: only HTTPS, blocks private/internal IPs
- Admin endpoint disabled without ADMIN_TOKEN
- World ID prevents Sybil report spam
- x402 prevents query spam (costs money)
- Secure headers, CORS configured

## World x Coinbase Hackathon

Built for the World x Coinbase hackathon (March 26-29, 2026).

**Required tech:** x402, World ID AgentKit, XMTP

**Tracks:** x402 payments + World ID human verification + XMTP messaging
