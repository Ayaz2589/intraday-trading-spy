import type { JournalRowView } from "@/api/types";
import type { ChartMarker } from "./price-chart";

const EXIT_COLOR: Record<NonNullable<JournalRowView["exit_reason"]>, string> = {
  target: "#10b981",
  stop: "#ef4444",
  force_flat: "#6b7280",
};

const EXIT_PREFIX: Record<NonNullable<JournalRowView["exit_reason"]>, string> = {
  target: "T",
  stop: "S",
  force_flat: "FF",
};

const signedR = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}R`;

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
        text: price != null ? `E ${price.toFixed(2)}` : "E",
      });
    } else if (r.status === "exited" || r.status === "force_flat") {
      const reason = r.exit_reason ?? "force_flat";
      const color = EXIT_COLOR[reason];
      const parts = [EXIT_PREFIX[reason]];
      if (r.realized_r != null) parts.push(signedR(r.realized_r));
      markers.push({
        time: r.timestamp,
        position: "aboveBar",
        color,
        shape: "arrowDown",
        text: parts.join(" "),
      });
    } else if (r.status === "rejected" && opts.showRejections) {
      markers.push({
        time: r.timestamp,
        position: "aboveBar",
        color: "#9ca3af",
        shape: "square",
        text: "✕",
      });
    }
  }
  return markers;
}
