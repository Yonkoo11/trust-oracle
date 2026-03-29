import { describe, it, expect } from "vitest";
import { isSafeUrl } from "../ssrf.js";

describe("isSafeUrl", () => {
  // Valid URLs that should pass
  it("allows normal HTTPS domains", () => {
    expect(isSafeUrl("https://stableenrich.dev/api/search")).toBe(true);
    expect(isSafeUrl("https://x402.org/facilitator/supported")).toBe(true);
    expect(isSafeUrl("https://api.cdp.coinbase.com/platform/v2/x402")).toBe(true);
  });

  // Protocol checks
  it("blocks HTTP (non-HTTPS)", () => {
    expect(isSafeUrl("http://example.com")).toBe(false);
  });

  it("blocks FTP and other protocols", () => {
    expect(isSafeUrl("ftp://example.com/file")).toBe(false);
    expect(isSafeUrl("file:///etc/passwd")).toBe(false);
  });

  // Loopback / localhost
  it("blocks localhost", () => {
    expect(isSafeUrl("https://localhost/api")).toBe(false);
    expect(isSafeUrl("https://localhost:3000/api")).toBe(false);
  });

  // IP addresses (all formats)
  it("blocks IPv4 addresses", () => {
    expect(isSafeUrl("https://127.0.0.1/api")).toBe(false);
    expect(isSafeUrl("https://10.0.0.1/api")).toBe(false);
    expect(isSafeUrl("https://192.168.1.1/api")).toBe(false);
    expect(isSafeUrl("https://172.16.0.1/api")).toBe(false);
  });

  it("blocks hex IP addresses", () => {
    expect(isSafeUrl("https://0x7f000001/api")).toBe(false);
  });

  it("blocks octal IP addresses", () => {
    expect(isSafeUrl("https://0177.0.0.1/api")).toBe(false);
  });

  it("blocks decimal integer IP addresses", () => {
    expect(isSafeUrl("https://2130706433/api")).toBe(false); // 127.0.0.1
  });

  it("blocks IPv6 in brackets", () => {
    expect(isSafeUrl("https://[::1]/api")).toBe(false);
  });

  // Cloud metadata
  it("blocks cloud metadata endpoints", () => {
    expect(isSafeUrl("https://metadata.google.internal/api")).toBe(false);
    expect(isSafeUrl("https://metadata.goog/api")).toBe(false);
  });

  // Internal domains
  it("blocks .local domains", () => {
    expect(isSafeUrl("https://myservice.local/api")).toBe(false);
  });

  it("blocks .internal domains", () => {
    expect(isSafeUrl("https://some.service.internal/api")).toBe(false);
  });

  // Invalid URLs
  it("blocks invalid URLs", () => {
    expect(isSafeUrl("not-a-url")).toBe(false);
    expect(isSafeUrl("")).toBe(false);
  });
});
