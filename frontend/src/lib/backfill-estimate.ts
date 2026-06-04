import type { BackfillJobView } from '@/api/bars'

// Data-page redesign: the pre-launch estimate line ("103 windows · est 1m 40s")
// and the job-history stats row. All derived from data the page already has —
// nothing persisted, purely informational.

// Mirror of backend `api.backfill.window_days` (config.yaml): the backfill
// splits a range into ~monthly fetch windows.
const WINDOW_DAYS = 30
const MS_PER_DAY = 86_400_000

/** How many fetch windows a [start, end] range becomes (inclusive days / 30). */
export function estimateWindows(startIso: string, endIso: string): number {
  const start = new Date(`${startIso}T00:00:00Z`).getTime()
  const end = new Date(`${endIso}T00:00:00Z`).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0
  const inclusiveDays = Math.round((end - start) / MS_PER_DAY) + 1
  return Math.ceil(inclusiveDays / WINDOW_DAYS)
}

/** Estimated duration = median per-window pace of recent finished jobs ×
 * windows. Null when there's no usable history (the UI then omits the est). */
export function estimateDurationMs(jobs: BackfillJobView[], windows: number): number | null {
  const paces = jobs
    .filter((j) => j.status === 'finished' && j.windows_done > 0 && j.created_at && j.updated_at)
    .map((j) => (new Date(j.updated_at as string).getTime() - new Date(j.created_at as string).getTime()) / j.windows_done)
    .filter((p) => Number.isFinite(p) && p > 0)
    .sort((a, b) => a - b)
  if (paces.length === 0 || windows <= 0) return null
  const median =
    paces.length % 2 === 1
      ? paces[(paces.length - 1) / 2]
      : (paces[paces.length / 2 - 1] + paces[paces.length / 2]) / 2
  return Math.round(median * windows)
}

/** "4s" / "1m 40s" — shared by the estimate line and the job rows' Took column. */
export function formatMs(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

export function jobStats(jobs: BackfillJobView[]): {
  total: number
  finished: number
  failed: number
  barsAdded: number
} {
  return {
    total: jobs.length,
    finished: jobs.filter((j) => j.status === 'finished').length,
    failed: jobs.filter((j) => j.status === 'failed').length,
    barsAdded: jobs.reduce((n, j) => n + (j.bars_added || 0), 0),
  }
}
