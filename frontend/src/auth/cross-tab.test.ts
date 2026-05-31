import { describe, expect, it, vi } from 'vitest'

describe('subscribeToCrossTabSignOut', () => {
  it('fires the handler on SIGNED_OUT event', async () => {
    const unsubscribe = vi.fn()
    let capturedHandler: ((event: string) => void) | null = null
    const mockSupabase = {
      auth: {
        onAuthStateChange: vi.fn((cb: (event: string) => void) => {
          capturedHandler = cb
          return { data: { subscription: { unsubscribe } } }
        }),
      },
    }
    const callCaptured = (event: string) => {
      if (capturedHandler) (capturedHandler as (e: string) => void)(event)
    }

    vi.doMock('./supabase-client', () => ({
      getSupabase: () => mockSupabase,
    }))

    const { subscribeToCrossTabSignOut } = await import('./cross-tab')
    const handler = vi.fn()
    const cleanup = subscribeToCrossTabSignOut(handler)

    callCaptured('SIGNED_OUT')
    expect(handler).toHaveBeenCalledTimes(1)

    callCaptured('SIGNED_IN')
    expect(handler).toHaveBeenCalledTimes(1) // not fired for sign-in

    cleanup()
    expect(unsubscribe).toHaveBeenCalledTimes(1)

    vi.doUnmock('./supabase-client')
  })
})
