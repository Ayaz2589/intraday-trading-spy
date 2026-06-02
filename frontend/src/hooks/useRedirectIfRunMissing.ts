import { useEffect, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useRuns, flattenRuns } from './useRuns'
import type { UUID } from '@/api/types'

/**
 * When the run currently being viewed disappears from the runs list — because
 * it (or all runs) was deleted — leave the now-dead detail route. `/runs` opens
 * the newest remaining run, or the empty state if none are left.
 *
 * This lives on the route (which stays mounted) rather than on the delete
 * button: deleting a run optimistically removes its sidebar card, unmounting
 * that component before its mutation settles, so a navigate() fired from there
 * is dropped by react-query.
 *
 * We only redirect once a run we *saw present* goes missing — a run that was
 * never in the loaded list (just-created, or deep-linked on an unfetched page)
 * must not be bounced away before the list catches up.
 */
export function useRedirectIfRunMissing(runId: UUID, enabled = true) {
  const navigate = useNavigate()
  const runsQuery = useRuns()
  const present = flattenRuns(runsQuery.data).some(r => r.id === runId)
  const seenPresentFor = useRef<UUID | null>(null)

  useEffect(() => {
    if (!enabled) return
    if (present) {
      seenPresentFor.current = runId
    } else if (seenPresentFor.current === runId) {
      navigate({ to: '/runs', replace: true })
    }
  }, [present, runId, enabled, navigate])
}
