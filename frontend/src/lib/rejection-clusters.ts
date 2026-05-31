import type { BarView, JournalRowView } from "@/api/legacy-types";

// Collapse consecutive same-reason rejection rows into clusters. A cluster
// is a maximal run of contiguous bars sharing one rejection_check.
//
// See specs/004-design-system-adoption/data-model.md and
// contracts/states.md for the invariants this function upholds.
export interface RejectionCluster {
  rejection_check: string;
  first_timestamp: string;
  last_timestamp: string;
  timestamps: string[];
  count: number;
}

export function clusterRejections(
  rows: JournalRowView[],
  bars: BarView[],
): RejectionCluster[] {
  if (rows.length === 0 || bars.length === 0) return [];

  // Map each bar timestamp to its index for O(1) lookup.
  const barIndex = new Map<string, number>();
  bars.forEach((b, i) => barIndex.set(b.timestamp, i));

  // Keep only rejected rows whose timestamp is in the bar set; carry the
  // bar index along for ordering and consecutive-bar detection.
  type Entry = {
    timestamp: string;
    check: string;
    barIdx: number;
  };
  const entries: Entry[] = [];
  for (const r of rows) {
    if (r.status !== "rejected") continue;
    const check = r.rejection_check;
    if (check == null) continue;
    const idx = barIndex.get(r.timestamp);
    if (idx == null) continue;
    entries.push({ timestamp: r.timestamp, check, barIdx: idx });
  }

  if (entries.length === 0) return [];

  // Sort by bar index (which is chronological) for deterministic clustering
  // regardless of input order.
  entries.sort((a, b) => a.barIdx - b.barIdx);

  const clusters: RejectionCluster[] = [];
  let current: { check: string; entries: Entry[] } | null = null;

  for (const e of entries) {
    if (current == null) {
      current = { check: e.check, entries: [e] };
      continue;
    }
    const prev = current.entries[current.entries.length - 1];
    const isConsecutive = e.barIdx === prev.barIdx + 1;
    const sameReason = e.check === current.check;
    if (isConsecutive && sameReason) {
      current.entries.push(e);
    } else {
      clusters.push(toCluster(current));
      current = { check: e.check, entries: [e] };
    }
  }
  if (current != null) clusters.push(toCluster(current));

  return clusters;
}

function toCluster(group: {
  check: string;
  entries: Array<{ timestamp: string; check: string; barIdx: number }>;
}): RejectionCluster {
  const timestamps = group.entries.map((e) => e.timestamp);
  return {
    rejection_check: group.check,
    first_timestamp: timestamps[0],
    last_timestamp: timestamps[timestamps.length - 1],
    timestamps,
    count: timestamps.length,
  };
}
