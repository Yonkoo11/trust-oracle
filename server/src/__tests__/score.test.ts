import { describe, it, expect } from "vitest";
import { percentile, computeLatencyScore } from "../score.js";

describe("percentile", () => {
  it("returns 0 for empty array", () => {
    expect(percentile([], 95)).toBe(0);
  });

  it("returns the single element for a one-element array", () => {
    expect(percentile([500], 95)).toBe(500);
    expect(percentile([500], 50)).toBe(500);
  });

  it("returns the correct p95 for a sorted array", () => {
    // 20 elements, p95 = ceil(0.95 * 20) - 1 = 19 - 1 = index 18
    const arr = Array.from({ length: 20 }, (_, i) => (i + 1) * 100);
    expect(percentile(arr, 95)).toBe(1900);
  });

  it("returns the correct p50 (median)", () => {
    const arr = [100, 200, 300, 400, 500];
    // p50 = ceil(0.5 * 5) - 1 = 3 - 1 = index 2
    expect(percentile(arr, 50)).toBe(300);
  });
});

describe("computeLatencyScore", () => {
  it("returns 0 for null (no data)", () => {
    expect(computeLatencyScore(null)).toBe(0);
  });

  it("returns 0 for p95 = 0", () => {
    expect(computeLatencyScore(0)).toBe(0);
  });

  it("returns 100 for very fast latency (100ms)", () => {
    expect(computeLatencyScore(100)).toBe(100);
  });

  it("returns 0 for very slow latency (5000ms)", () => {
    expect(computeLatencyScore(5000)).toBe(0);
  });

  it("returns 0 for latency beyond 5000ms", () => {
    expect(computeLatencyScore(10000)).toBe(0);
  });

  it("returns ~50 for mid-range latency (~2550ms)", () => {
    // (5000 - 2550) / 4900 = 0.5 -> 50
    expect(computeLatencyScore(2550)).toBe(50);
  });

  it("returns high score for fast response (200ms)", () => {
    // (5000 - 200) / 4900 = 0.9796 -> 98
    expect(computeLatencyScore(200)).toBe(98);
  });

  it("scores below 100ms same as 100ms (clamped)", () => {
    expect(computeLatencyScore(50)).toBe(100);
  });
});
