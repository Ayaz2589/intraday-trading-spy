import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { humanize } from "@/lib/format";
import type { JournalRowView } from "@/api/types";

const COLORS: Record<JournalRowView["status"], string> = {
  emitted:
    "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/40 dark:text-blue-200 dark:border-blue-800",
  approved:
    "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/40 dark:text-blue-200 dark:border-blue-800",
  rejected:
    "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/40 dark:text-red-200 dark:border-red-800",
  executed:
    "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/40 dark:text-green-200 dark:border-green-800",
  exited:
    "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200 dark:border-emerald-800",
  force_flat:
    "bg-gray-100 text-gray-800 border-gray-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700",
  lockout:
    "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/40 dark:text-orange-200 dark:border-orange-800",
};

export function StatusBadge({ status }: { status: JournalRowView["status"] }) {
  return <Badge className={cn(COLORS[status])}>{humanize(status)}</Badge>;
}
