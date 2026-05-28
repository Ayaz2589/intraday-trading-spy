import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "./status-badge";
import { HelpTooltip } from "./help-tooltip";
import type { JournalRowView } from "@/api/types";

function f(v: number | null, digits = 4): string {
  return v == null ? "—" : v.toFixed(digits);
}

export function JournalTable({ rows }: { rows: JournalRowView[] }) {
  return (
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
        {rows.map((r) => (
          <TableRow key={r.row_seq}>
            <TableCell className="font-mono text-xs">
              {r.timestamp.slice(11, 16)}
            </TableCell>
            <TableCell>
              <StatusBadge status={r.status} />
            </TableCell>
            <TableCell className="font-mono text-xs">
              {r.setup ?? "—"}
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
              {r.rejection_check ?? r.reason}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
