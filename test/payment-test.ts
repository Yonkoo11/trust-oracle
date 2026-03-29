// End-to-end x402 payment test.
// Run with: WALLET_KEY=0x... npx tsx test/payment-test.ts
//
// Requires:
// 1. A private key for a wallet with USDC on Base mainnet
// 2. The Trust Oracle server running (local or deployed)

import { wrapFetch } from "@x402/fetch";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

const SERVER = process.env.TRUST_ORACLE_URL || "https://trust-oracle.onrender.com";
const PRIVATE_KEY = process.env.WALLET_KEY;

if (!PRIVATE_KEY) {
  console.error("Set WALLET_KEY=0x... (a Base mainnet wallet with USDC)");
  process.exit(1);
}

const account = privateKeyToAccount(PRIVATE_KEY as `0x${string}`);
const wallet = createWalletClient({ account, chain: base, transport: http() });

console.log(`Testing x402 payment to ${SERVER}`);
console.log(`Paying from wallet: ${account.address}`);
console.log();

// Wrap fetch with x402 payment capability
const payingFetch = wrapFetch(fetch, wallet);

async function testSingleScore() {
  console.log("--- Test 1: GET /api/score/:url (should pay $0.001) ---");
  const url = encodeURIComponent("https://stableenrich.dev/api/exa/search");
  const res = await payingFetch(`${SERVER}/api/score/${url}`);
  console.log(`Status: ${res.status}`);
  if (res.ok) {
    const data = await res.json();
    console.log("Trust score:", data.trust_score);
    console.log("Uptime:", data.uptime_score + "%");
    console.log("x402 valid rate:", data.x402_valid_rate + "%");
    console.log("PASS: Payment succeeded, received score data");
  } else {
    console.log("FAIL:", await res.text());
  }
  console.log();
}

async function testBulkScores() {
  console.log("--- Test 2: GET /api/scores (should pay $0.01) ---");
  const res = await payingFetch(`${SERVER}/api/scores`);
  console.log(`Status: ${res.status}`);
  if (res.ok) {
    const data = await res.json();
    console.log(`Received ${data.count} endpoint scores`);
    console.log("PASS: Bulk payment succeeded");
  } else {
    console.log("FAIL:", await res.text());
  }
  console.log();
}

async function main() {
  try {
    await testSingleScore();
    await testBulkScores();
    console.log("Done. Check your wallet -- USDC should have decreased by ~$0.011.");
  } catch (err) {
    console.error("Error:", err);
  }
}

main();
