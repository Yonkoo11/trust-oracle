# Trust Oracle Agent -- PL_Genesis Hackathon Handoff

## What This Is

A new submission to PL_Genesis: Frontiers of Collaboration hackathon. This is the THIRD project submitted by the same person (Yonkoo11). The first two are Cipher Pol (ZK private payments on Starknet) and Privacy Bridge (cross-chain privacy bridge Flow->Starknet).

## The Idea

Reframe the existing Trust Oracle (x402 reliability oracle) as an autonomous agent that:
1. Probes x402 endpoints with real micropayments on a continuous cycle
2. Registers an ERC-8004 agent identity on-chain
3. Builds and publishes trust scores for each endpoint
4. Operates without human intervention after initial launch
5. Produces structured execution logs (agent_log.json) showing decisions, retries, failures

## Why This Idea

- 80% of the code already exists (52 tests passing as of last session, server deployed on Render)
- Targets 4 non-colliding prize categories worth up to $19K total
- Cleanest fit to "Agent Only" judging criteria (Autonomy 35%, Tool Use 25%, Guardclrails 20%)
- No dependency on unfamiliar SDKs

## Source: Research Base

This is Idea #4 from ~/Projects/IDEAS-SUMMARY.md:
- **Name:** MCP/x402 reliability oracle
- **Tier:** 1
- **Fatal flaw:** Revenue negligible at current x402 volume (~$28K/day)
- **Phase 1 Gate (from research):** Cron probes x402 endpoints with real micropayments, exposes GET endpoint with trust scores. Probe 10 endpoints for 24h, correctly flags >50% failure endpoints as "unreliable"

## Existing Codebase

- **Repo:** ~/Projects/trust-oracle/ (also on GitHub: Yonkoo11/trust-oracle)
- **Previous hackathon:** World x Coinbase (separate hackathon, different platform)
- **Tests:** 42 unit + 10 integration tests passing (as of last session -- VERIFY THIS)
- **Server:** Deployed on Render (may have spun down -- VERIFY THIS)
- **Endpoints probed:** 8 x402 endpoints with real payments
- **XMTP agent:** Connected (from World x Coinbase hackathon)

### What already exists:
- Probe engine that pays x402 endpoints and records latency/success/failure
- Trust score computation (weighted rolling average)
- REST API exposing scores
- Unit and integration test suites
- Render deployment config
- XMTP bot integration

### What needs to be built NEW for PL_Genesis:
1. **ERC-8004 identity registration** -- deploy/interact with ERC-8004 contracts, register agent identity linked to operator wallet
2. **agent.json manifest** -- machine-readable capability file (name, operator wallet, ERC-8004 identity, supported tools, task categories)
3. **agent_log.json structured execution logs** -- decisions, tool calls, retries, failures, final outputs per probe cycle
4. **Autonomous execution loop** -- discover -> plan -> execute -> verify -> submit cycle without human intervention
5. **Safety guardrails** -- validate transaction parameters, confirm API outputs, detect unsafe operations, abort/retry safely
6. **Compute budget awareness** -- operate within defined limits, avoid runaway loops
7. **Demo video** (max 3 minutes, YouTube)
8. **Project summary** (250-500 words)

### Optional (bonus points):
- ERC-8004 trust signal read/write (select collaborators based on reputation)
- Multi-agent coordination (planner + prober + scorer agents)
- Filecoin storage for execution logs (adds Filecoin bounty, $2.5K)

## Hackathon Details

- **Hackathon:** PL_Genesis: Frontiers of Collaboration
- **URL:** https://pl-genesis-frontiers-of-collaboration-hackathon.devspot.app/
- **Deadline:** April 1, 2026 @ 7:59 AM UTC (extended from March 31)
- **Winners:** April 10, 2026
- **Stats:** 2160 participants, 223/556 projects submitted
- **Rules doc:** https://docs.google.com/document/d/1Hu2JNfujYAWTl5HyMKsIf4Sjt9u8qrTfJepuQ9zA65A

### Submission requirements:
- Public GitHub repo (MIT or Apache-2.0 license)
- Demo video <= 3 minutes on YouTube
- Project summary 250-500 words
- Team social handles: X/Twitter (@soligxbt), LinkedIn, Discord
- Must integrate at least one sponsor API/SDK

### Key rule on multiple submissions:
> "You may not submit more than one project to the same challenge."
> You CAN submit different projects to different challenges.
> You CAN submit one project to multiple challenges if it meets each.

## Category Selection (ZERO COLLISIONS -- VERIFIED)

### This project submits to:
1. **Agent Only: Let the agent cook** ($4K) -- Ethereum Foundation sponsor
   - Requires: autonomous execution, ERC-8004 identity, agent.json, agent_log.json, tool use, safety guardrails, compute budget awareness
   - Judging: Autonomy 35%, Tool Use 25%, Guardrails 20%, Impact 15%, ERC-8004 bonus 5%
   - Deliverables: summary, video, github, demo, documentation
2. **Agents With Receipts / ERC-8004** ($4K) -- Ethereum Foundation sponsor
   - Requires: ERC-8004 integration (identity/reputation/validation registries), autonomous agent architecture, agent identity + operator model, on-chain verifiability, DevSpot agent compatibility (agent.json + agent_log.json)
   - Prize: 1st $2K, 2nd $1.5K, 3rd $504
3. **AI & Robotics** ($6K) -- Protocol Labs track
   - Judging: Innovation/Creativity, Impact/Usefulness, Relevance to Theme, Use of Sponsor Tech
   - Prize: 1st $3K, 2nd $2K, 3rd $1K
4. **Existing Code** ($5K x 10) -- Protocol Labs
   - Must demonstrate substantial new bounty-driven upgrade
   - README must include changelog showing what was built during event and how it satisfies chosen bounty

### DO NOT select (owned by other projects):
- Fresh Code -- Cipher Pol owns this
- Infrastructure & Digital Rights -- Cipher Pol owns this
- Starknet -- Cipher Pol owns this
- Lit Protocol -- Cipher Pol owns this
- Community Vote -- Cipher Pol owns this
- Crypto -- Privacy Bridge owns this
- Flow -- Privacy Bridge owns this
- Storacha -- Privacy Bridge owns this

### Available but not selected (no fit):
- Neurotech -- not applicable
- Zama -- would need FHE integration, out of scope
- World Build 3 -- needs World App Mini App + World Chain deployment
- Filecoin -- possible stretch (store logs on Filecoin) but adds scope
- Hypercerts -- not applicable
- NEAR -- possible but low prize ($500)
- Impulse AI -- no ML integration
- Physical AI -- not physical AI
- Funding the Commons -- not public goods focused
- Crecimiento -- requires being in Argentina

## Build Order (ENFORCED)

1. **Phase 1: Core action works** -- Agent autonomously probes 3+ endpoints, registers ERC-8004 identity, produces agent_log.json
2. **Phase 2: Data flows** -- Trust scores computed from real probes, ERC-8004 reputation updated on-chain, all verifiable on block explorer
3. **Phase 3: Product complete** -- Full autonomous loop running, agent.json manifest, all submission deliverables ready
4. **Phase 4: Visual polish** -- Landing page, demo video, documentation cleanup

## Verify Before Building

These claims come from prior session notes and have NOT been verified this session:
- [ ] Trust Oracle repo exists and builds (~/Projects/trust-oracle/)
- [ ] 42 unit + 10 integration tests actually pass
- [ ] Render deployment is still live
- [ ] ERC-8004 contracts exist and are deployed somewhere callable
- [ ] x402 endpoints being probed are still operational
- [ ] Cipher Pol is actually submitted on DevSpot (not just planned)
- [ ] Privacy Bridge is actually submitted on DevSpot (progress.md suggests NOT yet)

## ERC-8004 Research Needed

The "Agent Only" and "Agents With Receipts" challenges both require ERC-8004. Before coding:
1. Find the ERC-8004 specification and contract addresses
2. Determine which chain(s) the registries are deployed on
3. Understand the registration flow (identity registry, reputation registry, validation registry)
4. Check if there's an SDK or if you need to interact with raw contracts

## Competitive Landscape

- x402station.com -- monitoring dashboard for x402 endpoints, but NOT an autonomous agent
- No known ERC-8004 agent projects in the wild yet (standard is new)
- Trust Oracle already has real x402 payment data from World x Coinbase hackathon

## Fatal Flaws (be honest)

1. x402 daily volume is ~$28K/day. The "problem" is real but small market
2. ERC-8004 is a new standard with unknown adoption. The agent may be the only user
3. "Autonomous agent" framing could feel forced if the probe loop is just a cron job
4. Prior Trust Oracle was built for World x Coinbase hackathon -- judges may view reuse skeptically under "Existing Code"
5. Unknown: whether Cipher Pol submission is actually live on DevSpot. If not, category planning is moot
