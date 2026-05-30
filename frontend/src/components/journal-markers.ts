import type { JournalRowView } from "@/api/types";
import type { ChartMarker } from "./price-chart";

const EXIT_COLOR: Record<NonNullable<JournalRowView["exit_reason"]>, string> = {
  target: "#10b981",
  stop: "#ef4444",
  force_flat: "#6b7280",
};

const EXIT_LABEL: Record<NonNullable<JournalRowView["exit_reason"]>, string> = {
  target: "Target",
  stop: "Stop",
  force_flat: "Force Flat",
};

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
        color: "#3b82f6",
        shape: "arrowUp",
        text: price != null ? `Entry $${price.toFixed(2)}` : "Entry",
      });
    } else if (r.status === "exited" || r.status === "force_flat") {
      const reason = r.exit_reason ?? "force_flat";
      const color = EXIT_COLOR[reason];
      const parts = [EXIT_LABEL[reason]];
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
        color: "#9ca3af",
        shape: "square",
        text: "Rejected",
      });
    }
  }
  return markers;
}
