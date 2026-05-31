import { useQuery } from '@tanstack/react-query'
import { getDataDownloadJob } from '@/api/data-downloads'
import { adaptivePollingInterval } from '@/lib/polling'
import type { DataDownloadJob, UUID } from '@/api/types'

export function useDataDownloadJob(jobId: UUID | undefined) {
  return useQuery<DataDownloadJob>({
    queryKey: ['data-downloads', 'detail', jobId ?? ''],
    queryFn: () => getDataDownloadJob(jobId as UUID),
    enabled: !!jobId,
    refetchInterval: query => adaptivePollingInterval(query),
    refetchOnWindowFocus: false,
  })
}
