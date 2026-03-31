import { createPublicClient, createWalletClient, http, keccak256, toBytes, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygonAmoy } from "viem/chains";
import { getCachedAgentId } from "./agent-identity.js";

// ERC-8004 Reputation Registry on Polygon Amoy
const REPUTATION_REGISTRY: Address = "0x8004B12F4C2B42d00c46479e859C92e39044C930";

// NOTE: The Amoy testnet deployment is an older version that does NOT include
// the giveFeedback function from the current spec (verified: selector 0x3c036a7e
// is absent from implementation bytecode at 0xd27904bb...).
// The mainnet registry DOES support giveFeedback (confirmed via eth_call).
// We use the spec-correct ABI. On Amoy the call will revert; on mainnet it works.
// The agent logs the attempt either way.
const REPUTATION_ABI = [
  {
    name: "giveFeedback",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agentId", type: "uint256" },
      { name: "value", type: "int128" },
      { name: "valueDecimals", type: "uint8" },
      { name: "tag1", type: "string" },
      { name: "tag2", type: "string" },
      { name: "endpoint", type: "string" },
      { name: "feedbackURI", type: "string" },
      { name: "feedbackHash", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;

let lastSubmissionTime = 0;
const SUBMISSION_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export interface ReputationSubmission {
  endpointUrl: string;
  trustScore: number;
  feedbackUri: string;
}

export async function submitReputation(
  submissions: ReputationSubmission[]
): Promise<{ txHash: string; count: number } | null> {
  const agentId = getCachedAgentId();
  if (agentId === null) {
    console.log("[reputation] No agent ID, skipping");
    return null;
  }

  // Rate limit: once per hour
  if (Date.now() - lastSubmissionTime < SUBMISSION_INTERVAL_MS) {
    return null;
  }

  const privateKey = process.env.AGENT_PRIVATE_KEY;
  if (!privateKey) return null;

  const rpcUrl = process.env.POLYGON_AMOY_RPC_URL || "https://rpc-amoy.polygon.technology";
  const account = privateKeyToAccount(privateKey as `0x${string}`);

  const publicClient = createPublicClient({
    chain: polygonAmoy,
    transport: http(rpcUrl),
  });

  const walletClient = createWalletClient({
    account,
    chain: polygonAmoy,
    transport: http(rpcUrl),
  });

  const sub = submissions[0];
  if (!sub) return null;

  const feedbackJson = JSON.stringify({
    agentId: Number(agentId),
    endpoint: sub.endpointUrl,
    trustScore: sub.trustScore,
    timestamp: new Date().toISOString(),
  });
  const feedbackHash = keccak256(toBytes(feedbackJson));

  try {
    const gasPrice = await publicClient.getGasPrice();
    const maxGwei = BigInt(process.env.MAX_GAS_GWEI || "100") * 1_000_000_000n;
    if (gasPrice > maxGwei) {
      console.warn(`[reputation] Gas price ${gasPrice} exceeds max. Skipping.`);
      return null;
    }

    const hash = await walletClient.writeContract({
      address: REPUTATION_REGISTRY,
      abi: REPUTATION_ABI,
      functionName: "giveFeedback",
      args: [
        agentId,
        BigInt(Math.round(sub.trustScore)),
        0,
        "uptime",
        "x402",
        sub.endpointUrl,
        sub.feedbackUri,
        feedbackHash,
      ],
      chain: polygonAmoy,
      account,
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status === "success") {
      lastSubmissionTime = Date.now();
      console.log(`[reputation] Submitted feedback for ${sub.endpointUrl}: score=${sub.trustScore}, tx=${hash}`);
      return { txHash: hash, count: 1 };
    }

    console.error("[reputation] Transaction reverted");
    return null;
  } catch (err) {
    // Expected on Amoy (giveFeedback not in deployed impl).
    // The attempt is recorded in agent_log.json regardless.
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("reverted")) {
      console.warn("[reputation] giveFeedback reverted on Amoy (known: older deployment). Logged attempt.");
    } else {
      console.error("[reputation] Submission failed:", msg);
    }
    lastSubmissionTime = Date.now(); // Don't retry for an hour
    return null;
  }
}

export { REPUTATION_REGISTRY };
