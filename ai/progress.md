# Trust Oracle - Progress

## Status: OWS Integrated, Pushed to GitHub

### Latest Commits (all pushed to main)
- 8994ddf Fix EIP-155 v value in OWS signing: chainId * 2 + 35 + recoveryId
- be1a9cc Integrate Open Wallet Standard for agent signing
- bc975a2 UX improvements: reorder sections, fix stats, remove gradient text
- 13cdd2a Polish dashboard: tighter hero copy, agent card graceful fallback

### OWS Integration (2026-04-04)
- All agent signing now goes through @open-wallet-standard/core SDK
- New ows-wallet.ts wrapper module (init, sign, policy, status)
- agent-identity.ts: ERC-8004 registration signs via OWS (encode -> serialize -> OWS sign -> reconstruct -> broadcast)
- agent-reputation.ts: reputation submissions sign via OWS (same flow)
- New /api/ows-wallet endpoint showing multi-chain wallet status
- OWS wallet info added to agent.json manifest
- Policy engine attempted (format undocumented, logged honestly)
- EIP-155 v value bug caught and fixed (would have broken on-chain signing)
- All 32 tests pass
- Repo description + topics updated for OWS hackathon

### Submitted To
1. **OWS Hackathon** (April 4, 2026) -- submitted, OWS integration pushed
2. **PL_Genesis** -- planned for Agent Only + ERC-8004 + AI & Robotics + Existing Code tracks. Not yet submitted on DevSpot.
3. **World x Coinbase** -- original hackathon, server deployed on Render

### What's Live on Render (may need redeploy for OWS)
- Dashboard, probe service, x402 payments, ERC-8004 identity
- Agent #30 on Polygon Amoy
- 8 x402 endpoints being probed

### Known Limitations
- OWS FFI bindings untested on Render's Linux. May need redeploy to verify.
- Reputation giveFeedback reverts on Amoy (older deployment, works on mainnet)
- OWS policy format undocumented. Attempt logged, no active policies.
- agent_log.json resets on Render redeploy (ephemeral disk)
- OWS wallet file (~/.ows/wallets/) is ephemeral on Render. Re-imported from AGENT_PRIVATE_KEY on every startup.

### Still To Do
- [ ] Demo video for PL_Genesis (max 3 minutes, YouTube)
- [ ] PL_Genesis DevSpot submission form
- [ ] Redeploy to Render to verify OWS works on Linux
