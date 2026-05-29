import { useEffect, useRef, useState } from "react";
import {
  createChart,
  createSeriesMarkers,
  CandlestickSeries,
  LineSeries,
  type UTCTimestamp,
} from "lightweight-charts";
import { cn } from "@/lib/utils";
import { HelpTooltip } from "./help-tooltip";
import { useTheme } from "@/lib/theme";
import type { BarView } from "@/api/types";

const CHART_THEME = {
  light: {
    background: "#ffffff",
    text: "#333333",
    grid: "#f3f4f6",
  },
  dark: {
    background: "#0f172a",
    text: "#cbd5e1",
    grid: "#1e293b",
  },
} as const;

const toUtc = (iso: string): UTCTimestamp =>
  Math.floor(new Date(iso).getTime() / 1000) as UTCTimestamp;

function ascendingByTime<T extends { time: UTCTimestamp }>(rows: T[]): T[] {
  const sorted = [...rows].sort((a, b) => a.time - b.time);
  const out: T[] = [];
  for (const r of sorted) {
    if (out.length === 0 || out[out.length - 1].time !== r.time) out.push(r);
  }
  return out;
}

export type ChartMarker = {
  time: string;
  position: "aboveBar" | "belowBar" | "inBar";
  color: string;
  shape: "arrowUp" | "arrowDown" | "circle" | "square";
  text: string;
};

export function PriceChart({
  bars,
  vwap,
  or,
  markers,
}: {
  bars: BarView[];
  vwap: { time: string; value: number }[];
  or: { high: number; low: number; from: string; to: string } | null;
  markers: ChartMarker[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  const colors = CHART_THEME[theme];
  const [showVwap, setShowVwap] = useState(true);
  const [showOR, setShowOR] = useState(true);

  useEffect(() => {
    if (!ref.current) return;
    const chart = createChart(ref.current, {
      height: 500,
      layout: {
        background: { color: colors.background },
        textColor: colors.text,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: colors.grid },
        horzLines: { color: colors.grid },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 2,
        barSpacing: 8,
        fixLeftEdge: true,
        fixRightEdge: true,
      },
      crosshair: { mode: 0 }, // Normal crosshair (free-move)
    });
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: "#10b981",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#10b981",
      wickDownColor: "#ef4444",
    });
    candles.setData(
      ascendingByTime(
        bars.map((b) => ({
          time: toUtc(b.timestamp),
          open: b.open,
          high: b.high,
          low: b.low,
          close: b.close,
        })),
      ),
    );
    if (showVwap && vwap.length && bars.length) {
      const firstBarTime = toUtc(bars[0].timestamp);
      const lastBarTime = toUtc(bars[bars.length - 1].timestamp);
      const line = chart.addSeries(LineSeries, {
        color: "#f59e0b",
        lineWidth: 2,
        lastValueVisible: true,
        priceLineVisible: false,
      });
      line.setData(
        ascendingByTime(
          vwap
            .map((p) => ({ time: toUtc(p.time), value: p.value }))
            // Clamp the VWAP series to the bar data range so the line
            // doesn't extend into empty time slots when the journal
            // contains rows past the last available bar.
            .filter((p) => p.time >= firstBarTime && p.time <= lastBarTime),
        ),
      );
    }
    if (showOR && or) {
      candles.createPriceLine({
        price: or.high,
        color: "#22c55e",
        lineStyle: 2,
        title: "OR high",
        lineWidth: 1,
        axisLabelVisible: true,
      });
      candles.createPriceLine({
        price: or.low,
        color: "#ef4444",
        lineStyle: 2,
        title: "OR low",
        lineWidth: 1,
        axisLabelVisible: true,
      });
    }
    if (markers.length && bars.length) {
      const firstBarTime = toUtc(bars[0].timestamp);
      const lastBarTime = toUtc(bars[bars.length - 1].timestamp);
      const mapped = markers
        .map((m) => ({
          time: toUtc(m.time),
          position: m.position,
          color: m.color,
          shape: m.shape,
          text: m.text,
        }))
        // Clamp to the visible bar range so markers don't render at empty
        // time slots past the last bar.
        .filter((m) => m.time >= firstBarTime && m.time <= lastBarTime);
      // Markers must be sorted by time. Duplicate timestamps ARE allowed
      // (entry + rejected on the same bar), so only sort.
      mapped.sort((a, b) => a.time - b.time);
      if (mapped.length) createSeriesMarkers(candles, mapped);
    }
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [bars, vwap, or, markers, colors, showVwap, showOR]);

  return (
    <div className="border rounded border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <div className="flex gap-4 p-2 text-xs items-center border-b border-gray-200 dark:border-slate-700">
        <button
          type="button"
          aria-pressed={showVwap}
          aria-label="Toggle VWAP"
          onClick={() => setShowVwap((v) => !v)}
          className={cn(
            "flex items-center px-1 rounded hover:bg-gray-100 dark:hover:bg-slate-800 transition-opacity",
            !showVwap && "opacity-40 line-through",
          )}
        >
          <span className="inline-block w-4 h-[3px] bg-amber-500 mr-1.5" />
          VWAP
          <HelpTooltip helpKey="vwap" />
        </button>
        <button
          type="button"
          aria-pressed={showOR}
          aria-label="Toggle OR"
          onClick={() => setShowOR((v) => !v)}
          className={cn(
            "flex items-center px-1 rounded hover:bg-gray-100 dark:hover:bg-slate-800 transition-opacity",
            !showOR && "opacity-40 line-through",
          )}
        >
          <span className="w-3 h-0.5 bg-green-500 mr-1" />
          OR high / low
          <HelpTooltip helpKey="opening_range" />
        </button>
        <span className="flex items-center">
          <span className="inline-block w-2 h-2 bg-gray-400 mr-1" />
          Force-flat exit
          <HelpTooltip helpKey="force_flat_exit" />
        </span>
      </div>
      <div ref={ref} data-chart-root />
    </div>
  );
}
