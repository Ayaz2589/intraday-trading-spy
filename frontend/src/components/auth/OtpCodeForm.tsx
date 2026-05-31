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
    if (code.length < 6) return
    await onSubmit(code)
  }

  // Strip whitespace from pasted values so common paste formats work.
  const normalize = (value: string) => value.replace(/\s+/g, '').slice(0, 6)

  return (
    <form onSubmit={handle} data-testid="otp-code-form">
      <p className="text-sm text-muted-foreground mb-4">
        Check your inbox at <strong>{email}</strong> for a 6-digit code.
      </p>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="6-digit code"
        value={code}
        required
        onChange={e => setCode(normalize(e.target.value))}
        className="w-full p-2 border rounded mb-2"
        aria-label="Sign-in code"
      />
      {error && (
        <p role="alert" className="text-sm text-destructive mb-2">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={code.length < 6 || pending}
        className="w-full p-2 bg-primary text-primary-foreground rounded disabled:opacity-50"
      >
        {pending ? 'Verifying…' : 'Verify code'}
      </button>
      {onUseDifferentEmail && (
        <button
          type="button"
          onClick={onUseDifferentEmail}
          className="w-full p-2 mt-2 text-sm text-muted-foreground"
        >
          Use a different email
        </button>
      )}
    </form>
  )
}
