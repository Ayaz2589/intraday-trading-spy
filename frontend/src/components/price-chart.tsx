import { useEffect, useRef } from "react";
import {
  createChart,
  createSeriesMarkers,
  CandlestickSeries,
  LineSeries,
  type UTCTimestamp,
} from "lightweight-charts";
import { HelpTooltip } from "./help-tooltip";
import type { BarView } from "@/api/types";

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

  useEffect(() => {
    if (!ref.current) return;
    const chart = createChart(ref.current, {
      height: 400,
      layout: {
        background: { color: "#ffffff" },
        textColor: "#333333",
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "#f3f4f6" },
        horzLines: { color: "#f3f4f6" },
      },
      timeScale: { timeVisible: true, secondsVisible: false },
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
    if (vwap.length) {
      const line = chart.addSeries(LineSeries, {
        color: "#3b82f6",
        lineWidth: 1,
      });
      line.setData(
        ascendingByTime(
          vwap.map((p) => ({ time: toUtc(p.time), value: p.value })),
        ),
      );
    }
    if (or) {
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
    if (markers.length) {
      const mapped = markers.map((m) => ({
        time: toUtc(m.time),
        position: m.position,
        color: m.color,
        shape: m.shape,
        text: m.text,
      }));
      // Markers must be sorted by time too. Unlike candles/lines, duplicate
      // timestamps ARE allowed (entry + rejected on the same bar), so only sort.
      mapped.sort((a, b) => a.time - b.time);
      createSeriesMarkers(candles, mapped);
    }
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [bars, vwap, or, markers]);

  return (
    <div className="border rounded bg-white">
      <div className="flex gap-4 p-2 text-xs items-center border-b">
        <span className="flex items-center">
          <span className="w-3 h-0.5 bg-blue-500 mr-1" />
          VWAP
          <HelpTooltip helpKey="vwap" />
        </span>
        <span className="flex items-center">
          <span className="w-3 h-0.5 bg-green-500 mr-1" />
          OR high / low
          <HelpTooltip helpKey="opening_range" />
        </span>
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
