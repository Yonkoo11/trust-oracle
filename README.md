# Trust Oracle

Autonomous ERC-8004 agent that probes x402 payment endpoints, computes trust scores, and publishes reputation data on-chain. No human intervention after launch.

**Live:** [trust-oracle.onrender.com](https://trust-oracle.onrender.com) | **Agent #30:** [Polygonscan](https://amoy.polygonscan.com/address/0xf9946775891a24462cD4ec885d0D4E2675C84355) | **Manifest:** [agent.json](https://trust-oracle.onrender.com/agent.json) | **Execution Log:** [agent_log.json](https://trust-oracle.onrender.com/agent_log.json)

**License:** MIT

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

### Pages

- `/` -- Dashboard with live endpoint scores and probe feed
- `/report` -- Browser-based report submission with MetaMask signing (World ID required)
- `/api/docs` -- Machine-readable API documentation for agent discovery

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
| Wallet | Open Wallet Standard (@open-wallet-standard/core) |
| Payments | x402 v2 on Base mainnet (USDC) |
| Identity | World ID AgentKit (free-trial, 10 uses) |
| Database | SQLite (better-sqlite3, WAL mode) |
| Messaging | XMTP agent-sdk |
| Tests | Vitest (32 tests) |
| Deploy | Docker, Render |

## PL_Genesis Hackathon: Autonomous Agent Upgrade

Built on top of the World x Coinbase hackathon foundation. Everything below was added during the PL_Genesis: Frontiers of Collaboration hackathon (March 2026).

### What Changed (Existing Code -> Autonomous Agent)

**Before:** A probing service with a REST API. Human triggers probes, human reads scores.

**After:** An autonomous agent with on-chain identity that probes, scores, and publishes reputation data without human intervention.

### New Files

| File | Purpose |
|------|---------|
| `server/src/agent-identity.ts` | ERC-8004 agent registration on Polygon Amoy via viem |
| `server/src/agent-manifest.ts` | Generates `agent.json` manifest per ERC-8004 spec |
| `server/src/agent-log.ts` | Structured execution logs (`agent_log.json`) with cycle tracking |
| `server/src/agent-reputation.ts` | Submits trust scores to ERC-8004 Reputation Registry on-chain |
| `server/src/guardrails.ts` | Safety: budget limits, SSRF validation, circuit breaker, gas price checks |
| `SUBMISSION.md` | Project summary (250-500 words) |

### Modified Files

| File | Changes |
|------|---------|
| `server/src/index.ts` | Added `/agent.json`, `/agent_log.json`, `/api/budget` routes. Startup agent registration. |
| `server/src/probe.ts` | Refactored probe loop into autonomous discover/plan/execute/verify/submit cycle |

### New Endpoints

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /agent.json` | None | ERC-8004 agent manifest |
| `GET /agent_log.json` | None | Structured execution log (last 100 cycles) |
| `GET /api/budget` | None | Compute budget and guardrail status |

### ERC-8004 Integration

- **Identity Registry** (`0x8004ad19E14B9e0654f73353e8a0B600D46C2898`): Agent registers as an NFT on Polygon Amoy at startup
- **Reputation Registry** (`0x8004B12F4C2B42d00c46479e859C92e39044C930`): Trust scores submitted on-chain hourly
- `agent.json` served at root, contains capabilities, wallet address, and registration links

### Autonomous Execution Loop

Every 5 minutes, the agent runs a full cycle:
1. **Discover** -- fetch tracked endpoints from DB
2. **Plan** -- run guardrail checks (budget, SSRF, circuit breaker)
3. **Execute** -- probe all safe endpoints, record results
4. **Verify** -- compute trust scores from probe data
5. **Submit** -- write agent_log entry, submit reputation on-chain (hourly)

### Safety Guardrails

- Daily probe budget (default 500/day)
- Gas price ceiling before on-chain submissions
- SSRF protection on all probe targets
- Circuit breaker: pauses after 3 consecutive full-cycle failures
- All decisions logged in agent_log.json

### Categories

- Agent Only: Let the agent cook (Ethereum Foundation)
- Agents With Receipts / ERC-8004 (Ethereum Foundation)
- AI & Robotics (Protocol Labs)
- Existing Code (Protocol Labs)

## OWS Hackathon: Open Wallet Standard Integration

All agent signing now goes through the [Open Wallet Standard](https://openwallet.sh/) SDK. One encrypted wallet, multi-chain accounts, policy-gated signing.

### What Changed

- **Agent wallet** managed by `@open-wallet-standard/core` instead of raw viem private key signing
- **Single wallet** derives accounts across EVM, Solana, Bitcoin, Cosmos, Tron, TON, Sui, Filecoin, XRPL from one seed
- **Transaction signing flow**: viem encodes the calldata, OWS signs the transaction (key never leaves the vault), viem broadcasts
- **Policy engine**: OWS policy gates attempted at startup (spending limits, chain allowlists). SDK format currently undocumented, attempt logged honestly.

### New Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/ows-wallet` | OWS wallet status: chains, accounts, policy state |

### Architecture

```
viem (ABI encode) -> serializeTransaction -> OWS signTransaction -> serializeTransaction (with sig) -> viem sendRawTransaction
```

The private key is imported into OWS on startup from `AGENT_PRIVATE_KEY`. OWS stores it encrypted at rest. During signing, OWS decrypts in an isolated memory region, signs, and wipes the key. The agent process never handles raw key material during signing.

## World x Coinbase Hackathon

Originally built for the World x Coinbase hackathon (March 26-29, 2026).

**Required tech:** x402 (payment), World ID AgentKit (human verification), XMTP (messaging)
