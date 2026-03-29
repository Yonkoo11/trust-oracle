import { describe, it, expect } from "vitest";
import { parseX402Header } from "../probe.js";

describe("parseX402Header", () => {
  it("returns nulls for null input", () => {
    const result = parseX402Header(null);
    expect(result).toEqual({ version: null, network: null, price: null });
  });

  it("returns nulls for empty string", () => {
    const result = parseX402Header("");
    expect(result).toEqual({ version: null, network: null, price: null });
  });

  it("returns nulls for invalid base64", () => {
    const result = parseX402Header("not-valid-base64!!!");
    expect(result).toEqual({ version: null, network: null, price: null });
  });

  it("parses a valid x402v2 payment-required header", () => {
    const payload = {
      x402Version: 2,
      accepts: [{
        scheme: "exact",
        network: "eip155:8453",
        amount: "10000",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        payTo: "0xf9946775891a24462cD4ec885d0D4E2675C84355",
      }],
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64");
    const result = parseX402Header(encoded);
    expect(result.version).toBe(2);
    expect(result.network).toBe("eip155:8453");
    expect(result.price).toBe("10000");
  });

  it("handles x402v1 header", () => {
    const payload = {
      x402Version: 1,
      accepts: [{ network: "eip155:84532", amount: "5000" }],
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64");
    const result = parseX402Header(encoded);
    expect(result.version).toBe(1);
    expect(result.network).toBe("eip155:84532");
    expect(result.price).toBe("5000");
  });

  it("handles header with no accepts array", () => {
    const payload = { x402Version: 2 };
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64");
    const result = parseX402Header(encoded);
    expect(result.version).toBe(2);
    expect(result.network).toBeNull();
    expect(result.price).toBeNull();
  });

  it("handles valid JSON that isn't x402", () => {
    const payload = { foo: "bar" };
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64");
    const result = parseX402Header(encoded);
    expect(result.version).toBeNull();
  });
});
