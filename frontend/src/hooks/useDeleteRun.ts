import { useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import { deleteRun, deleteAllRuns, setRunFavorite } from '@/api/runs'
import { runsQueryKey } from './useRuns'
import type { Run, RunListResponse, UUID } from '@/api/types'

type RunsCache = InfiniteData<RunListResponse>

/** Snapshot the current cache, cancel any in-flight refetches, apply the
 *  optimistic edit, and return the snapshot so onError can roll back if
 *  the mutation fails. Canceling is critical — without it, the 5-second
 *  refetchInterval can land an in-flight response AFTER the optimistic
 *  edit and silently restore the deleted/un-favorited row. */
async function withOptimistic(
  client: ReturnType<typeof useQueryClient>,
  mutate: (cache: RunsCache) => RunsCache,
): Promise<RunsCache | undefined> {
  await client.cancelQueries({ queryKey: runsQueryKey() })
  const prev = client.getQueryData<RunsCache>(runsQueryKey())
  if (prev) client.setQueryData<RunsCache>(runsQueryKey(), mutate(prev))
  return prev
}

function withoutRun(cache: RunsCache, runId: UUID): RunsCache {
  return {
    ...cache,
    pages: cache.pages.map(page => ({
      ...page,
      runs: page.runs.filter(r => r.id !== runId),
    })),
  }
}

function withAllRunsCleared(cache: RunsCache): RunsCache {
  return {
    ...cache,
    pages: cache.pages.map(page => ({ ...page, runs: [], next_cursor: null })),
  }
}

function withRunPatch(cache: RunsCache, runId: UUID, patch: Partial<Run>): RunsCache {
  return {
    ...cache,
    pages: cache.pages.map(page => ({
      ...page,
      runs: page.runs.map(r => (r.id === runId ? { ...r, ...patch } : r)),
    })),
  }
}

export function useDeleteRun() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (runId: UUID) => deleteRun(runId),
    onMutate: (runId: UUID) =>
      withOptimistic(client, cache => withoutRun(cache, runId)),
    onError: (_err, _runId, ctx) => {
      if (ctx) client.setQueryData(runsQueryKey(), ctx)
    },
    onSuccess: (_data, runId) => {
      // Drop the deleted run's detail cache so it can never render stale data
      // (e.g. if the user navigates back to /runs/<deletedId>).
      client.removeQueries({ queryKey: ['runs', 'detail', runId] })
    },
    onSettled: () => client.invalidateQueries({ queryKey: runsQueryKey() }),
  })
}

export function useDeleteAllRuns() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => deleteAllRuns(),
    onMutate: () => withOptimistic(client, cache => withAllRunsCleared(cache)),
    onError: (_err, _vars, ctx) => {
      if (ctx) client.setQueryData(runsQueryKey(), ctx)
    },
    onSettled: () => client.invalidateQueries({ queryKey: runsQueryKey() }),
  })
}

export function useToggleFavorite() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (vars: { id: UUID; is_favorite: boolean }) =>
      setRunFavorite(vars.id, vars.is_favorite),
    onMutate: (vars) =>
      withOptimistic(client, cache =>
        withRunPatch(cache, vars.id, { is_favorite: vars.is_favorite }),
      ),
    onError: (_err, _vars, ctx) => {
      if (ctx) client.setQueryData(runsQueryKey(), ctx)
    },
    onSettled: () => client.invalidateQueries({ queryKey: runsQueryKey() }),
  })
}
