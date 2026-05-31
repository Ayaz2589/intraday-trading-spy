/**
 * Background "active runs" tracker (clarification Q2).
 *
 * Caps at 3 concurrent in-flight runs per user. When a 4th is added, the
 * oldest is evicted (the backend keeps running it; the UI just stops
 * background-polling it).
 */
import { useSyncExternalStore } from 'react'
import { ACTIVE_RUNS_TRACKER_CAP } from '@/config'
import type { UUID } from '@/api/types'

type Entry = { runId: UUID; startedAt: number }

class ActiveRunsTracker {
  private entries: Entry[] = []
  private listeners = new Set<() => void>()

  track(runId: UUID): void {
    if (this.entries.some(e => e.runId === runId)) return
    this.entries.push({ runId, startedAt: Date.now() })
    // Cap evict — drop oldest
    while (this.entries.length > ACTIVE_RUNS_TRACKER_CAP) {
      this.entries.shift()
    }
    this.notify()
  }

  untrack(runId: UUID): void {
    const before = this.entries.length
    this.entries = this.entries.filter(e => e.runId !== runId)
    if (this.entries.length !== before) this.notify()
  }

  list(): UUID[] {
    return this.entries.map(e => e.runId)
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private notify(): void {
    for (const l of this.listeners) l()
  }
}

export const activeRunsTracker = new ActiveRunsTracker()

export function useActiveRuns(): UUID[] {
  return useSyncExternalStore(
    cb => activeRunsTracker.subscribe(cb),
    () => activeRunsTracker.list(),
    () => []
  )
}

/** For tests. Don't use in production. */
export function _resetTrackerForTests(): void {
  // @ts-expect-error: private field
  activeRunsTracker.entries = []
}
