import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpTooltip } from "./help-tooltip";
import type { SummaryMetricsView } from "@/api/types";
import type { HelpContentKey } from "./help-content";

function Metric({
  label,
  value,
  helpKey,
}: {
  label: string;
  value: string;
  helpKey: HelpContentKey;
}) {
  return (
    <div>
      <div className="text-xs text-gray-500 dark:text-slate-400 flex items-center">
        {label}
        <HelpTooltip helpKey={helpKey} />
      </div>
      <div className="text-lg font-mono">{value}</div>
    </div>
  );
}

export function SummaryMetricsCard({
  summary,
}: {
  summary: SummaryMetricsView;
}) {
  const pf = summary.profit_factor;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Summary</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-4 gap-4">
        <Metric
          label="Total Trades"
          value={String(summary.total_trades)}
          helpKey="risk_per_trade"
        />
        <Metric
          label="W/L"
          value={`${summary.wins} / ${summary.losses}`}
          helpKey="win_rate"
        />
        <Metric
          label="Win Rate"
          value={`${(summary.win_rate * 100).toFixed(1)}%`}
          helpKey="win_rate"
        />
        <Metric
          label="Average R"
          value={summary.average_r.toFixed(3)}
          helpKey="r_multiple"
        />
        <Metric
          label="Total R"
          value={(summary.total_r >= 0 ? "+" : "") + summary.total_r.toFixed(3)}
          helpKey="r_multiple"
        />
        <Metric
          label="Max Drawdown"
          value={`${summary.max_drawdown_r.toFixed(3)}R`}
          helpKey="max_drawdown"
        />
        <Metric
          label="Profit Factor"
          value={pf == null ? "—" : pf.toFixed(3)}
          helpKey="profit_factor"
        />
      </CardContent>
    </Card>
  );
}
