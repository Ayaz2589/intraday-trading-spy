import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

describe('<MfaChallenge />', () => {
  it('submits the TOTP code with kind=totp', async () => {
    const onSubmit = vi.fn()
    const { MfaChallenge } = await import('./MfaChallenge')
    render(<MfaChallenge onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText('MFA code'), { target: { value: '123456' } })
    fireEvent.submit(screen.getByTestId('mfa-challenge'))
    expect(onSubmit).toHaveBeenCalledWith('123456', 'totp')
  })

  it('toggles to backup-code mode and submits with kind=backup', async () => {
    const onSubmit = vi.fn()
    const { MfaChallenge } = await import('./MfaChallenge')
    render(<MfaChallenge onSubmit={onSubmit} />)
    fireEvent.click(screen.getByText('Use a backup code'))
    fireEvent.change(screen.getByLabelText('MFA code'), { target: { value: 'abcdef1234' } })
    fireEvent.submit(screen.getByTestId('mfa-challenge'))
    expect(onSubmit).toHaveBeenCalledWith('abcdef1234', 'backup')
  })

  it('disables submit when code is too short', async () => {
    const { MfaChallenge } = await import('./MfaChallenge')
    render(<MfaChallenge onSubmit={() => {}} />)
    fireEvent.change(screen.getByLabelText('MFA code'), { target: { value: '12345' } })
    expect(screen.getByRole('button', { name: /Verify$/ })).toBeDisabled()
  })

  it('renders an error message', async () => {
    const { MfaChallenge } = await import('./MfaChallenge')
    render(<MfaChallenge onSubmit={() => {}} error="Bad code" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Bad code')
  })
})
