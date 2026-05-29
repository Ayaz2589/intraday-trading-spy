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
        {visible.map((r) => (
          <TableRow key={r.row_seq}>
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
        ))}
      </TableBody>
    </Table>
    </div>
    </TooltipProvider>
  );
}
