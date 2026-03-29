# Trust Oracle - Progress

## Status: Production, Deployed, Tested

### Deployed
- Server: https://trust-oracle.onrender.com (auto-redeploy from GitHub, manual trigger needed)
- Dashboard: https://trust-oracle.onrender.com (same-origin, no CORS issues)
- GitHub Pages: https://yonkoo11.github.io/trust-oracle/?api=https://trust-oracle.onrender.com
- GitHub: https://github.com/Yonkoo11/trust-oracle

### Verified Working
- [x] 8 x402 endpoints probed every 5 min (6 return valid x402v2 headers with real prices)
- [x] x402 paywall returns 402 with payment-required header (USDC on Base, your wallet)
- [x] Dashboard shows live probe data, scores vary 82-93
- [x] /api/docs for agent discovery
- [x] World ID report endpoint rejects without AgentKit header (401)
- [x] SSRF protection blocks all IP formats, internal domains, cloud metadata
- [x] AgentKit free-trial persisted to SQLite
- [x] Self-ping prevents Render sleep
- [x] 32 tests passing (ssrf, score computation, x402 header parsing)
- [x] XMTP agent connects to production network
- [x] Dockerfile builds and runs
- [x] README matches production state with example responses

### Not Tested End-to-End
- [ ] USDC payment settlement (402 -> pay -> 200 flow)
- [ ] World ID report happy path (verified human submitting)
- [ ] XMTP agent message handling with real messages
- [ ] Free-trial counter hitting the 10-query limit
- [ ] Dashboard behavior when an endpoint goes down (all currently 100%)
