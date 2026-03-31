import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type PublicClient,
  type WalletClient,
  type Account,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygonAmoy } from "viem/chains";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AGENT_ID_CACHE = path.join(__dirname, "..", "data", "agent_id.json");

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
let walletClient: WalletClient;
let agentAccount: Account;
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

export function initAgentClients(): { publicClient: PublicClient; walletClient: WalletClient; address: Address } | null {
  const privateKey = process.env.AGENT_PRIVATE_KEY;
  if (!privateKey) {
    console.warn("[erc-8004] AGENT_PRIVATE_KEY not set. Agent identity disabled.");
    return null;
  }

  const rpcUrl = process.env.POLYGON_AMOY_RPC_URL || "https://rpc-amoy.polygon.technology";
  agentAccount = privateKeyToAccount(privateKey as `0x${string}`);
  agentAddress = agentAccount.address;

  publicClient = createPublicClient({
    chain: polygonAmoy,
    transport: http(rpcUrl),
  });

  walletClient = createWalletClient({
    account: agentAccount,
    chain: polygonAmoy,
    transport: http(rpcUrl),
  });

  console.log(`[erc-8004] Agent address: ${agentAddress}`);
  return { publicClient, walletClient, address: agentAddress };
}

// Check if this wallet already has an agent NFT.
// Strategy: disk cache first (fast), then balanceOf + ownerOf scan (slow but reliable).
// Amoy public RPC has ~50 block log range limits, so event scanning is impractical.
export async function getExistingAgentId(): Promise<bigint | null> {
  // Disk cache: fastest path
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

    // We own an NFT but don't know the tokenId. Scan ownerOf in batches.
    // Most registries have < 1000 agents. Scan backwards from recent IDs.
    // Try batches of 10, up to 200 total.
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

      // If all 10 reverted (nonexistent tokens), we've passed the end of minted range
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

// Register a new agent identity
export async function registerAgent(agentJsonUrl: string): Promise<{ agentId: bigint; txHash: string } | null> {
  try {
    const hash = await walletClient.writeContract({
      address: IDENTITY_REGISTRY,
      abi: IDENTITY_ABI,
      functionName: "register",
      args: [agentJsonUrl],
      chain: polygonAmoy,
      account: agentAccount,
    });

    console.log(`[erc-8004] Registration tx: ${hash}`);

    // Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      console.error("[erc-8004] Registration tx reverted");
      return null;
    }

    // Extract tokenId from Transfer event in the receipt
    // Transfer(address indexed from, address indexed to, uint256 indexed tokenId)
    const transferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
    const transferLog = receipt.logs.find((log) => log.topics[0] === transferTopic);
    if (transferLog && transferLog.topics[3]) {
      const agentId = BigInt(transferLog.topics[3]);
      cachedAgentId = agentId;
      saveCachedAgentId(agentId);
      console.log(`[erc-8004] Registered as agent #${agentId}`);
      return { agentId, txHash: hash };
    }

    // Fallback: scan ownerOf
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
