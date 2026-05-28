import type { JournalRowView } from "@/api/types";
import type { ChartMarker } from "./price-chart";

const EXIT_COLOR: Record<NonNullable<JournalRowView["exit_reason"]>, string> = {
  target: "#10b981",
  stop: "#ef4444",
  force_flat: "#6b7280",
};

const signed = (n: number, suffix = "") =>
  `${n >= 0 ? "+" : ""}${n.toFixed(2)}${suffix}`;

const signedMoney = (n: number) =>
  `${n >= 0 ? "+$" : "-$"}${Math.abs(n).toFixed(2)}`;

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
        text: price != null ? `Entry @ ${price.toFixed(2)}` : "Entry",
      });
    } else if (r.status === "exited" || r.status === "force_flat") {
      const reason = r.exit_reason ?? "force_flat";
      const color = EXIT_COLOR[reason];
      const parts = ["Exit"];
      if (r.actual_exit != null) parts.push(`@ ${r.actual_exit.toFixed(2)}`);
      parts.push(`(${reason})`);
      if (r.realized_r != null) parts.push(signed(r.realized_r, "R"));
      if (r.realized_pnl != null) parts.push(signedMoney(r.realized_pnl));
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
        text: `Rejected: ${r.rejection_check ?? "unknown"}`,
      });
    }
  }
  return markers;
}
