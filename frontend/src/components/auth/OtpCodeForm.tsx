import { useState } from 'react'

interface Props {
  email: string
  onSubmit(code: string): Promise<void> | void
  onUseDifferentEmail?: () => void
  pending?: boolean
  error?: string | null
}

export function OtpCodeForm({ email, onSubmit, onUseDifferentEmail, pending, error }: Props) {
  const [code, setCode] = useState('')

  const handle = async (e: React.FormEvent) => {
    e.preventDefault()
    if (code.length < 8) return
    await onSubmit(code)
  }

  // Supabase Email OTP length is configurable (6–8 digits). Strip
  // whitespace from pasted values and cap at 8 — the project's
  // configured length validates server-side.
  const normalize = (value: string) => value.replace(/\s+/g, '').slice(0, 8)

  return (
    <form onSubmit={handle} data-testid="otp-code-form" className="auth-form">
      <p className="auth-intro">
        Check your inbox at <strong>{email}</strong> for an 8-digit code.
      </p>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="8-digit code"
        value={code}
        required
        onChange={e => setCode(normalize(e.target.value))}
        className="field mono"
        aria-label="Sign-in code"
      />
      {error && (
        <p role="alert" className="auth-error">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={code.length < 8 || pending}
        className="btn btn-primary btn-block"
      >
        {pending ? 'Verifying…' : 'Verify code'}
      </button>
      {onUseDifferentEmail && (
        <button
          type="button"
          onClick={onUseDifferentEmail}
          className="btn btn-ghost btn-block"
        >
          Use a different email
        </button>
      )}
    </form>
  )
}
