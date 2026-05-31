import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

describe('<SignInForm />', () => {
  it('disables submit until an email is entered', async () => {
    const onSubmit = vi.fn()
    const { SignInForm } = await import('./SignInForm')
    render(<SignInForm onSubmit={onSubmit} />)
    const button = screen.getByRole('button', { name: /Send sign-in code/i })
    expect(button).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'jane@example.com' } })
    expect(button).not.toBeDisabled()
  })

  it('calls onSubmit with the entered email', async () => {
    const onSubmit = vi.fn()
    const { SignInForm } = await import('./SignInForm')
    render(<SignInForm onSubmit={onSubmit} />)
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'jane@example.com' } })
    fireEvent.submit(screen.getByTestId('signin-form'))
    expect(onSubmit).toHaveBeenCalledWith('jane@example.com')
  })

  it('renders an error when provided', async () => {
    const { SignInForm } = await import('./SignInForm')
    render(<SignInForm onSubmit={() => {}} error="Bad email" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Bad email')
  })

  it('shows pending label while busy', async () => {
    const { SignInForm } = await import('./SignInForm')
    render(<SignInForm onSubmit={() => {}} pending initialEmail="jane@example.com" />)
    const submit = screen.getByRole('button', { name: /Sending…/ })
    expect(submit).toBeDisabled()
  })
})
