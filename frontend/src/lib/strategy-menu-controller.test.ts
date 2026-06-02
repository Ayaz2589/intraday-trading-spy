import { describe, expect, it, vi } from 'vitest'

describe('strategy-menu-controller', () => {
  it('increments the snapshot and notifies subscribers when opened', async () => {
    const { openStrategyMenu, subscribe, getSnapshot } = await import(
      './strategy-menu-controller'
    )
    const before = getSnapshot()
    const listener = vi.fn()
    const unsub = subscribe(listener)

    openStrategyMenu()

    expect(listener).toHaveBeenCalledTimes(1)
    expect(getSnapshot()).toBe(before + 1)
    unsub()
  })

  it('stops notifying after unsubscribe', async () => {
    const { openStrategyMenu, subscribe } = await import(
      './strategy-menu-controller'
    )
    const listener = vi.fn()
    const unsub = subscribe(listener)
    unsub()

    openStrategyMenu()

    expect(listener).not.toHaveBeenCalled()
  })
})
