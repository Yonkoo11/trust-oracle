// Integration tests against a running Trust Oracle server.
// Run with: TRUST_ORACLE_URL=https://trust-oracle.onrender.com npx tsx test/integration.ts

const SERVER = process.env.TRUST_ORACLE_URL || "https://trust-oracle.onrender.com";

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL  ${name}: ${err instanceof Error ? err.message : err}`);
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

async function run() {
  console.log(`Integration tests against ${SERVER}\n`);

  await test("GET /api/health returns 200 with correct structure", async () => {
    const res = await fetch(`${SERVER}/api/health`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const data = await res.json() as any;
    assert(data.service === "trust-oracle", "Wrong service name");
    assert(typeof data.endpoints_tracked === "number", "Missing endpoints_tracked");
    assert(typeof data.x402_configured === "boolean", "Missing x402_configured");
  });

  await test("GET /api/docs returns structured API documentation", async () => {
    const res = await fetch(`${SERVER}/api/docs`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const data = await res.json() as any;
    assert(Array.isArray(data.endpoints), "Missing endpoints array");
    assert(data.endpoints.length >= 4, `Expected 4+ endpoints, got ${data.endpoints.length}`);
    assert(data.x402.protocol === "x402v2", "Wrong protocol");
  });

  await test("GET /api/summary returns limited fields (no latency_score, no p95)", async () => {
    const res = await fetch(`${SERVER}/api/summary`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const data = await res.json() as any;
    assert(Array.isArray(data.endpoints), "Missing endpoints");
    if (data.endpoints.length > 0) {
      const ep = data.endpoints[0];
      assert("trust_score" in ep, "Missing trust_score");
      assert("uptime_score" in ep, "Missing uptime_score");
      assert(!("latency_score" in ep), "latency_score should NOT be in summary (paid data)");
      assert(!("p95_latency_ms" in ep), "p95_latency_ms should NOT be in summary (paid data)");
      assert(!("avg_latency_ms" in ep), "avg_latency_ms should NOT be in summary (paid data)");
    }
  });

  await test("GET /api/scores returns 402 (payment required)", async () => {
    const res = await fetch(`${SERVER}/api/scores`);
    assert(res.status === 402, `Expected 402, got ${res.status}`);
    const paymentHeader = res.headers.get("payment-required");
    assert(!!paymentHeader, "Missing payment-required header");
    // Decode and verify structure
    const decoded = JSON.parse(Buffer.from(paymentHeader, "base64").toString());
    assert(decoded.x402Version === 2, `Expected x402v2, got ${decoded.x402Version}`);
    assert(Array.isArray(decoded.accepts), "Missing accepts array");
    assert(decoded.accepts[0].network === "eip155:8453", "Wrong network");
  });

  await test("GET /api/score/:url returns 402 (payment required)", async () => {
    const url = encodeURIComponent("https://stableenrich.dev/api/exa/search");
    const res = await fetch(`${SERVER}/api/score/${url}`);
    assert(res.status === 402, `Expected 402, got ${res.status}`);
  });

  await test("POST /api/report without agentkit header returns 401", async () => {
    const res = await fetch(`${SERVER}/api/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com", rating: 3 }),
    });
    assert(res.status === 401, `Expected 401, got ${res.status}`);
  });

  await test("POST /api/report with invalid rating returns 400", async () => {
    const res = await fetch(`${SERVER}/api/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "agentkit": "test" },
      body: JSON.stringify({ url: "https://example.com", rating: 6 }),
    });
    assert(res.status === 400, `Expected 400, got ${res.status}`);
  });

  await test("POST /api/endpoints without ADMIN_TOKEN returns 403", async () => {
    const res = await fetch(`${SERVER}/api/endpoints`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://evil.com" }),
    });
    assert(res.status === 403, `Expected 403, got ${res.status}`);
  });

  await test("GET / returns dashboard HTML", async () => {
    const res = await fetch(`${SERVER}/`);
    assert(res.status === 200, `Expected 200, got ${res.status}`);
    const contentType = res.headers.get("content-type") || "";
    assert(contentType.includes("text/html"), `Expected HTML, got ${contentType}`);
  });

  await test("CORS headers present on API responses", async () => {
    const res = await fetch(`${SERVER}/api/health`);
    const acao = res.headers.get("access-control-allow-origin");
    assert(acao === "*", `Expected CORS *, got ${acao}`);
    const corp = res.headers.get("cross-origin-resource-policy");
    assert(corp === "cross-origin", `Expected cross-origin CORP, got ${corp}`);
  });

  console.log(`\n${passed} passed, ${failed} failed out of ${passed + failed} tests`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
