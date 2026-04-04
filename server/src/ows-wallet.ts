// @ts-ignore -- native FFI module, no type declarations
import {
  importWalletPrivateKey,
  getWallet,
  signTransaction,
  signMessage,
  createPolicy,
  listPolicies,
} from "@open-wallet-standard/core";

const WALLET_NAME = "trust-oracle-agent";

let initialized = false;
let policyAttempted = false;
let policyError: string | null = null;

export function initOwsWallet(privateKeyHex: string): boolean {
  try {
    // Check if wallet already exists (survives across non-redeployed runs)
    try {
      getWallet(WALLET_NAME);
      console.log(`[ows] Wallet "${WALLET_NAME}" already exists. Reusing.`);
      initialized = true;
      return true;
    } catch {
      // Wallet doesn't exist yet, import it
    }

    const key = privateKeyHex.startsWith("0x") ? privateKeyHex.slice(2) : privateKeyHex;
    importWalletPrivateKey(WALLET_NAME, key, "eip155:80002");
    console.log(`[ows] Wallet "${WALLET_NAME}" imported from private key.`);
    initialized = true;
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[ows] Failed to initialize wallet: ${msg}`);
    initialized = false;
    return false;
  }
}

export function owsSignTransaction(
  chainId: string,
  unsignedTxHex: string
): { signature: string; recoveryId: number } {
  if (!initialized) throw new Error("OWS wallet not initialized");
  const result = signTransaction(WALLET_NAME, chainId, unsignedTxHex);
  return { signature: result.signature, recoveryId: result.recoveryId ?? 0 };
}

export function owsSignMessage(
  chainId: string,
  message: string
): { signature: string; recoveryId: number } {
  if (!initialized) throw new Error("OWS wallet not initialized");
  const result = signMessage(WALLET_NAME, chainId, message);
  return { signature: result.signature, recoveryId: result.recoveryId ?? 0 };
}

export function attemptOwsPolicy(): void {
  if (!initialized || policyAttempted) return;
  policyAttempted = true;

  // OWS policy format is undocumented. Try reasonable guesses.
  const formats = [
    'max_daily_transactions = 500\nmax_gas_gwei = 100\nallowed_chains = ["eip155:80002", "eip155:8453"]',
    '{"max_daily_transactions": 500, "allowed_chains": ["eip155:80002"]}',
  ];

  for (const fmt of formats) {
    try {
      createPolicy(WALLET_NAME, fmt);
      policyError = null;
      console.log("[ows] Policy created successfully.");
      return;
    } catch {
      // Try next format
    }
  }
  policyError = "Policy format undocumented. Attempted TOML and JSON, both rejected by SDK.";
  console.warn(`[ows] ${policyError}`);
}

export function getOwsWalletInfo(): {
  initialized: boolean;
  walletName: string;
  accounts: Array<{ chainId: string; address: string }>;
  accountCount: number;
  policy: { attempted: boolean; activeCount: number; error: string | null };
} {
  if (!initialized) {
    return {
      initialized: false,
      walletName: WALLET_NAME,
      accounts: [],
      accountCount: 0,
      policy: { attempted: policyAttempted, activeCount: 0, error: "wallet not initialized" },
    };
  }

  try {
    const wallet = getWallet(WALLET_NAME);
    const policies = listPolicies(WALLET_NAME);
    return {
      initialized: true,
      walletName: WALLET_NAME,
      accounts: wallet.accounts.map((a: any) => ({ chainId: a.chainId, address: a.address })),
      accountCount: wallet.accounts.length,
      policy: {
        attempted: policyAttempted,
        activeCount: policies.length,
        error: policyError,
      },
    };
  } catch (err) {
    return {
      initialized: true,
      walletName: WALLET_NAME,
      accounts: [],
      accountCount: 0,
      policy: { attempted: policyAttempted, activeCount: 0, error: String(err) },
    };
  }
}

export function isOwsInitialized(): boolean {
  return initialized;
}
