import { useCallback, useEffect, useState } from "react";

export type CandleStyle =
  | "candle_up_stroke" // hollow up, solid down (default, classic Japanese)
  | "candle_solid" // both filled
  | "candle_stroke" // both hollow (minimalist line art)
  | "candle_down_stroke" // solid up, hollow down (inverse Japanese)
  | "ohlc"; // OHLC bar style — no body, just tick marks

export const CANDLE_STYLES: ReadonlyArray<{
  value: CandleStyle;
  label: string;
}> = [
  { value: "candle_up_stroke", label: "Hollow up, solid down" },
  { value: "candle_solid", label: "Solid both" },
  { value: "candle_stroke", label: "Hollow both" },
  { value: "candle_down_stroke", label: "Solid up, hollow down" },
  { value: "ohlc", label: "OHLC bars" },
];

const VALID = new Set<CandleStyle>(CANDLE_STYLES.map((s) => s.value));

const STORAGE_KEY = "isb-candle-style";
const DEFAULT: CandleStyle = "candle_up_stroke";

function getStored(): CandleStyle | null {
  if (typeof window === "undefined") return null;
  const v = localStorage.getItem(STORAGE_KEY);
  return v && VALID.has(v as CandleStyle) ? (v as CandleStyle) : null;
}

export function useCandleStyle() {
  const [style, setStyleState] = useState<CandleStyle>(
    () => getStored() ?? DEFAULT,
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, style);
  }, [style]);

  const setStyle = useCallback((next: CandleStyle) => {
    setStyleState(next);
  }, []);

  return { style, setStyle };
}
