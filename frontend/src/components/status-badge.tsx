import { humanize } from "@/lib/format";
import type { JournalRowView } from "@/api/types";

// StatusBadge — design's `.badge` + `.badge-dot` styling.
// Mapping per contracts/components.md:
//  Emitted=info, Approved=info, Executed=profit, Exited=warn,
//  Rejected=loss, Lockout=faint, ForceFlat=accent.
const TONE: Record<JournalRowView["status"], string> = {
  emitted: "info",
  approved: "info",
  executed: "profit",
  exited: "warn",
  rejected: "loss",
  lockout: "faint",
  force_flat: "accent",
};

export function StatusBadge({ status }: { status: JournalRowView["status"] }) {
  const tone = TONE[status];
  return (
    <span className={`badge badge-${tone}`}>
      <span className="badge-dot" />
      {humanize(status)}
    </span>
  );
}
