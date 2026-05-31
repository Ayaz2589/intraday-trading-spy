import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const mockSupabase = {
  auth: {
    getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    onAuthStateChange: vi.fn(() => ({
      data: { subscription: { unsubscribe: vi.fn() } },
    })),
    signInWithOtp: vi.fn().mockResolvedValue({ error: null }),
    verifyOtp: vi.fn().mockResolvedValue({ error: null }),
    mfa: {
      enroll: vi.fn(),
      challenge: vi.fn(),
      verify: vi.fn(),
      getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue({
        data: { currentLevel: 'aal1', nextLevel: 'aal1' },
      }),
      listFactors: vi.fn().mockResolvedValue({ data: { all: [] } }),
    },
    signOut: vi.fn().mockResolvedValue({}),
  },
}

vi.mock('./supabase-client', () => ({
  getSupabase: () => mockSupabase,
}))

import { AuthProvider, useAuth } from './AuthProvider'

function Consumer() {
  const auth = useAuth()
  if (auth.isLoading) return <div>loading</div>
  return <div data-testid="email">{auth.user?.email ?? 'no-user'}</div>
}

describe('AuthProvider', () => {
  it('initially loads then settles to no session', async () => {
    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    )
    await waitFor(() => {
      expect(screen.getByTestId('email')).toHaveTextContent('no-user')
    })
  })

  it('throws when useAuth is called outside a provider', () => {
    function Bad() {
      useAuth()
      return null
    }
    expect(() => render(<Bad />)).toThrow(/useAuth must be used inside/)
  })
})
