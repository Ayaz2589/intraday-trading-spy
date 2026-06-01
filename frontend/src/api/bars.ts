import { apiRequest } from './client'

export type BarsFetchRequest = {
  start: string // YYYY-MM-DD
  end: string // YYYY-MM-DD
  timeframe?: '5m' | '1m'
}

export type BarsFetchResponse = {
  inserted: number
  start: string
  end: string
}

export type BarsCoverageResponse = {
  earliest: string | null // YYYY-MM-DD
  latest: string | null
}

export function fetchBarsRange(body: BarsFetchRequest): Promise<BarsFetchResponse> {
  return apiRequest<BarsFetchResponse>('/api/bars/fetch', { method: 'POST', body })
}

export function getBarsCoverage(): Promise<BarsCoverageResponse> {
  return apiRequest<BarsCoverageResponse>('/api/bars/coverage')
}
