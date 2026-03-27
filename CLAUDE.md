# Trust Oracle

Trust score API for x402 endpoints. Agents pay to query reliability data. Humans report quality issues verified by World ID.

## Architecture

- `server/` - Hono x402 server with SQLite storage
- `xmtp-agent/` - XMTP messaging bot that queries the server
- `ai/` - Progress and memory

## Running

```bash
cd server && npm run dev
cd xmtp-agent && npm run dev
```

## Key Tech

- x402 payment protocol (Base mainnet, USDC)
- World ID AgentKit (free-trial mode for human reporters)
- Hono HTTP framework
- SQLite (better-sqlite3)
- XMTP messaging protocol
