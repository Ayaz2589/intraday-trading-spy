import type { JournalRowView } from "@/api/types";
import type { ChartMarker } from "./price-chart";

// Pill backgrounds use design tokens so the chart palette stays cohesive
// with the rest of the dashboard.
const EXIT_COLOR: Record<NonNullable<JournalRowView["exit_reason"]>, string> = {
  target: "#14b884", // --profit (dark)
  stop: "#f04f6a", // --loss (dark)
  force_flat: "#66738c", // --text-faint (dark) — neutral
};

const EXIT_LABEL: Record<NonNullable<JournalRowView["exit_reason"]>, string> = {
  target: "Target",
  stop: "Stop",
  force_flat: "Force Flat",
};

const ENTRY_COLOR = "#2563eb"; // --accent

// R-multiple: how many "R" (risk units) the trade gained or lost.
// +1.0R = made exactly what was risked. -1.0R = lost exactly what
// was risked. Capital-invariant — lets us compare trades regardless
// of position size.
const signedR = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}R`;

// Signed dollar amount with thousands separator. +$1,200 / -$350.
const signedDollar = (n: number) => {
  const sign = n >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", {
    maximumFractionDigits: 0,
  })}`;
};

// Compact one-line marker text. Richer detail (time, qty, hold duration)
// lives in the click-to-inspect rationale popover, not on the chart.
export function buildMarkers(
  rows: JournalRowView[],
  opts: { showRejections: boolean },
): ChartMarker[] {
  const markers: ChartMarker[] = [];
  for (const r of rows) {
    if (r.status === "executed") {
      const price = r.actual_entry ?? r.planned_entry;
      markers.push({
        time: r.timestamp,
        position: "belowBar",
        color: ENTRY_COLOR,
        shape: "arrowUp",
        text: price != null ? `Entry $${price.toFixed(2)}` : "Entry",
      });
    } else if (r.status === "exited" || r.status === "force_flat") {
      const reason = r.exit_reason ?? "force_flat";
      const color = EXIT_COLOR[reason];
      const parts: string[] = [EXIT_LABEL[reason]];
      if (r.realized_r != null) parts.push(signedR(r.realized_r));
      if (r.realized_pnl != null) parts.push(signedDollar(r.realized_pnl));
      markers.push({
        time: r.timestamp,
        position: "aboveBar",
        color,
        shape: "arrowDown",
        text: parts.join(" · "),
      });
    } else if (r.status === "rejected" && opts.showRejections) {
      markers.push({
        time: r.timestamp,
        position: "aboveBar",
        color: "#66738c", // --text-faint
        shape: "square",
        text: "Rejected",
      });
    }
  }
  return markers;
}
