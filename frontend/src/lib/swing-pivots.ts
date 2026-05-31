import type { BarView } from "@/api/legacy-types";

// A bar qualifies as a swing high if its `high` is strictly greater
// than the highs of every bar within `lookback` bars on either side
// — and symmetrically for swing lows. Edge bars without a full window
// on both sides are skipped (no partial detection).
//
// After detection, levels are de-duplicated: any two levels closer
// than `DEDUPE_PCT` of price collapse into the more recent one, so
// the chart doesn't draw a dozen near-identical lines on a tight
// consolidation.

const DEFAULT_LOOKBACK = 10;
const DEDUPE_PCT = 0.05;

export function findSwingPivots(
  bars: BarView[],
  lookback: number = DEFAULT_LOOKBACK,
): { highs: number[]; lows: number[] } {
  if (bars.length < lookback * 2 + 1) {
    return { highs: [], lows: [] };
  }

  const rawHighs: number[] = [];
  const rawLows: number[] = [];

  for (let i = lookback; i < bars.length - lookback; i++) {
    const center = bars[i];
    let isHigh = true;
    let isLow = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      if (bars[j].high >= center.high) isHigh = false;
      if (bars[j].low <= center.low) isLow = false;
      if (!isHigh && !isLow) break;
    }
    if (isHigh) rawHighs.push(center.high);
    if (isLow) rawLows.push(center.low);
  }

  return {
    highs: dedupeLevels(rawHighs, DEDUPE_PCT),
    lows: dedupeLevels(rawLows, DEDUPE_PCT),
  };
}

function dedupeLevels(levels: number[], pct: number): number[] {
  // Walk in chronological order (input is in bar order). When a new
  // level is close to an existing one, drop the older entry so the
  // most recent (more relevant) level survives.
  const kept: number[] = [];
  for (const level of levels) {
    const tolerance = level * (pct / 100);
    for (let i = kept.length - 1; i >= 0; i--) {
      if (Math.abs(kept[i] - level) <= tolerance) kept.splice(i, 1);
    }
    kept.push(level);
  }
  return kept;
}
