import { Fragment, useState } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { StatusBadge } from "./status-badge";
import { HelpTooltip } from "./help-tooltip";
import { humanize, truncate } from "@/lib/format";
import type { JournalFilter, JournalRowView } from "@/api/types";

const FILTERS: JournalFilter[] = [
  "all",
  "executed",
  "exited",
  "rejected",
  "lockout",
  "force_flat",
];

function f(v: number | null, digits = 4): string {
  return v == null ? "—" : v.toFixed(digits);
}

function countForFilter(rows: JournalRowView[], filter: JournalFilter): number {
  if (filter === "all") return rows.length;
  return rows.filter((r) => r.status === filter).length;
}

// ExpandedRow — 3-column detail panel per design handoff (.trade-detail).
// Spec FR-011: Indicator snapshot · Planned trade · Outcome columns + full-width
// reason; left accent rail comes from `.trade-detail::before`.
function ExpandedRow({ row }: { row: JournalRowView }) {
  return (
    <td colSpan={11}>
      <div className="trade-detail">
        <div className="dt-col">
          <div className="dt-head">Indicator snapshot</div>
          <DetailRow label="VWAP" value={f(row.vwap, 2)} />
          <DetailRow label="OR high" value={f(row.or_high, 2)} />
          <DetailRow label="OR low" value={f(row.or_low, 2)} />
          <DetailRow
            label="Distance from VWAP %"
            value={f(row.distance_from_vwap_pct, 3)}
          />
          <DetailRow label="Prior bar close" value={f(row.prior_bar_close, 2)} />
        </div>
        <div className="dt-col">
          <div className="dt-head">Planned trade</div>
          <DetailRow
            label="Direction"
            value={
              row.direction ? (
                <span className="chip chip-profit">{row.direction}</span>
              ) : (
                "—"
              )
            }
          />
          <DetailRow label="Planned entry" value={f(row.planned_entry, 2)} />
          <DetailRow
            label="Stop loss"
            value={f(row.stop_loss, 2)}
            tone="loss"
          />
          <DetailRow
            label="Take profit"
            value={f(row.take_profit, 2)}
            tone="profit"
          />
          <DetailRow label="Quantity" value={row.quantity?.toString() ?? "—"} />
          <DetailRow
            label="Planned risk $"
            value={f(row.planned_risk_dollars, 2)}
          />
        </div>
        <div className="dt-col">
          <div className="dt-head">Outcome</div>
          <DetailRow label="Actual entry" value={f(row.actual_entry, 2)} />
          <DetailRow label="Actual exit" value={f(row.actual_exit, 2)} />
          <DetailRow
            label="Exit reason"
            value={row.exit_reason ? humanize(row.exit_reason) : "—"}
          />
          <DetailRow
            label="Realized R"
            value={f(row.realized_r, 3)}
            tone={
              row.realized_r == null
                ? null
                : row.realized_r >= 0
                  ? "profit"
                  : "loss"
            }
          />
          <DetailRow
            label="Realized $"
            value={f(row.realized_pnl, 2)}
            tone={
              row.realized_pnl == null
                ? null
                : row.realized_pnl >= 0
                  ? "profit"
                  : "loss"
            }
          />
          <DetailRow
            label="Same-bar tiebreak"
            value={
              row.same_bar_tiebreak ? humanize(row.same_bar_tiebreak) : "—"
            }
          />
        </div>
        <div className="dt-reason">
          <div className="dt-head">Full reason</div>
          <p>{row.reason || "—"}</p>
          {row.rejection_check && (
            <>
              <div className="dt-head" style={{ marginTop: "var(--sp-3)" }}>
                Rejection check
              </div>
              <p className="mono" style={{ fontStyle: "normal" }}>
                {row.rejection_check}
              </p>
            </>
          )}
        </div>
      </div>
    </td>
  );
}

function DetailRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "profit" | "loss" | null;
}) {
  return (
    <div className="dt-row">
      <span className="dt-label">{label}</span>
      <span
        className="dt-value mono"
        style={tone ? { color: `var(--${tone})` } : undefined}
      >
        {value}
      </span>
    </div>
  );
}

export function JournalTable({
  rows,
  filter = "all",
  onFilterChange,
}: {
  rows: JournalRowView[];
  filter?: JournalFilter;
  onFilterChange?: (f: JournalFilter) => void;
}) {
  const visible =
    filter === "all" ? rows : rows.filter((r) => r.status === filter);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const toggleExpand = (rowSeq: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(rowSeq)) next.delete(rowSeq);
      else next.add(rowSeq);
      return next;
    });
  return (
    <TooltipProvider delayDuration={150}>
      <section className="card trades-card">
        {onFilterChange && (
          <div className="filter-tabs" role="tablist" aria-label="Status filter">
            {FILTERS.map((flt) => {
              const count = countForFilter(rows, flt);
              const isActive = flt === filter;
              return (
                <button
                  key={flt}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={isActive ? "tab tab-on" : "tab"}
                  onClick={() => onFilterChange(flt)}
                >
                  {humanize(flt)}
                  {count > 0 && <span className="tab-count">{count}</span>}
                </button>
              );
            })}
          </div>
        )}
        <div className="table-scroll">
          <table className="trades">
            <thead>
              <tr>
                <th className="th-time">Time</th>
                <th>Status</th>
                <th>Setup</th>
                <th className="th-num">Entry</th>
                <th className="th-num">
                  Stop <span className="th-sub">/ Target</span>
                  <HelpTooltip helpKey="stop_loss" />
                  <HelpTooltip helpKey="take_profit" />
                </th>
                <th className="th-num">Qty</th>
                <th className="th-num">
                  Risk $<HelpTooltip helpKey="risk_per_trade" />
                </th>
                <th className="th-num">Realized R</th>
                <th className="th-reason">Reason / Check</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const isOpen = expanded.has(r.row_seq);
                return (
                  <Fragment key={r.row_seq}>
                    <tr
                      className={isOpen ? "trow trow-open" : "trow"}
                      onClick={() => toggleExpand(r.row_seq)}
                    >
                      <td className="th-time">
                        <span className={`chevron${isOpen ? " rot" : ""}`}>
                          ›
                        </span>
                        <span className="mono">{r.timestamp.slice(11, 16)}</span>
                      </td>
                      <td>
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="setup-cell">
                        {humanize(r.setup) || "—"}
                      </td>
                      <td className="th-num mono">{f(r.planned_entry, 2)}</td>
                      <td className="th-num mono">
                        <span style={{ color: "var(--loss)" }}>
                          {f(r.stop_loss, 2)}
                        </span>
                        <span className="stk-sep"> / </span>
                        <span style={{ color: "var(--profit)" }}>
                          {f(r.take_profit, 2)}
                        </span>
                      </td>
                      <td className="th-num mono">{r.quantity ?? "—"}</td>
                      <td className="th-num mono">
                        {f(r.planned_risk_dollars, 2)}
                      </td>
                      <td
                        className="th-num mono"
                        style={
                          r.realized_r != null
                            ? {
                                color: `var(--${r.realized_r >= 0 ? "profit" : "loss"})`,
                              }
                            : undefined
                        }
                      >
                        {f(r.realized_r, 3)}
                      </td>
                      <td className="th-reason">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="reason-text">
                              {r.rejection_check
                                ? humanize(r.rejection_check)
                                : truncate(r.reason, 40)}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="left">
                            {r.rejection_check ?? r.reason}
                          </TooltipContent>
                        </Tooltip>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="detail-tr">
                        <ExpandedRow row={r} />
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </TooltipProvider>
  );
}
