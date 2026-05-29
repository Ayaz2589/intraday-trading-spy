import { useEffect, useRef, useState } from "react";
import {
  init,
  dispose,
  registerIndicator,
  type Chart,
  type KLineData,
} from "klinecharts";
import { cn } from "@/lib/utils";
import { HelpTooltip } from "./help-tooltip";
import { useTheme } from "@/lib/theme";
import type { BarView } from "@/api/types";

// ── Custom VWAP indicator ──────────────────────────────────────────
//
// klinecharts ships an AVP (Anchored VWAP) indicator that recomputes
// from the bar data, but the journal carries pre-computed VWAP values
// that match the backend exactly. We register a custom indicator that
// just looks up each bar's timestamp in a module-level Map. The
// component updates the map on every vwap-prop change.

const vwapByTimestamp = new Map<number, number>();

registerIndicator({
  name: "JournalVWAP",
  shortName: "VWAP",
  series: "price",
  precision: 2,
  figures: [{ key: "vwap", title: "VWAP: ", type: "line" }],
  styles: {
    lines: [{ color: "#f59e0b", size: 2 }],
  },
  calc: (data: KLineData[]) =>
    data.map((d) => ({ vwap: vwapByTimestamp.get(d.timestamp) ?? null })),
});

// ── Theme styles ───────────────────────────────────────────────────

const CHART_STYLES = {
  light: {
    grid: { horizontal: { color: "#f3f4f6" }, vertical: { color: "#f3f4f6" } },
    candle: {
      bar: {
        upColor: "#10b981",
        downColor: "#ef4444",
        upBorderColor: "#10b981",
        downBorderColor: "#ef4444",
        upWickColor: "#10b981",
        downWickColor: "#ef4444",
      },
    },
    crosshair: {
      horizontal: { line: { color: "#9ca3af" }, text: { backgroundColor: "#374151" } },
      vertical: { line: { color: "#9ca3af" }, text: { backgroundColor: "#374151" } },
    },
    xAxis: { axisLine: { color: "#e5e7eb" }, tickText: { color: "#6b7280" } },
    yAxis: { axisLine: { color: "#e5e7eb" }, tickText: { color: "#6b7280" } },
  },
  dark: {
    grid: { horizontal: { color: "#1e293b" }, vertical: { color: "#1e293b" } },
    candle: {
      bar: {
        upColor: "#10b981",
        downColor: "#ef4444",
        upBorderColor: "#10b981",
        downBorderColor: "#ef4444",
        upWickColor: "#10b981",
        downWickColor: "#ef4444",
      },
    },
    crosshair: {
      horizontal: { line: { color: "#64748b" }, text: { backgroundColor: "#1e293b" } },
      vertical: { line: { color: "#64748b" }, text: { backgroundColor: "#1e293b" } },
    },
    xAxis: { axisLine: { color: "#334155" }, tickText: { color: "#94a3b8" } },
    yAxis: { axisLine: { color: "#334155" }, tickText: { color: "#94a3b8" } },
  },
} as const;

// ── Types ──────────────────────────────────────────────────────────

export type ChartMarker = {
  time: string;
  position: "aboveBar" | "belowBar" | "inBar";
  color: string;
  shape: "arrowUp" | "arrowDown" | "circle" | "square";
  text: string;
};

// ── Component ──────────────────────────────────────────────────────

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
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const { theme } = useTheme();
  const [showVwap, setShowVwap] = useState(true);
  const [showOR, setShowOR] = useState(true);

  // Init/dispose the chart once per mount.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const chart = init(container, { styles: CHART_STYLES[theme] });
    if (!chart) return;
    chartRef.current = chart;
    chart.setSymbol({ ticker: "SPY", pricePrecision: 2, volumePrecision: 0 });
    chart.setPeriod({ type: "minute", span: 5 });
    chart.setOffsetRightDistance(20);
    chart.setBarSpace(8);
    chart.createIndicator("VOL");
    return () => {
      dispose(container);
      chartRef.current = null;
    };
    // We deliberately only init once. Theme changes apply via the
    // separate setStyles effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bars data — refresh whenever the bar set changes.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const klineData: KLineData[] = bars.map((b) => ({
      timestamp: new Date(b.timestamp).getTime(),
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume,
    }));
    chart.setDataLoader({
      getBars: ({ callback }) => callback(klineData, false),
    });
  }, [bars]);

  // Theme — re-apply styles whenever theme changes.
  useEffect(() => {
    chartRef.current?.setStyles(CHART_STYLES[theme]);
  }, [theme]);

  // VWAP indicator — show/hide + refresh the lookup map.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.removeIndicator({ name: "JournalVWAP" });
    vwapByTimestamp.clear();
    if (showVwap && vwap.length) {
      vwap.forEach((p) =>
        vwapByTimestamp.set(new Date(p.time).getTime(), p.value),
      );
      chart.createIndicator("JournalVWAP");
    }
  }, [vwap, showVwap]);

  // OR high/low — horizontal dashed lines.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.removeOverlay({ name: "horizontalStraightLine" });
    if (showOR && or) {
      chart.createOverlay({
        name: "horizontalStraightLine",
        points: [{ value: or.high }],
        styles: {
          line: { color: "#22c55e", style: "dashed", size: 1 },
        },
      });
      chart.createOverlay({
        name: "horizontalStraightLine",
        points: [{ value: or.low }],
        styles: {
          line: { color: "#ef4444", style: "dashed", size: 1 },
        },
      });
    }
  }, [or, showOR]);

  // Markers — entry/exit/rejection annotations at specific bars.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.removeOverlay({ name: "simpleAnnotation" });
    if (!markers.length || !bars.length) return;
    const barByTs = new Map<number, BarView>();
    bars.forEach((b) =>
      barByTs.set(new Date(b.timestamp).getTime(), b),
    );
    markers.forEach((m) => {
      const ts = new Date(m.time).getTime();
      const bar = barByTs.get(ts);
      if (!bar) return;
      const value = m.position === "belowBar" ? bar.low : bar.high;
      chart.createOverlay({
        name: "simpleAnnotation",
        points: [{ timestamp: ts, value }],
        extendData: m.text,
        styles: {
          line: { color: m.color },
        },
      });
    });
  }, [markers, bars]);

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
      <div
        ref={containerRef}
        data-chart-root
        className="w-full"
        style={{ height: 500 }}
      />
    </div>
  );
}
