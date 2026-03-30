import { getCachedAgentId, getAgentAddress, IDENTITY_REGISTRY } from "./agent-identity.js";

const BASE_URL = process.env.RENDER_EXTERNAL_URL || process.env.SELF_URL || "https://trust-oracle.onrender.com";

export interface AgentManifest {
  type: string;
  name: string;
  description: string;
  services: Array<{
    name: string;
    endpoint: string;
    version: string;
    capabilities?: {
      tools: Array<{ name: string; description: string }>;
    };
  }>;
  x402Support: boolean;
  active: boolean;
  registrations: Array<{
    agentId: number;
    agentRegistry: string;
  }>;
  supportedTrust: string[];
}

export function generateManifest(): AgentManifest {
  const agentId = getCachedAgentId();
  let agentAddress: string;
  try {
    agentAddress = getAgentAddress();
  } catch {
    agentAddress = "0x0000000000000000000000000000000000000000";
  }

  const registrations: AgentManifest["registrations"] = [];
  if (agentId !== null) {
    registrations.push({
      agentId: Number(agentId),
      agentRegistry: `eip155:80002:${IDENTITY_REGISTRY}`,
    });
  }

  return {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: "Trust Oracle",
    description:
      "Autonomous agent that probes x402 payment endpoints with real HTTP requests, " +
      "measures uptime, latency, and x402 protocol compliance, computes trust scores, " +
      "and publishes verifiable reputation data on-chain via ERC-8004. " +
      "Human quality reports accepted via World ID verification.",
    services: [
      {
        name: "REST API",
        endpoint: `${BASE_URL}/api`,
        version: "1.0.0",
        capabilities: {
          tools: [
            { name: "get_trust_score", description: "Get trust score for a specific x402 endpoint ($0.001 USDC via x402)" },
            { name: "get_all_scores", description: "Get trust scores for all tracked endpoints ($0.01 USDC via x402)" },
            { name: "report_quality", description: "Submit a human quality report (free, requires World ID)" },
            { name: "get_summary", description: "Get dashboard summary of all endpoints (free)" },
          ],
        },
      },
      {
        name: "agentWallet",
        endpoint: `eip155:80002:${agentAddress}`,
        version: "1.0.0",
      },
    ],
    x402Support: true,
    active: true,
    registrations,
    supportedTrust: ["reputation", "x402-payment-proof"],
  };
}
