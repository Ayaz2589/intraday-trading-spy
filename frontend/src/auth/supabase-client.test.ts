import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('getSupabase', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.doUnmock('@/env')
    vi.doUnmock('@supabase/supabase-js')
  })

  it('throws when VITE_SUPABASE_URL is missing', async () => {
    vi.doMock('@/env', () => ({
      ENV: { SUPABASE_URL: '', SUPABASE_ANON_KEY: '', API_BASE_URL: '', IS_PROD: true },
    }))
    const { getSupabase, _resetSupabaseClientForTests } = await import('./supabase-client')
    _resetSupabaseClientForTests()
    expect(() => getSupabase()).toThrow(/VITE_SUPABASE_URL/)
  })

  it('returns the same instance on repeated calls (singleton)', async () => {
    vi.doMock('@/env', () => ({
      ENV: {
        SUPABASE_URL: 'https://test.supabase.co',
        SUPABASE_ANON_KEY: 'fake-anon-key',
        API_BASE_URL: '',
        IS_PROD: false,
      },
    }))
    const fakeClient = { auth: {} }
    vi.doMock('@supabase/supabase-js', () => ({
      createClient: vi.fn(() => fakeClient),
    }))
    const { getSupabase, _resetSupabaseClientForTests } = await import('./supabase-client')
    _resetSupabaseClientForTests()
    const a = getSupabase()
    const b = getSupabase()
    expect(a).toBe(b)
    expect(a).toBe(fakeClient)
  })
})
