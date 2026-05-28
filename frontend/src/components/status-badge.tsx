import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { JournalRowView } from "@/api/types";

const COLORS: Record<JournalRowView["status"], string> = {
  emitted: "bg-blue-100 text-blue-800 border-blue-200",
  approved: "bg-blue-100 text-blue-800 border-blue-200",
  rejected: "bg-red-100 text-red-800 border-red-200",
  executed: "bg-green-100 text-green-800 border-green-200",
  exited: "bg-emerald-100 text-emerald-800 border-emerald-200",
  force_flat: "bg-gray-100 text-gray-800 border-gray-200",
  lockout: "bg-orange-100 text-orange-800 border-orange-200",
};

export function StatusBadge({ status }: { status: JournalRowView["status"] }) {
  return <Badge className={cn(COLORS[status])}>{status}</Badge>;
}
