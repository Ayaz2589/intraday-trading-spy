import { apiRequest } from './client'
import type {
  DataDownloadJob,
  StartDataDownloadRequest,
  StartDataDownloadResponse,
  UUID,
} from './types'

export function startDataDownload(
  body: StartDataDownloadRequest
): Promise<StartDataDownloadResponse> {
  return apiRequest<StartDataDownloadResponse>('/api/data/download', { method: 'POST', body })
}

export function getDataDownloadJob(jobId: UUID): Promise<DataDownloadJob> {
  return apiRequest<DataDownloadJob>(`/api/data/downloads/${jobId}`)
}
