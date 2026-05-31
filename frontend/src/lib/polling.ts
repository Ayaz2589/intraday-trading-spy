/**
 * Adaptive polling helper (clarification Q1).
 *
 * Used as TanStack Query's `refetchInterval` for per-resource status queries.
 */
import type { Query } from '@tanstack/react-query'
import { POLLING_INFLIGHT_MS, POLLING_TERMINAL_MS } from '@/config'
import type { RunStatus } from '@/api/types'

type StatusBearing = { status?: RunStatus | undefined }

export function adaptivePollingInterval<TData extends StatusBearing>(
  query: Query<TData, Error>
): number | false {
  const data = query.state.data
  if (!data) return POLLING_INFLIGHT_MS
  if (data.status === 'queued' || data.status === 'running') return POLLING_INFLIGHT_MS
  if (data.status === 'finished' || data.status === 'failed') return POLLING_TERMINAL_MS
  return false
}
