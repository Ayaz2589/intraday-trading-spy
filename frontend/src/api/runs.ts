import { apiRequest } from './client'
import type {
  JournalListResponse,
  Run,
  RunListResponse,
  RunStatusResponse,
  SignalListResponse,
  TradeListResponse,
  UUID,
} from './types'

export function listRuns(opts: { limit?: number; cursor?: string } = {}): Promise<RunListResponse> {
  return apiRequest<RunListResponse>('/api/runs', { searchParams: opts })
}

export function getRun(runId: UUID): Promise<Run> {
  return apiRequest<Run>(`/api/runs/${runId}`)
}

export function getRunStatus(runId: UUID): Promise<RunStatusResponse> {
  return apiRequest<RunStatusResponse>(`/api/runs/${runId}/status`)
}

export function listTrades(
  runId: UUID,
  opts: { limit?: number; cursor?: string } = {}
): Promise<TradeListResponse> {
  return apiRequest<TradeListResponse>(`/api/runs/${runId}/trades`, { searchParams: opts })
}

export function listSignals(
  runId: UUID,
  opts: { executed?: boolean; limit?: number; cursor?: string } = {}
): Promise<SignalListResponse> {
  return apiRequest<SignalListResponse>(`/api/runs/${runId}/signals`, { searchParams: opts })
}

export function listJournal(
  runId: UUID,
  opts: { limit?: number; cursor?: string } = {}
): Promise<JournalListResponse> {
  return apiRequest<JournalListResponse>(`/api/runs/${runId}/journal`, { searchParams: opts })
}
