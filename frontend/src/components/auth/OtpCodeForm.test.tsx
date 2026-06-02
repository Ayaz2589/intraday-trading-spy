import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

describe('<OtpCodeForm />', () => {
  it('disables submit until 8 digits are entered', async () => {
    const onSubmit = vi.fn()
    const { OtpCodeForm } = await import('./OtpCodeForm')
    render(<OtpCodeForm email="jane@example.com" onSubmit={onSubmit} />)
    const button = screen.getByRole('button', { name: /Verify code/i })
    expect(button).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Sign-in code'), { target: { value: '1234567' } })
    expect(button).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Sign-in code'), { target: { value: '12345678' } })
    expect(button).not.toBeDisabled()
  })

  it('strips whitespace on paste', async () => {
    const { OtpCodeForm } = await import('./OtpCodeForm')
    render(<OtpCodeForm email="jane@example.com" onSubmit={() => {}} />)
    const input = screen.getByLabelText('Sign-in code') as HTMLInputElement
    fireEvent.change(input, { target: { value: '12 34 56 78' } })
    expect(input.value).toBe('12345678')
  })

  it('caps input at 8 characters even if longer is pasted', async () => {
    const { OtpCodeForm } = await import('./OtpCodeForm')
    render(<OtpCodeForm email="jane@example.com" onSubmit={() => {}} />)
    const input = screen.getByLabelText('Sign-in code') as HTMLInputElement
    fireEvent.change(input, { target: { value: '1234567890' } })
    expect(input.value).toBe('12345678')
  })

  it('calls onSubmit with code', async () => {
    const onSubmit = vi.fn()
    const { OtpCodeForm } = await import('./OtpCodeForm')
    render(<OtpCodeForm email="jane@example.com" onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText('Sign-in code'), { target: { value: '65432187' } })
    fireEvent.submit(screen.getByTestId('otp-code-form'))
    expect(onSubmit).toHaveBeenCalledWith('65432187')
  })

  it('renders the "Use a different email" button when callback provided', async () => {
    const onUseDifferentEmail = vi.fn()
    const { OtpCodeForm } = await import('./OtpCodeForm')
    render(<OtpCodeForm email="jane@example.com" onSubmit={() => {}} onUseDifferentEmail={onUseDifferentEmail} />)
    fireEvent.click(screen.getByText('Use a different email'))
    expect(onUseDifferentEmail).toHaveBeenCalled()
  })
})
