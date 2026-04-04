import {
  createPublicClient,
  http,
  encodeFunctionData,
  serializeTransaction,
  type Address,
  type PublicClient,
  type TransactionSerializable,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygonAmoy } from "viem/chains";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { initOwsWallet, owsSignTransaction } from "./ows-wallet.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AGENT_ID_CACHE = path.join(__dirname, "..", "data", "agent_id.json");
const OWS_CHAIN_ID = "eip155:80002"; // Polygon Amoy

// ERC-8004 Identity Registry on Polygon Amoy
const IDENTITY_REGISTRY: Address = "0x8004ad19E14B9e0654f73353e8a0B600D46C2898";

// Minimal ABI for the Identity Registry (ERC-721 + register extension)
const IDENTITY_ABI = [
  {
    name: "register",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "agentURI", type: "string" }],
    outputs: [{ name: "tokenId", type: "uint256" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "tokenOfOwnerByIndex",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "index", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "tokenURI",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
  },
  {
    name: "setTokenURI",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenId", type: "uint256" },
      { name: "tokenURI", type: "string" },
    ],
    outputs: [],
  },
  {
    name: "ownerOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "name",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
] as const;

let publicClient: PublicClient;
let agentAddress: Address;

// Cached agent ID after registration/lookup
let cachedAgentId: bigint | null = null;

function loadCachedAgentId(): bigint | null {
  try {
    if (fs.existsSync(AGENT_ID_CACHE)) {
      const data = JSON.parse(fs.readFileSync(AGENT_ID_CACHE, "utf-8"));
      if (data.agentId) return BigInt(data.agentId);
    }
  } catch {}
  return null;
}

function saveCachedAgentId(id: bigint) {
  try {
    const dir = path.dirname(AGENT_ID_CACHE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(AGENT_ID_CACHE, JSON.stringify({ agentId: id.toString() }));
  } catch {}
}

export function getAgentAddress(): Address {
  return agentAddress;
}

export function getCachedAgentId(): bigint | null {
  return cachedAgentId;
}

export function initAgentClients(): { publicClient: PublicClient; address: Address } | null {
  const privateKey = process.env.AGENT_PRIVATE_KEY;
  if (!privateKey) {
    console.warn("[erc-8004] AGENT_PRIVATE_KEY not set. Agent identity disabled.");
    return null;
  }

  const rpcUrl = process.env.POLYGON_AMOY_RPC_URL || "https://rpc-amoy.polygon.technology";

  // Derive address from key (viem, no signing)
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  agentAddress = account.address;

  publicClient = createPublicClient({
    chain: polygonAmoy,
    transport: http(rpcUrl),
  });

  // Initialize OWS wallet for signing
  initOwsWallet(privateKey);

  console.log(`[erc-8004] Agent address: ${agentAddress}`);
  return { publicClient, address: agentAddress };
}

// Check if this wallet already has an agent NFT.
export async function getExistingAgentId(): Promise<bigint | null> {
  const cached = loadCachedAgentId();
  if (cached !== null) {
    cachedAgentId = cached;
    return cached;
  }

  try {
    const balance = await publicClient.readContract({
      address: IDENTITY_REGISTRY,
      abi: IDENTITY_ABI,
      functionName: "balanceOf",
      args: [agentAddress],
    });

    if (balance === 0n) return null;

    for (let start = 1; start <= 200; start += 10) {
      const checks = Array.from({ length: 10 }, (_, i) => start + i);
      const results = await Promise.allSettled(
        checks.map(async (id) => {
          const owner = await publicClient.readContract({
            address: IDENTITY_REGISTRY,
            abi: IDENTITY_ABI,
            functionName: "ownerOf",
            args: [BigInt(id)],
          });
          return { id, owner };
        })
      );

      for (const r of results) {
        if (r.status === "fulfilled" && r.value.owner.toLowerCase() === agentAddress.toLowerCase()) {
          const tokenId = BigInt(r.value.id);
          cachedAgentId = tokenId;
          saveCachedAgentId(tokenId);
          console.log(`[erc-8004] Found existing agent #${tokenId}`);
          return tokenId;
        }
      }

      const allReverted = results.every((r) => r.status === "rejected");
      if (allReverted) break;
    }

    console.warn("[erc-8004] Owns agent NFT but couldn't find tokenId in first 200 IDs");
    return null;
  } catch (err) {
    console.error("[erc-8004] Failed to check existing agent:", err instanceof Error ? err.message : err);
    return null;
  }
}

// Sign and broadcast a transaction through OWS
async function owsWriteContract(
  to: Address,
  abi: readonly any[],
  functionName: string,
  args: readonly any[]
): Promise<`0x${string}`> {
  const data = encodeFunctionData({ abi, functionName, args });

  // Build tx params
  const nonce = await publicClient.getTransactionCount({ address: agentAddress });
  const gasPrice = await publicClient.getGasPrice();
  const gasEstimate = await publicClient.estimateGas({
    account: agentAddress,
    to,
    data,
  });

  const txParams: TransactionSerializable = {
    to,
    data,
    nonce,
    gas: gasEstimate,
    gasPrice,
    chainId: polygonAmoy.id,
    type: "legacy" as const,
  };

  // Serialize unsigned tx
  const unsignedHex = serializeTransaction(txParams);

  // Sign through OWS
  const { signature, recoveryId } = owsSignTransaction(OWS_CHAIN_ID, unsignedHex);
  const r = `0x${signature.substring(0, 64)}` as `0x${string}`;
  const s = `0x${signature.substring(64, 128)}` as `0x${string}`;
  const v = BigInt(recoveryId + 27 + polygonAmoy.id * 2 + 35);

  // Reconstruct signed tx
  const signedHex = serializeTransaction(txParams, { r, s, v });

  // Broadcast
  const hash = await publicClient.sendRawTransaction({
    serializedTransaction: signedHex,
  });

  console.log(`[ows] Transaction signed and broadcast: ${hash}`);
  return hash;
}

// Register a new agent identity
export async function registerAgent(agentJsonUrl: string): Promise<{ agentId: bigint; txHash: string } | null> {
  try {
    const hash = await owsWriteContract(
      IDENTITY_REGISTRY,
      IDENTITY_ABI,
      "register",
      [agentJsonUrl]
    );

    console.log(`[erc-8004] Registration tx: ${hash}`);

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      console.error("[erc-8004] Registration tx reverted");
      return null;
    }

    const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
    const transferLog = receipt.logs.find((log) => log.topics[0] === transferTopic);
    if (transferLog && transferLog.topics[3]) {
      const agentId = BigInt(transferLog.topics[3]);
      cachedAgentId = agentId;
      saveCachedAgentId(agentId);
      console.log(`[erc-8004] Registered as agent #${agentId}`);
      return { agentId, txHash: hash };
    }

    const agentId = await getExistingAgentId();
    if (agentId === null) {
      console.error("[erc-8004] Registration succeeded but can't find agent ID");
      return null;
    }

    console.log(`[erc-8004] Registered as agent #${agentId}`);
    return { agentId, txHash: hash };
  } catch (err) {
    console.error("[erc-8004] Registration failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

// Full startup flow: check existing or register new
export async function ensureAgentIdentity(agentJsonUrl: string): Promise<{ agentId: bigint; txHash: string | null; isNew: boolean } | null> {
  const existing = await getExistingAgentId();
  if (existing !== null) {
    console.log(`[erc-8004] Already registered as agent #${existing}`);
    return { agentId: existing, txHash: null, isNew: false };
  }

  console.log("[erc-8004] No existing registration. Registering...");
  const result = await registerAgent(agentJsonUrl);
  if (!result) return null;

  return { agentId: result.agentId, txHash: result.txHash, isNew: true };
}

export { IDENTITY_REGISTRY };
