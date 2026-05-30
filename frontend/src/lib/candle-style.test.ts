import { describe, it, expect, beforeEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  useCandleStyle,
  type CandleStyle,
  CANDLE_STYLES,
} from "./candle-style";

const STORAGE_KEY = "isb-candle-style";

beforeEach(() => {
  localStorage.clear();
});

describe("useCandleStyle", () => {
  it("defaults to 'candle_up_stroke' (hollow up, solid down)", () => {
    const { result } = renderHook(() => useCandleStyle());
    expect(result.current.style).toBe<CandleStyle>("candle_up_stroke");
  });

  it("setStyle persists to localStorage", () => {
    const { result } = renderHook(() => useCandleStyle());
    act(() => result.current.setStyle("candle_solid"));
    expect(result.current.style).toBe("candle_solid");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("candle_solid");
  });

  it("reads persisted value on mount", () => {
    localStorage.setItem(STORAGE_KEY, "ohlc");
    const { result } = renderHook(() => useCandleStyle());
    expect(result.current.style).toBe("ohlc");
  });

  it("ignores invalid stored values and falls back to default", () => {
    localStorage.setItem(STORAGE_KEY, "neon_candle");
    const { result } = renderHook(() => useCandleStyle());
    expect(result.current.style).toBe("candle_up_stroke");
  });

  it("exports the canonical CandleStyle list", () => {
    expect(CANDLE_STYLES.map((s) => s.value)).toEqual([
      "candle_up_stroke",
      "candle_solid",
      "candle_stroke",
      "candle_down_stroke",
      "ohlc",
    ]);
    // Every entry must have a human label.
    for (const s of CANDLE_STYLES) {
      expect(s.label.length).toBeGreaterThan(0);
    }
  });
});
