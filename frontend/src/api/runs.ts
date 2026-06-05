import { apiRequest } from './client'
import type {
  BarListResponse,
  JournalListResponse,
  Run,
  RunListResponse,
  RunManifestResponse,
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

export function listBars(
  runId: UUID,
  opts: { session?: string } = {}
): Promise<BarListResponse> {
  // session=YYYY-MM-DD limits the response to one ET day (~78 bars) — a
  // year-long study child run is ~20k bars, far too heavy to ship at once.
  return apiRequest<BarListResponse>(`/api/runs/${runId}/bars`, { searchParams: opts })
}

export function listRunSessions(runId: UUID): Promise<{ sessions: string[] }> {
  return apiRequest<{ sessions: string[] }>(`/api/runs/${runId}/sessions`)
}

export function getManifest(runId: UUID): Promise<RunManifestResponse> {
  return apiRequest<RunManifestResponse>(`/api/runs/${runId}/manifest`)
}

export function deleteRun(runId: UUID): Promise<{ deleted: string }> {
  return apiRequest<{ deleted: string }>(`/api/runs/${runId}`, { method: 'DELETE' })
}

export function deleteAllRuns(): Promise<{ deleted_count: number }> {
  return apiRequest<{ deleted_count: number }>('/api/runs', { method: 'DELETE' })
}

export function setRunFavorite(runId: UUID, is_favorite: boolean): Promise<Run> {
  return apiRequest<Run>(`/api/runs/${runId}`, { method: 'PATCH', body: { is_favorite } })
}
