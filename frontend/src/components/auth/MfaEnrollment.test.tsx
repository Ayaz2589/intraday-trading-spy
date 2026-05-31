import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const enrollment = {
  factorId: 'factor-1',
  qrCodeUrl: 'data:image/png;base64,abc',
  secret: 'JBSWY3DPEHPK3PXP',
}

describe('<MfaEnrollment />', () => {
  it('renders the QR image, secret, and backup acknowledgement', async () => {
    const { MfaEnrollment } = await import('./MfaEnrollment')
    render(<MfaEnrollment enrollment={enrollment} onConfirm={() => {}} />)
    expect(screen.getByAltText('MFA QR code')).toHaveAttribute('src', enrollment.qrCodeUrl)
    expect(screen.getByText(enrollment.secret)).toBeInTheDocument()
    expect(screen.getByTestId('mfa-acknowledge')).toBeInTheDocument()
    expect(screen.getByText("I've saved my backup codes")).toBeInTheDocument()
  })

  it('disables submit until acknowledgement is checked AND 6-digit code is entered', async () => {
    const { MfaEnrollment } = await import('./MfaEnrollment')
    render(<MfaEnrollment enrollment={enrollment} onConfirm={() => {}} />)
    const submit = screen.getByRole('button', { name: /Confirm enrollment/i })
    expect(submit).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Confirmation code'), { target: { value: '123456' } })
    expect(submit).toBeDisabled() // ack not yet checked
    fireEvent.click(screen.getByTestId('mfa-acknowledge'))
    expect(submit).not.toBeDisabled()
  })

  it('calls onConfirm with code on submit', async () => {
    const onConfirm = vi.fn()
    const { MfaEnrollment } = await import('./MfaEnrollment')
    render(<MfaEnrollment enrollment={enrollment} onConfirm={onConfirm} />)
    fireEvent.click(screen.getByTestId('mfa-acknowledge'))
    fireEvent.change(screen.getByLabelText('Confirmation code'), { target: { value: '654321' } })
    fireEvent.submit(screen.getByTestId('mfa-enrollment'))
    expect(onConfirm).toHaveBeenCalledWith('654321')
  })
})
