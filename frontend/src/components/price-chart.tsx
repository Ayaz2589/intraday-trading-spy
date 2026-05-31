import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  init,
  dispose,
  registerIndicator,
  registerOverlay,
  type Chart,
  type KLineData,
  type Point,
} from "klinecharts";
import { X, Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import { humanize } from "@/lib/format";
import { findSwingPivots } from "@/lib/swing-pivots";
import { entryRationale, type EntryRationale } from "@/lib/entry-rationale";
import { exitRationale, type ExitRationale } from "@/lib/exit-rationale";
import { clusterRejections } from "@/lib/rejection-clusters";
import { useCandleStyle, CANDLE_STYLES } from "@/lib/candle-style";
import { createRejectionClusterOverlays } from "./rejection-cluster-overlay";
import type { BarView, JournalRowView } from "@/api/legacy-types";

// VWAP line thickness in px. The entry-dot radius scales off this so
// the dot stays visually balanced with the line — too small and it
// looks like noise; too large and it eats the curve.
const VWAP_LINE_SIZE = 4;
const ENTRY_DOT_RADIUS = VWAP_LINE_SIZE * 2;

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
      // @ts-expect-error klinecharts IndicatorFigureStylesCallback signature varies by version
      styles: () => ({
        color: "#f5a524",
        size: VWAP_LINE_SIZE,
        style: "solid",
        smooth: false,
      }),
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

// Resolve a CSS custom property at runtime. Returns the trimmed value or an
// empty string if not set. Used to feed KLineCharts (a Canvas renderer that
// needs concrete color strings) from our design tokens.
function resolveToken(name: string): string {
  if (typeof document === "undefined") return "";
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

// Build a CHART_STYLES object whose colors come from the live design tokens.
// Re-evaluated on every theme change so canvas colors track the tokens.
function buildChartStyles(
  theme: "light" | "dark",
  candleStyle:
    | "candle_solid"
    | "candle_stroke"
    | "candle_up_stroke"
    | "candle_down_stroke"
    | "ohlc" = "candle_up_stroke",
) {
  const profit =
    resolveToken("--profit") || (theme === "dark" ? "#14b884" : "#0f9e6e");
  const loss =
    resolveToken("--loss") || (theme === "dark" ? "#f04f6a" : "#e23b58");
  const grid =
    resolveToken("--grid") ||
    (theme === "dark"
      ? "rgba(148, 163, 184, 0.12)"
      : "rgba(15, 23, 42, 0.06)");
  const textFaint =
    resolveToken("--text-faint") || (theme === "dark" ? "#8a96ab" : "#8a96ab");
  const border =
    resolveToken("--border") ||
    (theme === "dark"
      ? "rgba(148, 163, 184, 0.18)"
      : "rgba(15, 23, 42, 0.09)");
  const surface2 =
    resolveToken("--surface-2") || (theme === "dark" ? "#182030" : "#f6f8fc");
  return {
    grid: { horizontal: { color: grid }, vertical: { color: grid } },
    // Suppress the pane-separator line — by default KLineCharts draws a
    // light grey divider between the candle pane and the volume pane that
    // reads as a stark white line against the design's dark chart-bg.
    // Tint it to the chart-bg so it disappears.
    separator: { size: 1, color: resolveToken("--chart-bg") || (theme === "dark" ? "#0c111c" : "#fbfcfe"), fill: false },
    candle: {
      // Style is configurable via the chart-header dropdown (useCandleStyle).
      type: candleStyle,
      bar: {
        // For hollow up-candles KLineCharts uses `upBorderColor` as the
        // visible color (fill is transparent). For solid down-candles
        // both downColor (fill) and downBorderColor matter.
        upColor: profit,
        downColor: loss,
        upBorderColor: profit,
        downBorderColor: loss,
        upWickColor: profit,
        downWickColor: loss,
      },
      tooltip: TOOLTIP_OFF,
      priceMark: {
        // Faint "last close" horizontal dashed line — keep it subtle.
        last: { line: { color: textFaint } },
      },
    },
    indicator: { tooltip: TOOLTIP_OFF },
    crosshair: {
      horizontal: {
        line: { color: textFaint },
        text: { backgroundColor: surface2 },
      },
      vertical: {
        line: { color: textFaint },
        text: { backgroundColor: surface2 },
      },
    },
    xAxis: { axisLine: { color: border }, tickText: { color: textFaint } },
    yAxis: { axisLine: { color: border }, tickText: { color: textFaint } },
  } as const;
}

// Compact pill style shared by every labeled overlay tag (OR, S/R).
const TAG_TEXT_BASE = {
  color: "#ffffff",
  size: 10,
  paddingLeft: 5,
  paddingRight: 5,
  paddingTop: 2,
  paddingBottom: 2,
  borderRadius: 3,
} as const;

// ── Custom `labeledLevel` overlay ──────────────────────────────────
//
// Draws a horizontal dashed line across the candle pane PLUS a small
// pill label positioned just above the line at the left edge of the
// chart. `extendData` is the pill text (e.g. "R 658.52"). Styles come
// from `overlay.styles.line` and `overlay.styles.text` set per-call.
//
// Built-in `simpleTag` puts the label on the y-axis gutter, which gets
// crowded as soon as two levels are at near-identical prices. Inline
// pills above the line keep the y-axis ticks readable.

// ── Custom `pill` overlay ──────────────────────────────────────────
//
// Text-only label, no line. Used when an existing visual (e.g. the
// VWAP indicator's own curve) already draws the line and we just want
// to attach an identifying pill at a specific bar/value coordinate.

registerOverlay({
  name: "pill",
  totalStep: 2,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  createPointFigures: ({ overlay, coordinates }) => {
    const y = coordinates[0].y;
    const text = String(overlay.extendData ?? "");
    return [
      {
        type: "text",
        attrs: { x: 6, y: y - 3, text, baseline: "bottom", align: "left" },
        ignoreEvent: true,
      },
    ];
  },
});

// ── Custom `vwapDot` overlay ───────────────────────────────────────
//
// A filled circle at a (timestamp, value) point — used to mark
// executed entries on the VWAP line. Polygon-based circle approx
// (16 vertices) so we don't depend on a `circle` figure primitive.

function circlePolygon(cx: number, cy: number, r: number, sides = 16) {
  const pts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * 2 * Math.PI;
    pts.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
  }
  return pts;
}

registerOverlay({
  name: "vwapDot",
  totalStep: 2,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  createPointFigures: ({ coordinates }) => {
    return [
      {
        type: "polygon",
        attrs: {
          coordinates: circlePolygon(
            coordinates[0].x,
            coordinates[0].y,
            ENTRY_DOT_RADIUS,
          ),
        },
        ignoreEvent: true,
      },
    ];
  },
});

// ── Custom `tradeRationaleTag` overlay ─────────────────────────────
//
// Anchored at a VWAP-dot point (timestamp, vwap value), draws a pill
// offset vertically away from the dot with a thin stem connecting
// them. Keeps the dot exactly on VWAP for precise read while moving
// the labeled pill clear of the VWAP line. Direction (above|below)
// comes from extendData.
//
// PILL_OFFSET = px from dot center to pill center.
// PILL_HALF_HEIGHT approximates half the pill's rendered height so the
// stem stops at the pill edge, not inside it.

const PILL_OFFSET = 34;
const PILL_HALF_HEIGHT = 13;

registerOverlay({
  name: "tradeRationaleTag",
  totalStep: 2,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  createPointFigures: ({ overlay, coordinates }) => {
    const { x, y: dotY } = coordinates[0];
    const data = overlay.extendData as {
      text: string;
      direction: "above" | "below";
    };
    const sign = data.direction === "above" ? -1 : 1;
    const pillY = dotY + sign * PILL_OFFSET;
    const stemFromY = dotY + sign * ENTRY_DOT_RADIUS;
    const stemToY = pillY - sign * PILL_HALF_HEIGHT;
    return [
      {
        type: "line",
        attrs: {
          coordinates: [
            { x, y: stemFromY },
            { x, y: stemToY },
          ],
        },
        ignoreEvent: true,
      },
      {
        type: "text",
        attrs: {
          x,
          y: pillY,
          text: data.text,
          align: "center",
          baseline: "middle",
        },
        ignoreEvent: true,
      },
    ];
  },
});

registerOverlay({
  name: "labeledLevel",
  totalStep: 2,
  needDefaultPointFigure: false,
  needDefaultXAxisFigure: false,
  needDefaultYAxisFigure: false,
  createPointFigures: ({ overlay, coordinates, bounding }) => {
    const y = coordinates[0].y;
    const text = String(overlay.extendData ?? "");
    return [
      {
        type: "line",
        attrs: {
          coordinates: [
            { x: 0, y },
            { x: bounding.width, y },
          ],
        },
        ignoreEvent: true,
      },
      {
        type: "text",
        attrs: { x: 6, y: y - 3, text, baseline: "bottom", align: "left" },
        ignoreEvent: true,
      },
    ];
  },
});

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
  accountValue,
  positionCapPct,
  showRejections = false,
  onToggleRejections,
}: {
  bars: BarView[];
  vwap: { time: string; value: number }[];
  or: { high: number; low: number; from: string; to: string } | null;
  markers: ChartMarker[];
  journal: JournalRowView[];
  accountValue: number;
  positionCapPct: number;
  showRejections?: boolean;
  onToggleRejections?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartCardRef = useRef<HTMLElement>(null);
  const chartRef = useRef<Chart | null>(null);
  // Tracks whether the chart has been auto-fitted once. First data load
  // sizes bars to fill the container; subsequent loads (day-tab / run
  // switch) preserve the user's current zoom.
  const hasAutoFittedRef = useRef(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { theme } = useTheme();
  const { style: candleStyle, setStyle: setCandleStyle } = useCandleStyle();
  const [showVwap, setShowVwap] = useState(true);
  const [showOR, setShowOR] = useState(true);
  const [showSR, setShowSR] = useState(false);
  const [showMarkers, setShowMarkers] = useState(true);
  const [selectedBar, setSelectedBar] = useState<KLineData | null>(null);
  const orOverlayIds = useRef<string[]>([]);
  const srOverlayIds = useRef<string[]>([]);
  const lastOverlayId = useRef<string | null>(null);
  const vwapTagId = useRef<string | null>(null);
  const entryDotIds = useRef<string[]>([]);
  const exitDotIds = useRef<string[]>([]);
  const rejectionClusterIds = useRef<string[]>([]);
  const [entryPopover, setEntryPopover] = useState<{
    row: JournalRowView;
    priorBar: BarView | null;
    x: number;
    y: number;
  } | null>(null);
  const [exitPopover, setExitPopover] = useState<{
    row: JournalRowView;
    entryTimestamp: string | null;
    x: number;
    y: number;
  } | null>(null);

  const pivots = useMemo(() => findSwingPivots(bars), [bars]);

  // The latest bar's close. Color tracks direction vs the previous
  // bar, matching the candle convention.
  const lastClose = useMemo(() => {
    if (bars.length === 0) return null;
    const last = bars[bars.length - 1];
    const prev = bars.length >= 2 ? bars[bars.length - 2] : null;
    const up = prev ? last.close >= prev.close : true;
    return {
      value: last.close,
      color: up ? "#0f9e6e" : "#f04f6a",
    };
  }, [bars]);

  // Whenever the run/session changes, clear the previously selected bar
  // and any open popover so neither shows stale data.
  useEffect(() => {
    setSelectedBar(null);
    setEntryPopover(null);
    setExitPopover(null);
  }, [bars]);

  // Executed entries with their VWAP-line position (timestamp, value).
  // Used both to render dots and to detect dot-clicks in the container
  // click handler.
  const entries = useMemo(() => {
    const vwapByTs = new Map<number, number>();
    for (const p of vwap) vwapByTs.set(new Date(p.time).getTime(), p.value);
    const barByTs = new Map<number, BarView>();
    for (let i = 0; i < bars.length; i++) {
      barByTs.set(new Date(bars[i].timestamp).getTime(), bars[i]);
    }
    const barTimes = bars.map((b) => new Date(b.timestamp).getTime());
    const out: Array<{
      row: JournalRowView;
      ts: number;
      vwap: number;
      priorBar: BarView | null;
    }> = [];
    for (const r of journal) {
      if (r.status !== "executed") continue;
      const ts = new Date(r.timestamp).getTime();
      const vwapAt = vwapByTs.get(ts);
      if (vwapAt == null) continue;
      const idx = barTimes.indexOf(ts);
      const priorBar = idx > 0 ? bars[idx - 1] : null;
      out.push({ row: r, ts, vwap: vwapAt, priorBar });
    }
    return out;
  }, [bars, vwap, journal]);

  // Exits — one entry per (exited | force_flat) journal row, anchored
  // to the VWAP value at that bar. Each exit also carries the entry
  // timestamp (the nearest prior executed row) so the popover can show
  // trade duration.
  const exits = useMemo(() => {
    const vwapByTs = new Map<number, number>();
    for (const p of vwap) vwapByTs.set(new Date(p.time).getTime(), p.value);
    const out: Array<{
      row: JournalRowView;
      ts: number;
      vwap: number;
      entryTimestamp: string | null;
      color: string;
    }> = [];
    let lastEntryTs: string | null = null;
    // Single forward pass — journal is timestamp-ordered, so we can
    // track the most recent entry and pair it with the next exit.
    const sorted = [...journal].sort((a, b) =>
      a.timestamp.localeCompare(b.timestamp),
    );
    for (const r of sorted) {
      if (r.status === "executed") {
        lastEntryTs = r.timestamp;
        continue;
      }
      if (r.status !== "exited" && r.status !== "force_flat") continue;
      const ts = new Date(r.timestamp).getTime();
      const vwapAt = vwapByTs.get(ts);
      if (vwapAt == null) continue;
      const reason = r.exit_reason ?? "force_flat";
      const color =
        reason === "target"
          ? "#14b884"
          : reason === "stop"
            ? "#f04f6a"
            : "#8a96ab";
      out.push({ row: r, ts, vwap: vwapAt, entryTimestamp: lastEntryTs, color });
      lastEntryTs = null; // consumed
    }
    return out;
  }, [vwap, journal]);

  // Bar details strip defaults to the most recent bar when the user
  // hasn't picked one. Convert BarView (string timestamp) → KLineData
  // (numeric timestamp) shape that the rest of the chart code uses.
  const displayBar: KLineData | null = useMemo(() => {
    if (selectedBar) return selectedBar;
    if (bars.length === 0) return null;
    const last = bars[bars.length - 1];
    return {
      timestamp: new Date(last.timestamp).getTime(),
      open: last.open,
      high: last.high,
      low: last.low,
      close: last.close,
      volume: last.volume,
    } as KLineData;
  }, [selectedBar, bars]);

  // Look up the journal VWAP for the display bar (if any).
  const selectedVwap = useMemo(() => {
    if (!displayBar) return null;
    return vwapByTimestamp.get(displayBar.timestamp) ?? null;
  }, [displayBar]);

  // Previous bar's close, for "change from prev" computation.
  const selectedPrevClose = useMemo(() => {
    if (!displayBar || bars.length === 0) return null;
    const idx = bars.findIndex(
      (b) => new Date(b.timestamp).getTime() === displayBar.timestamp,
    );
    return idx > 0 ? bars[idx - 1].close : null;
  }, [displayBar, bars]);

  // Journal rows that fall on the display bar's timestamp. A single
  // bar can produce multiple rows (e.g. emitted + rejected, or executed
  // + exited at the next bar's open).
  const selectedJournal = useMemo(() => {
    if (!displayBar) return [];
    return journal.filter(
      (r) => new Date(r.timestamp).getTime() === displayBar.timestamp,
    );
  }, [displayBar, journal]);

  // Init/dispose the chart once per mount.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // @ts-expect-error klinecharts Styles DeepPartial type does not allow our readonly literal
    const chart = init(container, { styles: buildChartStyles(theme, candleStyle) });
    if (!chart) return;
    chartRef.current = chart;
    chart.setSymbol({ ticker: "SPY", pricePrecision: 2, volumePrecision: 0 });
    chart.setPeriod({ type: "minute", span: 5 });
    chart.setOffsetRightDistance(28);
    // VOL indicator with the default MA5/MA10/MA20 overlays stripped —
    // those produced the orange + blue lines on top of the volume bars
    // which read as noise on a backtest-research chart.
    chart.createIndicator({ name: "VOL", calcParams: [] });
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
      // 1. Entry-dot hit-test first — dots sit on top of the VWAP
      //    curve in the candle pane.
      for (const entry of entries) {
        const c = chart.convertToPixel(
          [{ timestamp: entry.ts, value: entry.vwap }],
          { paneId: "candle_pane" },
        );
        const coord = (Array.isArray(c) ? c[0] : c) as Partial<Point> & {
          x?: number;
          y?: number;
        };
        if (coord?.x == null || coord?.y == null) continue;
        if (Math.hypot(x - coord.x, y - coord.y) < ENTRY_DOT_RADIUS + 6) {
          setEntryPopover({
            row: entry.row,
            priorBar: entry.priorBar,
            x: coord.x,
            y: coord.y,
          });
          setExitPopover(null);
          setSelectedBar(null);
          return;
        }
      }
      // 2. Exit-dot hit-test.
      for (const exit of exits) {
        const c = chart.convertToPixel(
          [{ timestamp: exit.ts, value: exit.vwap }],
          { paneId: "candle_pane" },
        );
        const coord = (Array.isArray(c) ? c[0] : c) as Partial<Point> & {
          x?: number;
          y?: number;
        };
        if (coord?.x == null || coord?.y == null) continue;
        if (Math.hypot(x - coord.x, y - coord.y) < ENTRY_DOT_RADIUS + 6) {
          setExitPopover({
            row: exit.row,
            entryTimestamp: exit.entryTimestamp,
            x: coord.x,
            y: coord.y,
          });
          setEntryPopover(null);
          setSelectedBar(null);
          return;
        }
      }
      // 3. Fall through to bar selection.
      setEntryPopover(null);
      setExitPopover(null);
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
  }, [bars, entries, exits]);

  // Bars data — refresh whenever the bar set changes. On first load,
  // size the bars to fill the available width (a single session of ~78
  // bars × default 6px leaves an ultra-wide chart half-empty). On
  // subsequent loads (day-tab / run switch), preserve both the zoom
  // (barSpace) and the horizontal scroll position (offsetRightDistance)
  // so the same intraday window stays in view across days.
  useEffect(() => {
    const chart = chartRef.current;
    const container = containerRef.current;
    if (!chart || !container) return;
    const previousBarSpace = chart.getBarSpace().bar;
    const previousOffsetRight = chart.getOffsetRightDistance();
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
      if (!hasAutoFittedRef.current) {
        // 70px reserves room for the y-axis labels on the right.
        const available = container.clientWidth - 70;
        const fitted = Math.max(4, Math.min(30, available / bars.length));
        chart.setBarSpace(fitted);
        hasAutoFittedRef.current = true;
      } else {
        chart.setBarSpace(previousBarSpace);
        chart.setOffsetRightDistance(previousOffsetRight);
      }
    }
  }, [bars]);

  // Theme + candle-style — re-apply styles whenever either changes.
  useEffect(() => {
    // @ts-expect-error klinecharts setStyles DeepPartial<Styles> mismatch with readonly literal
    chartRef.current?.setStyles(buildChartStyles(theme, candleStyle));
  }, [theme, candleStyle]);

  // Refit bar width only for the very first container measurement (the
  // initial render before bars have laid out). After the chart has been
  // auto-fitted once, the user's zoom is the source of truth — window
  // resizes, sidebar toggles, fullscreen, and run/session switches all
  // preserve it. KLineCharts handles canvas resize internally.
  useEffect(() => {
    const container = containerRef.current;
    const chart = chartRef.current;
    if (!container || !chart) return;
    const observer = new ResizeObserver(() => {
      if (hasAutoFittedRef.current || !bars.length) return;
      const available = container.clientWidth - 70;
      const fitted = Math.max(4, Math.min(30, available / bars.length));
      chart.setBarSpace(fitted);
      hasAutoFittedRef.current = true;
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [bars]);

  // Browser fullscreen API — toggle the chart card in/out of fullscreen.
  // Sync local state with `fullscreenchange` events so the button reflects
  // the actual browser state (handles Esc-to-exit correctly).
  useEffect(() => {
    const handler = () =>
      setIsFullscreen(document.fullscreenElement === chartCardRef.current);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const toggleFullscreen = () => {
    if (!chartCardRef.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      chartCardRef.current.requestFullscreen?.().catch(() => {});
    }
  };

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

  // Entry dots on the VWAP line — one per executed entry. Tied to
  // VWAP visibility (no line, no dots). Click handling lives in the
  // container `onClick` handler below so the popover can position
  // itself relative to the chart bounds.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    for (const id of entryDotIds.current) chart.removeOverlay({ id });
    entryDotIds.current = [];
    if (!showVwap) return;
    for (const e of entries) {
      const result = chart.createOverlay({
        name: "vwapDot",
        points: [{ timestamp: e.ts, value: e.vwap }],
        styles: {
          // White fill + amber stroke. `stroke_fill` is required — the
          // default `"fill"` mode draws no border at all.
          polygon: {
            style: "stroke_fill",
            color: "#ffffff",
            borderColor: "#f5a524",
            borderSize: 3,
          },
        },
      });
      const id = Array.isArray(result) ? result[0] : result;
      if (typeof id === "string") entryDotIds.current.push(id);
    }
  }, [entries, showVwap]);

  // Exit dots on the VWAP line — one per exited/force_flat row.
  // Border color matches the exit marker color (green/red/gray) so
  // entry and exit dots are visually distinguishable.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    for (const id of exitDotIds.current) chart.removeOverlay({ id });
    exitDotIds.current = [];
    if (!showVwap) return;
    for (const e of exits) {
      const result = chart.createOverlay({
        name: "vwapDot",
        points: [{ timestamp: e.ts, value: e.vwap }],
        styles: {
          polygon: {
            style: "stroke_fill",
            color: "#ffffff",
            borderColor: e.color,
            borderSize: 3,
          },
        },
      });
      const id = Array.isArray(result) ? result[0] : result;
      if (typeof id === "string") exitDotIds.current.push(id);
    }
  }, [exits, showVwap]);

  // Rejection clusters — grey "Rej · ×N" tags above rejected bars when
  // `showRejections` is on. Cluster-collapse per FR-008.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    for (const id of rejectionClusterIds.current) chart.removeOverlay({ id });
    rejectionClusterIds.current = [];
    if (!showRejections) return;
    const rejectionRows = journal.filter((r) => r.status === "rejected");
    if (rejectionRows.length === 0 || bars.length === 0) return;
    const clusters = clusterRejections(rejectionRows, bars);
    const barHighByTimestamp = new Map<string, number>();
    for (const b of bars) barHighByTimestamp.set(b.timestamp, b.high);
    rejectionClusterIds.current = createRejectionClusterOverlays(
      chart,
      clusters,
      barHighByTimestamp,
    );
  }, [showRejections, journal, bars]);

  // OR high/low — labeled horizontal lines via `simpleTag`. extendData
  // is the tag text.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    for (const id of orOverlayIds.current) chart.removeOverlay({ id });
    orOverlayIds.current = [];
    if (!(showOR && or)) return;
    const pushId = (raw: unknown) => {
      const id = Array.isArray(raw) ? raw[0] : raw;
      if (typeof id === "string") orOverlayIds.current.push(id);
    };
    pushId(
      chart.createOverlay({
        name: "labeledLevel",
        extendData: `OR Hi ${or.high.toFixed(2)}`,
        points: [{ value: or.high }],
        styles: {
          line: { color: "#14b884", style: "dashed", size: 1 },
          text: { ...TAG_TEXT_BASE, backgroundColor: "#0f9e6e" },
        },
      }),
    );
    pushId(
      chart.createOverlay({
        name: "labeledLevel",
        extendData: `OR Lo ${or.low.toFixed(2)}`,
        points: [{ value: or.low }],
        styles: {
          line: { color: "#f04f6a", style: "dashed", size: 1 },
          text: { ...TAG_TEXT_BASE, backgroundColor: "#f04f6a" },
        },
      }),
    );
  }, [or, showOR]);

  // Swing-pivot S/R levels — R for resistance, S for support.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    for (const id of srOverlayIds.current) chart.removeOverlay({ id });
    srOverlayIds.current = [];
    if (!showSR) return;
    const pushId = (raw: unknown) => {
      const id = Array.isArray(raw) ? raw[0] : raw;
      if (typeof id === "string") srOverlayIds.current.push(id);
    };
    for (const level of pivots.highs) {
      pushId(
        chart.createOverlay({
          name: "labeledLevel",
          extendData: `R ${level.toFixed(2)}`,
          points: [{ value: level }],
          styles: {
            line: { color: "#f04f6a", style: "dashed", size: 1 },
            text: { ...TAG_TEXT_BASE, backgroundColor: "#f04f6a" },
          },
        }),
      );
    }
    for (const level of pivots.lows) {
      pushId(
        chart.createOverlay({
          name: "labeledLevel",
          extendData: `S ${level.toFixed(2)}`,
          points: [{ value: level }],
          styles: {
            line: { color: "#0f9e6e", style: "dashed", size: 1 },
            text: { ...TAG_TEXT_BASE, backgroundColor: "#0f9e6e" },
          },
        }),
      );
    }
  }, [pivots, showSR]);

  // "VWAP" pill — labels the indicator's own line. Anchored to the
  // first VWAP value so the pill sits at the left edge of the chart
  // where the line starts. Text only; the VWAP indicator draws the
  // line itself, so no horizontal overlay line is needed.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (vwapTagId.current) {
      chart.removeOverlay({ id: vwapTagId.current });
      vwapTagId.current = null;
    }
    if (!showVwap || vwap.length === 0) return;
    const result = chart.createOverlay({
      name: "pill",
      extendData: "VWAP",
      points: [{ value: vwap[0].value }],
      styles: {
        text: { ...TAG_TEXT_BASE, backgroundColor: "#f5a524" },
      },
    });
    const id = Array.isArray(result) ? result[0] : result;
    if (typeof id === "string") vwapTagId.current = id;
  }, [vwap, showVwap]);

  // "Last" pill — labels the built-in last-close price marker that
  // klinecharts draws by default. Same labeledLevel overlay as OR/SR
  // so the visual treatment is consistent.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (lastOverlayId.current) {
      chart.removeOverlay({ id: lastOverlayId.current });
      lastOverlayId.current = null;
    }
    if (!lastClose) return;
    const result = chart.createOverlay({
      name: "labeledLevel",
      extendData: `Last ${lastClose.value.toFixed(2)}`,
      points: [{ value: lastClose.value }],
      styles: {
        line: { color: lastClose.color, style: "dashed", size: 1 },
        text: { ...TAG_TEXT_BASE, backgroundColor: lastClose.color },
      },
    });
    const id = Array.isArray(result) ? result[0] : result;
    if (typeof id === "string") lastOverlayId.current = id;
  }, [lastClose]);

  // Markers — entry/exit/rejection annotations anchored to the VWAP
  // dot for that bar, with the pill offset above or below so it never
  // sits on the VWAP line. A thin stem connects the dot to the pill.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.removeOverlay({ name: "tradeRationaleTag" });
    if (!showMarkers) return;
    if (!markers.length || !bars.length) return;
    const vwapByTs = new Map<number, number>();
    for (const p of vwap) vwapByTs.set(new Date(p.time).getTime(), p.value);
    const barByTs = new Map<number, BarView>();
    bars.forEach((b) => barByTs.set(new Date(b.timestamp).getTime(), b));
    markers.forEach((m) => {
      const ts = new Date(m.time).getTime();
      const value = vwapByTs.get(ts) ?? barByTs.get(ts)?.high;
      if (value == null) return;
      const direction: "above" | "below" =
        m.text.startsWith("Stop") || m.text.startsWith("Force")
          ? "below"
          : "above";
      chart.createOverlay({
        name: "tradeRationaleTag",
        points: [{ timestamp: ts, value }],
        extendData: { text: m.text, direction },
        styles: {
          line: { color: m.color, size: 1.5 },
          // KLineCharts text figures need `style: "stroke_fill"` to render
          // a border around the padded background. Without it, only the
          // fill is drawn and the white border is invisible.
          text: {
            style: "stroke_fill",
            color: "#ffffff",
            backgroundColor: m.color,
            borderColor: "#ffffff",
            borderSize: 1.5,
            borderStyle: "solid",
            size: 13,
            weight: "600",
            paddingLeft: 10,
            paddingRight: 10,
            paddingTop: 6,
            paddingBottom: 6,
            borderRadius: 999, // pill shape, not rectangle
          },
        },
      });
    });
  }, [markers, bars, vwap, showMarkers]);

  return (
    <section
      className={`card chart-card${isFullscreen ? " chart-card-fullscreen" : ""}`}
      ref={chartCardRef}
    >
      <div
        className="flex items-center text-xs border-b border-gray-200 dark:border-slate-700"
        style={{ padding: "6px 10px", gap: 6 }}
      >
        <LegendToggle
          on={showVwap}
          dotColor="#f5a524"
          label="VWAP"
          onClick={() => setShowVwap(v => !v)}
        />
        <LegendToggle
          on={showOR}
          dotColor="#16a34a"
          label="OR"
          onClick={() => setShowOR(v => !v)}
        />
        <LegendToggle
          on={showSR}
          dotColor="#94a3b8"
          label="S/R"
          onClick={() => setShowSR(v => !v)}
        />

        <span style={{ width: 1, height: 16, background: "var(--border)", margin: "0 4px" }} />

        <LegendToggle
          on={showMarkers}
          label="Markers"
          onClick={() => setShowMarkers(v => !v)}
        />
        {onToggleRejections && (
          <LegendToggle
            on={showRejections}
            label="Rejections"
            onClick={onToggleRejections}
          />
        )}

        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span className="knob-select" style={{ width: 110 }}>
            <select
              id="candle-style-select"
              value={candleStyle}
              onChange={e => setCandleStyle(e.target.value as typeof candleStyle)}
              aria-label="Candlestick style"
              style={{ fontSize: "var(--fs-xs)" }}
            >
              {CANDLE_STYLES.map(s => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <span className="sel-caret">▾</span>
          </span>
          <button
            type="button"
            className="icon-btn"
            aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            title={isFullscreen ? "Exit fullscreen (Esc)" : "Fullscreen"}
            onClick={toggleFullscreen}
            style={{ padding: 4 }}
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </span>
      </div>
      <div
        className="chart-canvas-wrap"
        style={{
          position: "relative",
          padding: "var(--sp-3) var(--sp-2)",
          background: "var(--chart-bg)",
          borderRadius: "var(--r-md)",
          marginTop: "var(--sp-2)",
        }}
      >
        <div
          ref={containerRef}
          data-chart-root
          className="w-full"
          style={{ height: 620 }}
        />
        {entryPopover && (
          <EntryRationalePopover
            row={entryPopover.row}
            priorBar={entryPopover.priorBar}
            x={entryPopover.x}
            y={entryPopover.y}
            accountValue={accountValue}
            positionCapPct={positionCapPct}
            onClose={() => setEntryPopover(null)}
          />
        )}
        {exitPopover && (
          <ExitRationalePopover
            row={exitPopover.row}
            entryTimestamp={exitPopover.entryTimestamp}
            x={exitPopover.x}
            y={exitPopover.y}
            onClose={() => setExitPopover(null)}
          />
        )}
      </div>
      {displayBar && (
        <BarDetailsRow
          bar={displayBar}
          vwap={selectedVwap}
          prevClose={selectedPrevClose}
          journal={selectedJournal}
          isSelected={selectedBar !== null}
        />
      )}
    </section>
  );
}

function EntryRationalePopover({
  row,
  priorBar,
  x,
  y,
  accountValue,
  positionCapPct,
  onClose,
}: {
  row: JournalRowView;
  priorBar: BarView | null;
  x: number;
  y: number;
  accountValue: number;
  positionCapPct: number;
  onClose: () => void;
}) {
  const r: EntryRationale = useMemo(
    () => entryRationale(row, priorBar, accountValue, positionCapPct),
    [row, priorBar, accountValue, positionCapPct],
  );
  const time = new Date(row.timestamp).toLocaleString("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const POPOVER_WIDTH = 340;
  // Clamp so the popover doesn't fall off the chart's right edge. Place
  // ~14px to the right of the dot, vertically centred on it.
  const left = Math.max(8, x + 14);
  const top = Math.max(8, y - 30);
  return (
    <div
      role="dialog"
      aria-label="Entry rationale"
      className="absolute z-20 rounded border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 shadow-lg text-xs"
      style={{ left, top, width: POPOVER_WIDTH }}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-slate-700">
        <div className="font-semibold text-blue-600 dark:text-blue-400">
          Entry rationale
        </div>
        <div className="text-gray-500 dark:text-slate-400 font-mono">
          {time} ET
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close entry rationale"
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-800 -mr-1"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="px-3 py-2 border-b border-gray-200 dark:border-slate-700">
        <div className="uppercase tracking-wide text-[10px] text-gray-500 dark:text-slate-400 mb-1">
          Trigger
        </div>
        <ul className="space-y-1 font-mono">
          {r.triggers.map((t) => (
            <TriggerRow key={t.key} t={t} />
          ))}
        </ul>
      </div>
      <div className="px-3 py-2">
        <div className="uppercase tracking-wide text-[10px] text-gray-500 dark:text-slate-400 mb-1">
          Trade plan
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono">
          <Kv k="Entry" v={`$${r.plan.entry.toFixed(2)}`} />
          <Kv
            k="Stop"
            v={`$${r.plan.stop.toFixed(2)}`}
            tail={`-$${r.plan.riskPerShare.toFixed(2)}/sh`}
            tailClass="text-red-600 dark:text-red-400"
          />
          <Kv
            k="Target"
            v={`$${r.plan.target.toFixed(2)}`}
            tail={`+$${r.plan.rewardPerShare.toFixed(2)}/sh`}
            tailClass="text-emerald-600 dark:text-emerald-400"
          />
          <Kv k="R:R" v={r.plan.rrRatio.toFixed(2)} />
          {r.plan.qty != null && (
            <Kv k="Qty" v={`${r.plan.qty} sh`} />
          )}
          {r.plan.riskDollars != null && (
            <Kv
              k="Risk"
              v={`$${r.plan.riskDollars.toFixed(2)}`}
              tail={
                r.plan.riskPctOfAccount != null
                  ? `(${(r.plan.riskPctOfAccount * 100).toFixed(2)}%)`
                  : undefined
              }
            />
          )}
          {r.plan.positionValue != null && (
            <Kv
              k="Position"
              v={`$${r.plan.positionValue.toLocaleString("en-US", {
                maximumFractionDigits: 0,
              })}`}
              tail={
                r.plan.positionPctOfCap != null
                  ? `(${(r.plan.positionPctOfCap * 100).toFixed(0)}% cap)`
                  : undefined
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ExitRationalePopover({
  row,
  entryTimestamp,
  x,
  y,
  onClose,
}: {
  row: JournalRowView;
  entryTimestamp: string | null;
  x: number;
  y: number;
  onClose: () => void;
}) {
  const r: ExitRationale = useMemo(
    () => exitRationale(row, entryTimestamp),
    [row, entryTimestamp],
  );
  const time = new Date(row.timestamp).toLocaleString("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const POPOVER_WIDTH = 320;
  const left = Math.max(8, x + 14);
  const top = Math.max(8, y - 30);
  const headerColor =
    r.reason === "target"
      ? "text-emerald-600 dark:text-emerald-400"
      : r.reason === "stop"
        ? "text-red-600 dark:text-red-400"
        : "text-gray-600 dark:text-slate-300";
  const rColor =
    r.realizedR != null && r.realizedR >= 0
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-red-600 dark:text-red-400";
  return (
    <div
      role="dialog"
      aria-label="Exit rationale"
      className="absolute z-20 rounded border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 shadow-lg text-xs"
      style={{ left, top, width: POPOVER_WIDTH }}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-slate-700">
        <div className={cn("font-semibold", headerColor)}>{r.reasonLabel}</div>
        <div className="text-gray-500 dark:text-slate-400 font-mono">
          {time} ET
          {r.durationMinutes != null && ` · ${r.durationMinutes}m`}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close exit rationale"
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-800 -mr-1"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="px-3 py-2 border-b border-gray-200 dark:border-slate-700">
        <div className="uppercase tracking-wide text-[10px] text-gray-500 dark:text-slate-400 mb-1">
          Outcome
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono">
          <Kv k="Exit" v={`$${r.exitPrice.toFixed(2)}`} />
          {r.realizedR != null && (
            <Kv
              k="R-multiple"
              v={
                <span className={rColor}>
                  {r.realizedR >= 0 ? "+" : ""}
                  {r.realizedR.toFixed(2)}R
                </span>
              }
            />
          )}
          {r.realizedPnl != null && (
            <Kv
              k="P&L"
              v={
                <span className={rColor}>
                  {r.realizedPnl >= 0 ? "+" : "-"}$
                  {Math.abs(r.realizedPnl).toLocaleString("en-US", {
                    maximumFractionDigits: 0,
                  })}
                </span>
              }
            />
          )}
        </div>
      </div>
      {r.reason === "force_flat" ? (
        <div className="px-3 py-2 text-gray-600 dark:text-slate-300 italic">
          End-of-session safety close at 15:55 ET.
        </div>
      ) : (
        <div className="px-3 py-2">
          <div className="uppercase tracking-wide text-[10px] text-gray-500 dark:text-slate-400 mb-1">
            Plan vs actual
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono">
            {r.entry != null && (
              <Kv k="Entry" v={`$${r.entry.toFixed(2)}`} />
            )}
            {r.plannedExit != null && (
              <Kv k="Planned exit" v={`$${r.plannedExit.toFixed(2)}`} />
            )}
            <Kv k="Actual exit" v={`$${r.exitPrice.toFixed(2)}`} />
            {r.slippage != null && (
              <Kv
                k="Slippage"
                v={
                  <span
                    className={
                      r.slippage >= 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-red-600 dark:text-red-400"
                    }
                  >
                    {r.slippage >= 0 ? "+" : ""}
                    {r.slippage.toFixed(2)}
                  </span>
                }
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TriggerRow({ t }: { t: import("@/lib/entry-rationale").TriggerCheck }) {
  if (t.key === "pullback_threshold") {
    return (
      <li className="leading-snug">
        <span className="text-emerald-600 dark:text-emerald-400 mr-1">✓</span>
        <span className="text-gray-700 dark:text-slate-200">{t.label}</span>
        <span className="text-gray-500 dark:text-slate-400 ml-1">
          ({t.leftValue.toFixed(2)}%)
        </span>
      </li>
    );
  }
  const sign = t.delta >= 0 ? "+" : "";
  return (
    <li className="leading-snug">
      <span className={cn("mr-1", t.passed ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
        {t.passed ? "✓" : "✗"}
      </span>
      <span className="text-gray-700 dark:text-slate-200">{t.label}</span>
      <div className="ml-4 text-gray-500 dark:text-slate-400">
        {t.leftValue.toFixed(2)} {t.passed ? ">" : "≤"} {t.rightValue.toFixed(2)}{" "}
        <span className={t.delta >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
          ({sign}{t.delta.toFixed(2)}, {sign}{t.deltaPct.toFixed(2)}%)
        </span>
      </div>
    </li>
  );
}

function Kv({
  k,
  v,
  tail,
  tailClass = "text-gray-500 dark:text-slate-400",
}: {
  k: string;
  v: ReactNode;
  tail?: string;
  tailClass?: string;
}) {
  return (
    <>
      <span className="text-gray-500 dark:text-slate-400">{k}</span>
      <span>
        <strong>{v}</strong>
        {tail && <span className={cn("ml-1", tailClass)}>{tail}</span>}
      </span>
    </>
  );
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

function BarDetailsRow({
  bar,
  vwap,
  prevClose,
  journal,
  isSelected,
}: {
  bar: KLineData;
  vwap: number | null;
  prevClose: number | null;
  journal: JournalRowView[];
  isSelected: boolean;
}) {
  const time = new Date(bar.timestamp).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const body = bar.close - bar.open;
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
  const volShort = formatVol(bar.volume ?? 0);

  return (
    <div
      className="text-xs"
      style={{
        marginTop: 8,
        padding: "8px 12px",
        borderRadius: "var(--r-sm)",
        background: "var(--surface-1)",
        border: "1px solid var(--border)",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "baseline",
        gap: "8px 14px",
        fontFamily: "var(--mono)",
      }}
    >
      <span style={{ color: "var(--text-muted)" }}>
        {isSelected ? time : `Latest · ${time}`} ET
      </span>
      <KV label="O" value={bar.open.toFixed(2)} />
      <KV label="H" value={bar.high.toFixed(2)} />
      <KV label="L" value={bar.low.toFixed(2)} />
      <KV label="C" value={bar.close.toFixed(2)} valueClass={closeColor} />
      {change != null && changePct != null && (
        <span className={closeColor}>
          {signed(change)} ({signed(changePct * 100)}%)
        </span>
      )}
      <KV label="Vol" value={volShort} />
      {vwap != null && (
        <KV label="VWAP" value={vwap.toFixed(2)} valueClass="text-amber-600 dark:text-amber-400" />
      )}
      {distFromVwap != null && <KV label="vs VWAP" value={`${signed(distFromVwap)}%`} />}

      {journal.length > 0 && (
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "flex",
            flexWrap: "wrap",
            gap: "4px 12px",
            flexBasis: "100%",
            borderTop: "1px solid var(--border)",
            paddingTop: 6,
          }}
        >
          {journal.map((r, i) => (
            <JournalEntry key={`${r.row_seq}-${i}`} row={r} />
          ))}
        </ul>
      )}
    </div>
  );
}

function KV({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <span style={{ display: "inline-flex", gap: 4, alignItems: "baseline" }}>
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span className={valueClass} style={{ fontWeight: 600 }}>
        {value}
      </span>
    </span>
  );
}

function formatVol(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
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

// Compact pill toggle for the chart toolbar. Active = filled dot + bold label;
// inactive = faded outline. Replaces the previous text-button + line-through
// pattern which was visually heavy and inconsistent across legend items.
function LegendToggle({
  on,
  label,
  dotColor,
  onClick,
}: {
  on: boolean;
  label: string;
  dotColor?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 8px",
        borderRadius: 999,
        border: "1px solid var(--border)",
        background: on ? "var(--surface-2)" : "transparent",
        color: on ? "var(--text)" : "var(--text-muted)",
        fontSize: "var(--fs-xs)",
        fontWeight: on ? 600 : 500,
        cursor: "pointer",
        lineHeight: 1.2,
      }}
    >
      {dotColor && (
        <span
          aria-hidden
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: on ? dotColor : "var(--text-faint, #9ca3af)",
            opacity: on ? 1 : 0.4,
          }}
        />
      )}
      {label}
    </button>
  );
}
