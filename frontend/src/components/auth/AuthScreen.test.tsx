import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

describe('<AuthScreen />', () => {
  it('renders the IntradayBuilder brand lockup', async () => {
    const { AuthScreen } = await import('./AuthScreen')
    render(
      <AuthScreen title="Sign in">
        <p>child</p>
      </AuthScreen>,
    )
    // Brand mark + wordmark, matching the topbar lockup.
    expect(screen.getByText('◑')).toBeInTheDocument()
    expect(screen.getByText('Intraday')).toBeInTheDocument()
    expect(screen.getByText('Builder')).toBeInTheDocument()
  })

  it('renders the title and children inside the card', async () => {
    const { AuthScreen } = await import('./AuthScreen')
    render(
      <AuthScreen title="Sign in">
        <p>form goes here</p>
      </AuthScreen>,
    )
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.getByText('form goes here')).toBeInTheDocument()
  })

  it('exposes the testid passed through for the page container', async () => {
    const { AuthScreen } = await import('./AuthScreen')
    render(
      <AuthScreen title="Sign in" testId="signin-page">
        <p>child</p>
      </AuthScreen>,
    )
    expect(screen.getByTestId('signin-page')).toBeInTheDocument()
  })
})
