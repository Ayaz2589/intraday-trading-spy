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
    <form onSubmit={handle} data-testid="signin-form">
      <p className="text-sm text-muted-foreground mb-4">
        Enter your email — we'll send a 6-digit sign-in code.
        <HelpTooltip helpKey="otp" />
      </p>
      <input
        type="email"
        placeholder="you@example.com"
        value={email}
        required
        onChange={e => setEmail(e.target.value)}
        className="w-full p-2 border rounded mb-2"
        aria-label="Email"
      />
      {error && (
        <p role="alert" className="text-sm text-destructive mb-2">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={!email || pending}
        className="w-full p-2 bg-primary text-primary-foreground rounded disabled:opacity-50"
      >
        {pending ? 'Sending…' : 'Send sign-in code'}
      </button>
    </form>
  )
}
