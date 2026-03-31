# Trust Oracle - Progress

## Status: Ready for Demo Video + DevSpot Submission

### Verified Working (on latest commit 4bee67c)
- [x] 32 tests pass, zero TypeScript errors
- [x] ERC-8004 agent #30 registered on Polygon Amoy (ownerOf confirmed)
- [x] tokenURI points to https://trust-oracle.onrender.com/agent.json
- [x] agent.json serves with registrations populated (agentId: 30)
- [x] agent_log.json shows autonomous cycle entries
- [x] /api/budget returns guardrail status
- [x] /api/docs updated with all 8 endpoints + ERC-8004 metadata
- [x] Dashboard updated: agent identity card, execution log section, new hero text
- [x] MIT LICENSE added
- [x] SUBMISSION.md honest (no false claims about reputation)
- [x] README leads with ERC-8004, Polygonscan link, agent.json link
- [x] Pushed to GitHub (4bee67c confirmed on remote)

### Waiting On
- [ ] Render manual deploy (auto-deploy may be off -- still serving old version 1.0.0)
- [ ] Demo video (max 3 minutes, YouTube)
- [ ] DevSpot submission form

### Known Limitations (documented honestly)
- Reputation Registry giveFeedback reverts on Amoy (older deployment). Works on mainnet.
  Agent attempts the call, logs the failure, moves on. This is documented in code comments.
- Agent registered twice (tokens #30 and #31) due to early bug. Fixed now (disk cache).
- agent_log.json resets on Render redeploy (ephemeral disk). In-memory ring buffer of 100 entries.
- No new tests for agent modules (identity, log, guardrails, reputation).

### On-Chain Facts
- Agent wallet: 0xf9946775891a24462cD4ec885d0D4E2675C84355
- Agent token ID: 30 (also 31, duplicate from early bug)
- Identity Registry: 0x8004ad19E14B9e0654f73353e8a0B600D46C2898 (Polygon Amoy)
- Reputation Registry: 0x8004B12F4C2B42d00c46479e859C92e39044C930 (Polygon Amoy)
- Amoy MATIC balance: ~0.074 (enough for gas)
