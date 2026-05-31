import { describe, it, expect } from "vitest";
import { findSwingPivots } from "./swing-pivots";
import type { BarView } from "@/api/legacy-types";

function bar(
  i: number,
  high: number,
  low: number,
  close = (high + low) / 2,
): BarView {
  return {
    symbol: "SPY",
    timestamp: new Date(2026, 0, 1, 9, 30 + i * 5).toISOString(),
    open: close,
    high,
    low,
    close,
    volume: 1000,
  };
}

describe("findSwingPivots", () => {
  it("returns empty for inputs smaller than the window", () => {
    const bars = Array.from({ length: 10 }, (_, i) => bar(i, 100, 99));
    const { highs, lows } = findSwingPivots(bars, 5);
    expect(highs).toEqual([]);
    expect(lows).toEqual([]);
  });

  it("returns empty for empty input", () => {
    const { highs, lows } = findSwingPivots([], 10);
    expect(highs).toEqual([]);
    expect(lows).toEqual([]);
  });

  it("detects a clear swing high in the middle of the data", () => {
    // 21 bars total; bar 10 has the strictly-highest high in the
    // 5-bar window on each side.
    const bars: BarView[] = [];
    for (let i = 0; i < 21; i++) {
      bars.push(bar(i, i === 10 ? 110 : 100, 99));
    }
    const { highs } = findSwingPivots(bars, 5);
    expect(highs).toEqual([110]);
  });

  it("detects a clear swing low symmetrically", () => {
    const bars: BarView[] = [];
    for (let i = 0; i < 21; i++) {
      bars.push(bar(i, 110, i === 10 ? 90 : 100));
    }
    const { lows } = findSwingPivots(bars, 5);
    expect(lows).toEqual([90]);
  });

  it("ignores swings within the edge window where the lookback is incomplete", () => {
    // Bar 2 is a local maximum but only 2 bars to its left — not a
    // valid 5-bar swing.
    const bars: BarView[] = [];
    for (let i = 0; i < 21; i++) {
      bars.push(bar(i, i === 2 ? 120 : 100, 99));
    }
    const { highs } = findSwingPivots(bars, 5);
    expect(highs).not.toContain(120);
  });

  it("merges levels that are within the dedupe threshold of each other", () => {
    // Two swing highs ~0.04% apart on a $600 SPY → kept as one
    // (since dedupe threshold is 0.05%). The newer one survives.
    const bars: BarView[] = [];
    for (let i = 0; i < 41; i++) {
      let high = 600;
      if (i === 10) high = 605.0;
      else if (i === 30) high = 605.2; // 0.033% above 605.0
      bars.push(bar(i, high, 599));
    }
    const { highs } = findSwingPivots(bars, 5);
    expect(highs).toHaveLength(1);
    expect(highs[0]).toBeCloseTo(605.2, 2);
  });

  it("keeps levels that are further apart than the dedupe threshold", () => {
    const bars: BarView[] = [];
    for (let i = 0; i < 41; i++) {
      let high = 600;
      if (i === 10) high = 605.0;
      else if (i === 30) high = 608.0; // 0.5% above 605 — well over 0.05%
      bars.push(bar(i, high, 599));
    }
    const { highs } = findSwingPivots(bars, 5);
    expect(highs).toHaveLength(2);
    expect(highs).toContain(605.0);
    expect(highs).toContain(608.0);
  });

  it("handles both highs and lows together", () => {
    const bars: BarView[] = [];
    for (let i = 0; i < 41; i++) {
      const high = i === 10 ? 110 : 100;
      const low = i === 30 ? 90 : 99;
      bars.push(bar(i, high, low));
    }
    const { highs, lows } = findSwingPivots(bars, 5);
    expect(highs).toEqual([110]);
    expect(lows).toEqual([90]);
  });
});
