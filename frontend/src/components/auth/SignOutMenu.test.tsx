import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const signOutMock = vi.fn()
const useAuthMock = vi.fn()
vi.mock('@/auth/AuthProvider', () => ({
  useAuth: () => useAuthMock(),
}))

describe('<SignOutMenu />', () => {
  beforeEach(() => {
    signOutMock.mockReset().mockResolvedValue(undefined)
    useAuthMock.mockReset().mockReturnValue({
      user: { email: 'jane@example.com' },
      signOut: signOutMock,
    })
  })

  it('renders the user email in the trigger', async () => {
    const { SignOutMenu } = await import('./SignOutMenu')
    render(<SignOutMenu />)
    expect(screen.getByLabelText(/Account menu for jane@example.com/i)).toBeInTheDocument()
  })

  it('signs out and calls onSignedOut callback', async () => {
    const onSignedOut = vi.fn()
    const { SignOutMenu } = await import('./SignOutMenu')
    render(<SignOutMenu onSignedOut={onSignedOut} />)
    fireEvent.click(screen.getByTestId('signout-menu-trigger'))
    const action = await screen.findByTestId('signout-action')
    fireEvent.click(action)
    await waitFor(() => expect(signOutMock).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(onSignedOut).toHaveBeenCalledTimes(1))
  })

  it('falls back to dash when user has no email', async () => {
    useAuthMock.mockReturnValueOnce({ user: null, signOut: signOutMock })
    const { SignOutMenu } = await import('./SignOutMenu')
    render(<SignOutMenu />)
    expect(screen.getByLabelText(/Account menu for —/)).toBeInTheDocument()
  })
})
