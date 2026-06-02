import { useState } from 'react'
import { HelpTooltip } from '@/components/help-tooltip'

interface Props {
  onSubmit(email: string): Promise<void> | void
  pending?: boolean
  error?: string | null
  initialEmail?: string
}

export function SignInForm({ onSubmit, pending, error, initialEmail = '' }: Props) {
  const [email, setEmail] = useState(initialEmail)

  const handle = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return
    await onSubmit(email)
  }

  return (
    <form onSubmit={handle} data-testid="signin-form" className="auth-form">
      <p className="auth-intro">
        Enter your email — we'll send an 8-digit sign-in code.
        <HelpTooltip helpKey="otp" />
      </p>
      <input
        type="email"
        placeholder="you@example.com"
        value={email}
        required
        onChange={e => setEmail(e.target.value)}
        className="field"
        aria-label="Email"
      />
      {error && (
        <p role="alert" className="auth-error">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={!email || pending}
        className="btn btn-primary btn-block"
      >
        {pending ? 'Sending…' : 'Send sign-in code'}
      </button>
    </form>
  )
}
