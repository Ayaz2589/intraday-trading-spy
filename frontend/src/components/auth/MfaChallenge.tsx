import { useState } from 'react'
import { HelpTooltip } from '@/components/help-tooltip'

interface Props {
  onSubmit(code: string, kind: 'totp' | 'backup'): Promise<void> | void
  pending?: boolean
  error?: string | null
}

export function MfaChallenge({ onSubmit, pending, error }: Props) {
  const [code, setCode] = useState('')
  const [kind, setKind] = useState<'totp' | 'backup'>('totp')

  const minLen = kind === 'totp' ? 6 : 8

  const handle = async (e: React.FormEvent) => {
    e.preventDefault()
    if (code.length < minLen) return
    await onSubmit(code, kind)
  }

  return (
    <form onSubmit={handle} data-testid="mfa-challenge">
      <p className="text-sm text-muted-foreground mb-4 flex items-center gap-1">
        Enter the {kind === 'totp' ? '6-digit code' : 'backup code'} from your authenticator
        {kind === 'totp' ? (
          <HelpTooltip helpKey="totp" />
        ) : (
          <HelpTooltip helpKey="backup_codes" />
        )}
      </p>
      <input
        type="text"
        inputMode={kind === 'totp' ? 'numeric' : 'text'}
        autoComplete="one-time-code"
        placeholder={kind === 'totp' ? '6-digit code' : 'Backup code'}
        value={code}
        onChange={e => setCode(e.target.value.replace(/\s+/g, ''))}
        className="w-full p-2 border rounded mb-2"
        aria-label="MFA code"
      />
      {error && (
        <p role="alert" className="text-sm text-destructive mb-2">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={code.length < minLen || pending}
        className="w-full p-2 bg-primary text-primary-foreground rounded disabled:opacity-50"
      >
        {pending ? 'Verifying…' : 'Verify'}
      </button>
      <button
        type="button"
        onClick={() => {
          setKind(k => (k === 'totp' ? 'backup' : 'totp'))
          setCode('')
        }}
        className="w-full p-2 mt-2 text-sm text-muted-foreground"
      >
        {kind === 'totp' ? 'Use a backup code' : 'Use authenticator app'}
      </button>
    </form>
  )
}
