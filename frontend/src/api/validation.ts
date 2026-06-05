import { apiRequest } from './client'
import type {
  LockboxRunRequest,
  MonteCarloRequest,
  MonteCarloResult,
  LockboxRunResponse,
  LockboxStatus,
  SignificanceRequest,
  SignificanceResult,
  StartStudyRequest,
  StartStudyResponse,
  StudyListResponse,
  StudyRerunResponse,
  UUID,
  ValidationStudy,
  ValidationStudyStatus,
} from './types'

export function startStudy(body: StartStudyRequest): Promise<StartStudyResponse> {
  return apiRequest<StartStudyResponse>('/api/validation/studies', { method: 'POST', body })
}

export function listStudies(opts: { limit?: number; cursor?: string } = {}): Promise<StudyListResponse> {
  return apiRequest<StudyListResponse>('/api/validation/studies', { searchParams: opts })
}

export function getStudy(studyId: UUID): Promise<ValidationStudy> {
  return apiRequest<ValidationStudy>(`/api/validation/studies/${studyId}`)
}

export function getStudyStatus(studyId: UUID): Promise<ValidationStudyStatus> {
  return apiRequest<ValidationStudyStatus>(`/api/validation/studies/${studyId}/status`)
}

// Feature 014 (FR-010): clone a study's kind + config + params into a fresh,
// drillable study. The original is never modified.
export function rerunStudy(studyId: UUID): Promise<StudyRerunResponse> {
  return apiRequest<StudyRerunResponse>(`/api/validation/studies/${studyId}/rerun`, {
    method: 'POST',
  })
}

export function computeSignificance(body: SignificanceRequest): Promise<SignificanceResult> {
  return apiRequest<SignificanceResult>('/api/validation/significance', { method: 'POST', body })
}

// Feature 015: on-demand Monte Carlo path-risk for one owned run.
export function computeMonteCarlo(body: MonteCarloRequest): Promise<MonteCarloResult> {
  return apiRequest<MonteCarloResult>('/api/validation/monte-carlo', { method: 'POST', body })
}

export function getLockboxStatus(): Promise<LockboxStatus> {
  return apiRequest<LockboxStatus>('/api/validation/lockbox')
}

export function runLockbox(body: LockboxRunRequest): Promise<LockboxRunResponse> {
  return apiRequest<LockboxRunResponse>('/api/validation/lockbox/run', { method: 'POST', body })
}
