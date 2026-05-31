import { useMutation } from '@tanstack/react-query'
import { startDataDownload } from '@/api/data-downloads'
import type { StartDataDownloadRequest, StartDataDownloadResponse } from '@/api/types'

export function useStartDataDownload() {
  return useMutation<StartDataDownloadResponse, Error, StartDataDownloadRequest>({
    mutationFn: startDataDownload,
  })
}
