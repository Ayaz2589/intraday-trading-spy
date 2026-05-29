import { useEffect, useMemo, useRef, useState } from "react";
import {
  init,
  dispose,
  registerIndicator,
  type Chart,
  type KLineData,
  type Point,
} from "klinecharts";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { HelpTooltip } from "./help-tooltip";
import { useTheme } from "@/lib/theme";
import { humanize } from "@/lib/format";
import type { BarView, JournalRowView } from "@/api/types";

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
  precision: 2,
  // Per-figure style callback. v10-beta2 doesn't always pick up
  // `styles.lines[0]` for stacked indicators in the candle pane, so we
  // colour the line at the figure level where it's unambiguous.
  figures: [
    {
      key: "vwap",
      title: "VWAP: ",
      type: "line",
      styles: () => ({ color: "#f59e0b", size: 2, style: "solid", smooth: false }),
    },
  ],
  calc: (data: KLineData[]) =>
    data.map((d) => ({ vwap: vwapByTimestamp.get(d.timestamp) ?? null })),
});

// ── Theme styles ───────────────────────────────────────────────────

// Hover tooltip is disabled — bar details are shown only on click via
// the `onCandleBarClick` action handler below. The crosshair (dashed
// h/v lines on hover) is independent and stays visible for navigation.
const TOOLTIP_OFF = {
  showRule: "none",
} as const;

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
      tooltip: TOOLTIP_OFF,
    },
    indicator: { tooltip: TOOLTIP_OFF },
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
      tooltip: TOOLTIP_OFF,
    },
    indicator: { tooltip: TOOLTIP_OFF },
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
  journal,
}: {
  bars: BarView[];
  vwap: { time: string; value: number }[];
  or: { high: number; low: number; from: string; to: string } | null;
  markers: ChartMarker[];
  journal: JournalRowView[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const { theme } = useTheme();
  const [showVwap, setShowVwap] = useState(true);
  const [showOR, setShowOR] = useState(true);
  const [selectedBar, setSelectedBar] = useState<KLineData | null>(null);

  // Whenever the run/session changes, clear the previously selected bar
  // so the details panel doesn't show stale data.
  useEffect(() => {
    setSelectedBar(null);
  }, [bars]);

  // Look up the journal VWAP for the selected bar (if any).
  const selectedVwap = useMemo(() => {
    if (!selectedBar) return null;
    return vwapByTimestamp.get(selectedBar.timestamp) ?? null;
  }, [selectedBar]);

  // Previous bar's close, for "change from prev" computation.
  const selectedPrevClose = useMemo(() => {
    if (!selectedBar || bars.length === 0) return null;
    const idx = bars.findIndex(
      (b) => new Date(b.timestamp).getTime() === selectedBar.timestamp,
    );
    return idx > 0 ? bars[idx - 1].close : null;
  }, [selectedBar, bars]);

  // Journal rows that fall on the selected bar's timestamp. A single
  // bar can produce multiple rows (e.g. emitted + rejected, or executed
  // + exited at the next bar's open).
  const selectedJournal = useMemo(() => {
    if (!selectedBar) return [];
    return journal.filter(
      (r) => new Date(r.timestamp).getTime() === selectedBar.timestamp,
    );
  }, [selectedBar, journal]);

  // Init/dispose the chart once per mount.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const chart = init(container, { styles: CHART_STYLES[theme] });
    if (!chart) return;
    chartRef.current = chart;
    chart.setSymbol({ ticker: "SPY", pricePrecision: 2, volumePrecision: 0 });
    chart.setPeriod({ type: "minute", span: 5 });
    chart.setOffsetRightDistance(12);
    chart.createIndicator("VOL");
    return () => {
      dispose(container);
      chartRef.current = null;
    };
    // We deliberately only init once. Theme changes apply via the
    // separate setStyles effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Click-to-inspect via direct DOM events. v10-beta2's `subscribeAction`
  // for `onCandleBarClick` was unreliable (callback never fired), so we
  // attach a native click handler to the container and use
  // `convertFromPixel` to translate the cursor position into a bar.
  useEffect(() => {
    const container = containerRef.current;
    const chart = chartRef.current;
    if (!container || !chart) return;
    const onClick = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const result = chart.convertFromPixel(
        [{ x, y }],
        { paneId: "candle_pane" },
      );
      const point = (Array.isArray(result) ? result[0] : result) as
        | Partial<Point>
        | undefined;
      if (!point || typeof point.dataIndex !== "number") return;
      const dataList = chart.getDataList();
      const kline = dataList[point.dataIndex];
      if (!kline) return;
      setSelectedBar((prev) =>
        prev && prev.timestamp === kline.timestamp ? null : kline,
      );
    };
    container.addEventListener("click", onClick);
    return () => container.removeEventListener("click", onClick);
  }, [bars]);

  // Bars data — refresh whenever the bar set changes. Also size the bars
  // so they fill the available width (otherwise on ultra-wide screens a
  // single session of ~78 bars × default 6px leaves the chart half-empty).
  useEffect(() => {
    const chart = chartRef.current;
    const container = containerRef.current;
    if (!chart || !container) return;
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
    if (bars.length > 0) {
      // 70px reserves room for the y-axis labels on the right.
      const available = container.clientWidth - 70;
      const fitted = Math.max(4, Math.min(30, available / bars.length));
      chart.setBarSpace(fitted);
    }
  }, [bars]);

  // Theme — re-apply styles whenever theme changes.
  useEffect(() => {
    chartRef.current?.setStyles(CHART_STYLES[theme]);
  }, [theme]);

  // Refit bar width when the container resizes (e.g. window resize,
  // sidebar toggled, ultra-wide breakpoint changes layout).
  useEffect(() => {
    const container = containerRef.current;
    const chart = chartRef.current;
    if (!container || !chart) return;
    const observer = new ResizeObserver(() => {
      if (!bars.length) return;
      const available = container.clientWidth - 70;
      const fitted = Math.max(4, Math.min(30, available / bars.length));
      chart.setBarSpace(fitted);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [bars]);

  // VWAP indicator — show/hide + refresh the lookup map. Pin it to the
  // candle pane so it overlays the price (otherwise klinecharts opens a
  // separate sub-pane below the volume pane).
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.removeIndicator({ name: "JournalVWAP" });
    vwapByTimestamp.clear();
    if (showVwap && vwap.length) {
      vwap.forEach((p) =>
        vwapByTimestamp.set(new Date(p.time).getTime(), p.value),
      );
      // v10-beta2 quirk: `isStack: true` is required for the indicator
      // to actually attach to an existing pane id; without it, klinecharts
      // silently drops the creation.
      chart.createIndicator("JournalVWAP", {
        isStack: true,
        pane: { id: "candle_pane" },
      });
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
        <span className="ml-auto text-gray-500 dark:text-slate-500 italic">
          {selectedBar ? "" : "Click a candle for details"}
        </span>
      </div>
      {selectedBar && (
        <BarDetailsStrip
          bar={selectedBar}
          vwap={selectedVwap}
          prevClose={selectedPrevClose}
          journal={selectedJournal}
          onClose={() => setSelectedBar(null)}
        />
      )}
      <div
        ref={containerRef}
        data-chart-root
        className="w-full"
        style={{ height: 500 }}
      />
    </div>
  );
}

function formatDollar(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

function signed(n: number, digits = 2): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(digits)}`;
}

const STATUS_COLOR: Record<JournalRowView["status"], string> = {
  emitted: "text-blue-600 dark:text-blue-400",
  approved: "text-blue-600 dark:text-blue-400",
  executed: "text-emerald-600 dark:text-emerald-400",
  exited: "text-slate-600 dark:text-slate-300",
  force_flat: "text-gray-600 dark:text-gray-300",
  rejected: "text-red-600 dark:text-red-400",
  lockout: "text-amber-600 dark:text-amber-400",
};

function BarDetailsStrip({
  bar,
  vwap,
  prevClose,
  journal,
  onClose,
}: {
  bar: KLineData;
  vwap: number | null;
  prevClose: number | null;
  journal: JournalRowView[];
  onClose: () => void;
}) {
  const time = new Date(bar.timestamp).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const range = bar.high - bar.low;
  const body = bar.close - bar.open;
  const bodyAbs = Math.abs(body);
  const upperWick = bar.high - Math.max(bar.open, bar.close);
  const lowerWick = Math.min(bar.open, bar.close) - bar.low;
  const bodyPct = range > 0 ? (bodyAbs / range) * 100 : 0;
  const upperPct = range > 0 ? (upperWick / range) * 100 : 0;
  const lowerPct = range > 0 ? (lowerWick / range) * 100 : 0;
  const dollarVol = bar.close * bar.volume;
  const distFromVwap =
    vwap != null ? ((bar.close - vwap) / vwap) * 100 : null;
  const change = prevClose != null ? bar.close - prevClose : null;
  const changePct =
    prevClose != null && prevClose !== 0
      ? (bar.close - prevClose) / prevClose
      : null;
  const closeColor =
    body >= 0
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-red-600 dark:text-red-400";

  return (
    <div className="border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/60 font-mono text-xs">
      {/* Header: time, change-from-prev, close button */}
      <div className="flex items-center gap-5 px-3 py-2">
        <span className="text-gray-700 dark:text-slate-200 font-semibold">
          {time} ET
        </span>
        {change != null && changePct != null && (
          <span className={closeColor}>
            {signed(change)} ({signed(changePct * 100)}%) from prev close
          </span>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close bar details"
          className="ml-auto p-1 rounded hover:bg-gray-200 dark:hover:bg-slate-700"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Sections: price / candle anatomy / volume / indicators */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1 px-3 pb-2">
        <Section title="Price">
          <Row k="O" v={bar.open.toFixed(2)} />
          <Row k="H" v={bar.high.toFixed(2)} />
          <Row k="L" v={bar.low.toFixed(2)} />
          <Row k="C" v={bar.close.toFixed(2)} valueClass={closeColor} />
        </Section>
        <Section title="Candle">
          <Row k="Body" v={`${signed(body)} (${bodyPct.toFixed(0)}%)`} />
          <Row k="Upper wick" v={`${upperWick.toFixed(2)} (${upperPct.toFixed(0)}%)`} />
          <Row k="Lower wick" v={`${lowerWick.toFixed(2)} (${lowerPct.toFixed(0)}%)`} />
          <Row k="Range" v={range.toFixed(2)} />
        </Section>
        <Section title="Volume">
          <Row k="Shares" v={bar.volume.toLocaleString()} />
          <Row k="$ traded" v={formatDollar(dollarVol)} />
        </Section>
        <Section title="Indicators">
          {vwap != null && (
            <Row
              k="VWAP"
              v={vwap.toFixed(2)}
              valueClass="text-amber-600 dark:text-amber-400"
            />
          )}
          {distFromVwap != null && (
            <Row k="vs VWAP" v={`${signed(distFromVwap)}%`} />
          )}
          {prevClose != null && (
            <Row k="Prev close" v={prevClose.toFixed(2)} />
          )}
        </Section>
      </div>

      {/* Journal events on this bar */}
      {journal.length > 0 && (
        <div className="px-3 pb-2 pt-1 border-t border-gray-200 dark:border-slate-700">
          <div className="uppercase tracking-wide text-[10px] text-gray-500 dark:text-slate-400 mb-1">
            Journal events
          </div>
          <ul className="space-y-1">
            {journal.map((r, i) => (
              <JournalEntry key={`${r.row_seq}-${i}`} row={r} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="uppercase tracking-wide text-[10px] text-gray-500 dark:text-slate-400 mb-0.5">
        {title}
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Row({
  k,
  v,
  valueClass = "",
}: {
  k: string;
  v: string;
  valueClass?: string;
}) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-gray-500 dark:text-slate-400">{k}</span>
      <strong className={valueClass}>{v}</strong>
    </div>
  );
}

function JournalEntry({ row }: { row: JournalRowView }) {
  const parts: string[] = [];
  if (row.setup) parts.push(humanize(row.setup));
  if (row.planned_entry != null) {
    parts.push(`entry ${row.planned_entry.toFixed(2)}`);
  }
  if (row.stop_loss != null) {
    parts.push(`stop ${row.stop_loss.toFixed(2)}`);
  }
  if (row.take_profit != null) {
    parts.push(`target ${row.take_profit.toFixed(2)}`);
  }
  if (row.quantity != null) {
    parts.push(`qty ${row.quantity}`);
  }
  if (row.realized_r != null) {
    parts.push(`${signed(row.realized_r, 1)}R`);
  }
  return (
    <li className="leading-snug">
      <span className={cn("font-semibold", STATUS_COLOR[row.status])}>
        {humanize(row.status)}
      </span>
      {parts.length > 0 && (
        <span className="text-gray-600 dark:text-slate-300">
          {" "}
          · {parts.join(" · ")}
        </span>
      )}
      {row.rejection_check && (
        <span className="text-red-600 dark:text-red-400">
          {" "}
          · {humanize(row.rejection_check)}
        </span>
      )}
      {row.exit_reason && (
        <span className="text-gray-600 dark:text-slate-300">
          {" "}
          · exit: {humanize(row.exit_reason)}
        </span>
      )}
      {row.reason && (
        <div className="text-gray-500 dark:text-slate-400 italic">
          {row.reason}
        </div>
      )}
    </li>
  );
}
