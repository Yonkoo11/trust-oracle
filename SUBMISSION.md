# Trust Oracle: Autonomous x402 Reliability Agent

## Summary

Trust Oracle is an autonomous agent that continuously probes x402 payment endpoints, computes trust scores, and publishes verifiable reputation data on-chain -- all without human intervention.

AI agents paying for API calls via the x402 micropayment protocol have no visibility into endpoint reliability. An endpoint that worked yesterday might have broken x402 headers, high latency, or be completely down. Agents discover this only after paying. Trust Oracle fixes this by operating as an always-on monitoring agent with on-chain identity.

### How It Works

The agent runs a continuous autonomous cycle every 5 minutes:

1. **Discover**: Pulls the list of tracked x402 endpoints from its database
2. **Plan**: Runs safety guardrails -- checks daily probe budget, validates endpoints against SSRF rules, verifies the circuit breaker isn't tripped
3. **Execute**: Probes each endpoint via HTTP, records uptime, latency, and validates x402v2 payment-required headers
4. **Verify**: Computes trust scores using a weighted formula (uptime 70%, latency 30%; shifts to 50/20/30 when human reports exist)
5. **Submit**: Writes a structured execution log and submits reputation data to the ERC-8004 Reputation Registry on Polygon Amoy

### On-Chain Identity (ERC-8004)

The agent registers itself on the ERC-8004 Identity Registry at startup, minting an NFT that links to its `agent.json` manifest. This manifest declares the agent's capabilities, wallet address, and supported trust mechanisms. Trust scores are submitted to the Reputation Registry with keccak256-hashed feedback data, creating a verifiable on-chain trail of the agent's assessments.

### Safety Guardrails

Every cycle is gated by safety checks: daily probe budget limits (default 500), gas price ceilings before on-chain transactions, SSRF protection blocking internal IPs and metadata endpoints, and a circuit breaker that pauses operations after 3 consecutive complete failures. All decisions are recorded in `agent_log.json`.

### Monetization

Other AI agents can query trust scores by paying $0.001 USDC per endpoint via x402 on Base mainnet. World ID-verified humans get 10 free queries. The XMTP bot provides basic scores via messaging.

### Built With

Hono, viem, x402 (Coinbase), World ID AgentKit, SQLite, ERC-8004 (Polygon Amoy), XMTP

## Links

- **Live**: https://trust-oracle.onrender.com
- **Agent Manifest**: https://trust-oracle.onrender.com/agent.json
- **Execution Log**: https://trust-oracle.onrender.com/agent_log.json
- **GitHub**: https://github.com/Yonkoo11/trust-oracle
- **Twitter/X**: @soligxbt
