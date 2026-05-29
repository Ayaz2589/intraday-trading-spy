import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
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

function ExpandedRow({ row }: { row: JournalRowView }) {
  return (
    <TableCell colSpan={11} className="bg-gray-50 dark:bg-slate-800/50 p-4">
      <div className="grid grid-cols-3 gap-x-6 gap-y-3 text-xs">
        <Section title="Indicator snapshot">
          <Field label="VWAP" value={f(row.vwap, 2)} />
          <Field label="OR high" value={f(row.or_high, 2)} />
          <Field label="OR low" value={f(row.or_low, 2)} />
          <Field
            label="Distance from VWAP %"
            value={f(row.distance_from_vwap_pct, 3)}
          />
          <Field label="Prior bar close" value={f(row.prior_bar_close, 2)} />
        </Section>
        <Section title="Planned trade">
          <Field label="Direction" value={row.direction ?? "—"} />
          <Field label="Planned entry" value={f(row.planned_entry, 2)} />
          <Field label="Stop loss" value={f(row.stop_loss, 2)} />
          <Field label="Take profit" value={f(row.take_profit, 2)} />
          <Field label="Quantity" value={row.quantity?.toString() ?? "—"} />
          <Field
            label="Planned risk $"
            value={f(row.planned_risk_dollars, 2)}
          />
        </Section>
        <Section title="Outcome">
          <Field label="Actual entry" value={f(row.actual_entry, 2)} />
          <Field label="Actual exit" value={f(row.actual_exit, 2)} />
          <Field
            label="Exit reason"
            value={row.exit_reason ? humanize(row.exit_reason) : "—"}
          />
          <Field label="Realized R" value={f(row.realized_r, 3)} />
          <Field label="Realized $" value={f(row.realized_pnl, 2)} />
          <Field
            label="Same-bar tiebreak"
            value={row.same_bar_tiebreak ? humanize(row.same_bar_tiebreak) : "—"}
          />
        </Section>
        <div className="col-span-3 pt-2 border-t border-gray-200 dark:border-slate-700">
          <div className="text-gray-500 dark:text-slate-400 mb-1">
            Full reason
          </div>
          <div className="font-mono">{row.reason}</div>
          {row.rejection_check && (
            <>
              <div className="text-gray-500 dark:text-slate-400 mt-2 mb-1">
                Rejection check
              </div>
              <div className="font-mono">{row.rejection_check}</div>
            </>
          )}
        </div>
      </div>
    </TableCell>
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
      <div className="font-semibold mb-1.5 text-gray-700 dark:text-slate-300">
        {title}
      </div>
      <dl className="space-y-1">{children}</dl>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-gray-500 dark:text-slate-400">{label}</dt>
      <dd className="font-mono">{value}</dd>
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
    <div className="space-y-2">
      {onFilterChange && (
        <div className="flex gap-1 flex-wrap">
          {FILTERS.map((f) => (
            <Button
              key={f}
              size="sm"
              variant={f === filter ? "default" : "outline"}
              onClick={() => onFilterChange(f)}
            >
              {humanize(f)}
            </Button>
          ))}
        </div>
      )}
      <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8"></TableHead>
          <TableHead>Time</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Setup</TableHead>
          <TableHead>Entry</TableHead>
          <TableHead className="flex items-center">
            Stop<HelpTooltip helpKey="stop_loss" />
          </TableHead>
          <TableHead className="flex items-center">
            Target<HelpTooltip helpKey="take_profit" />
          </TableHead>
          <TableHead>Qty</TableHead>
          <TableHead className="flex items-center">
            Risk $<HelpTooltip helpKey="risk_per_trade" />
          </TableHead>
          <TableHead>Realized R</TableHead>
          <TableHead>Reason / Check</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {visible.map((r) => {
          const isOpen = expanded.has(r.row_seq);
          return (
          <Fragment key={r.row_seq}>
          <TableRow>
            <TableCell className="p-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => toggleExpand(r.row_seq)}
                aria-label={`${isOpen ? "Collapse" : "Expand"} row ${r.row_seq}`}
              >
                {isOpen ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>
            </TableCell>
            <TableCell className="font-mono text-xs">
              {r.timestamp.slice(11, 16)}
            </TableCell>
            <TableCell>
              <StatusBadge status={r.status} />
            </TableCell>
            <TableCell className="text-xs">
              {humanize(r.setup) || "—"}
            </TableCell>
            <TableCell className="font-mono">{f(r.planned_entry, 2)}</TableCell>
            <TableCell className="font-mono">{f(r.stop_loss, 2)}</TableCell>
            <TableCell className="font-mono">{f(r.take_profit, 2)}</TableCell>
            <TableCell className="font-mono">{r.quantity ?? "—"}</TableCell>
            <TableCell className="font-mono">
              {f(r.planned_risk_dollars, 2)}
            </TableCell>
            <TableCell className="font-mono">{f(r.realized_r, 3)}</TableCell>
            <TableCell className="text-xs">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help underline decoration-dotted decoration-gray-400 underline-offset-2">
                    {r.rejection_check
                      ? humanize(r.rejection_check)
                      : truncate(r.reason, 40)}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="left">
                  {r.rejection_check ?? r.reason}
                </TooltipContent>
              </Tooltip>
            </TableCell>
          </TableRow>
          {isOpen && (
            <TableRow>
              <ExpandedRow row={r} />
            </TableRow>
          )}
          </Fragment>
          );
        })}
      </TableBody>
    </Table>
    </div>
    </TooltipProvider>
  );
}
