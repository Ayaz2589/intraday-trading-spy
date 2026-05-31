import { useMutation } from '@tanstack/react-query'
import { deleteRun, deleteAllRuns } from '@/api/runs'
import { useInvalidateRuns } from './useRuns'
import type { UUID } from '@/api/types'

export function useDeleteRun() {
  const invalidate = useInvalidateRuns()
  return useMutation({
    mutationFn: (runId: UUID) => deleteRun(runId),
    onSuccess: () => invalidate(),
  })
}

export function useDeleteAllRuns() {
  const invalidate = useInvalidateRuns()
  return useMutation({
    mutationFn: () => deleteAllRuns(),
    onSuccess: () => invalidate(),
  })
}
