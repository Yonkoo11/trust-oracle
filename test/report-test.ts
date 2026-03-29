// World ID report submission test.
// Run with: WALLET_KEY=0x... npx tsx test/report-test.ts
//
// Requires:
// 1. A wallet registered with World ID via @worldcoin/agentkit-cli
// 2. The Trust Oracle server running

import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";

const SERVER = process.env.TRUST_ORACLE_URL || "https://trust-oracle.onrender.com";
const PRIVATE_KEY = process.env.WALLET_KEY;

if (!PRIVATE_KEY) {
  console.error("Set WALLET_KEY=0x... (a World ID-registered wallet)");
  process.exit(1);
}

const account = privateKeyToAccount(PRIVATE_KEY as `0x${string}`);
console.log(`Testing World ID report from: ${account.address}`);
console.log(`Server: ${SERVER}`);

// To create a proper AgentKit header, you need the SDK:
// import { signAgentkitMessage } from "@worldcoin/agentkit";
// const header = await signAgentkitMessage({ wallet, domain: "trust-oracle.onrender.com", ... });

// For now, test the rejection path (no header) and the format:
async function testRejection() {
  console.log("\n--- Test: POST /api/report without AgentKit header ---");
  const res = await fetch(`${SERVER}/api/report`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: "https://stableenrich.dev/api/exa/search",
      rating: 4,
      comment: "Fast and reliable",
    }),
  });
  console.log(`Status: ${res.status}`);
  const data = await res.json();
  console.log("Response:", JSON.stringify(data));
  if (res.status === 401) {
    console.log("PASS: Correctly rejected without AgentKit header");
  } else {
    console.log("UNEXPECTED: Expected 401");
  }
}

async function testValidation() {
  console.log("\n--- Test: POST /api/report with invalid rating ---");
  const res = await fetch(`${SERVER}/api/report`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "agentkit": "test-invalid-header",
    },
    body: JSON.stringify({
      url: "https://stableenrich.dev/api/exa/search",
      rating: 6,
    }),
  });
  console.log(`Status: ${res.status}`);
  const data = await res.json();
  console.log("Response:", JSON.stringify(data));
  if (res.status === 400) {
    console.log("PASS: Correctly rejected invalid rating");
  }
}

async function main() {
  await testRejection();
  await testValidation();
  console.log("\nTo test the happy path, use the AgentKit SDK to sign a real AgentKit header.");
  console.log("See: https://docs.world.org/agents/agent-kit");
}

main();
