import type { JournalRowView } from "@/api/types";

type ExitReason = "target" | "stop" | "force_flat";

export interface ExitRationale {
  reason: ExitReason;
  reasonLabel: string;
  exitPrice: number;
  realizedR: number | null;
  realizedPnl: number | null;
  entry: number | null;
  plannedExit: number | null; // take_profit for target, stop_loss for stop, null for force_flat
  slippage: number | null; // actual - planned, sign relative to long position direction
  durationMinutes: number | null;
}

const LABELS: Record<ExitReason, string> = {
  target: "Target hit",
  stop: "Stop hit",
  force_flat: "Force flat",
};

// Build the rationale for one exit row. The row carries everything we
// need (the journal copies entry-plan fields onto the exit row too).
//
//   row             the journal row (status === "exited" | "force_flat")
//   entryTimestamp  ISO timestamp of the entry row, used to compute
//                   trade duration. Pass null if unknown.
export function exitRationale(
  row: JournalRowView,
  entryTimestamp: string | null,
): ExitRationale {
  const reason: ExitReason = (row.exit_reason ?? "force_flat") as ExitReason;
  const exitPrice = row.actual_exit ?? 0;
  const entry = row.actual_entry ?? row.planned_entry ?? null;
  const plannedExit =
    reason === "target"
      ? row.take_profit
      : reason === "stop"
        ? row.stop_loss
        : null;
  // For a long position, a higher fill on a stop = better than planned
  // (less loss). A higher fill on a target = better too (more gain).
  // Either way, `actual - planned` with sign carries the right meaning.
  const slippage =
    plannedExit != null && exitPrice != null
      ? +(exitPrice - plannedExit).toFixed(4)
      : null;
  const durationMinutes =
    entryTimestamp != null
      ? Math.round(
          (new Date(row.timestamp).getTime() -
            new Date(entryTimestamp).getTime()) /
            60000,
        )
      : null;

  return {
    reason,
    reasonLabel: LABELS[reason],
    exitPrice,
    realizedR: row.realized_r,
    realizedPnl: row.realized_pnl,
    entry,
    plannedExit,
    slippage,
    durationMinutes,
  };
}
