import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HelpTooltip } from "./help-tooltip";
import { humanize } from "@/lib/format";
import type { HelpContentKey } from "./help-content";

const HELP_BY_REASON: Partial<Record<string, HelpContentKey>> = {
  position_value_exceeds_cap: "position_cap",
  cooldown_active: "cooldown",
  daily_loss_limit_reached: "lockout",
};

export function RejectionBreakdownCard({
  breakdown,
  total,
}: {
  breakdown: Record<string, number>;
  total: number;
}) {
  const items = Object.entries(breakdown).sort(([, a], [, b]) => b - a);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          Rejections ({total})
          <HelpTooltip helpKey="rejected_signal" />
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-slate-400">No rejections.</p>
        ) : (
          <ul>
            {items.map(([reason, count]) => {
              const helpKey = HELP_BY_REASON[reason];
              return (
                <li key={reason} className="flex justify-between text-sm py-1">
                  <span className="flex items-center" title={reason}>
                    {humanize(reason)}
                    {helpKey && <HelpTooltip helpKey={helpKey} />}
                  </span>
                  <span>{count}</span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
