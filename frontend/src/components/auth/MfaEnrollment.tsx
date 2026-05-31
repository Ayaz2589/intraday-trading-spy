import { useState } from 'react'
import { HelpTooltip } from '@/components/help-tooltip'

export interface MfaEnrollmentData {
  factorId: string
  qrCodeUrl: string
  secret: string
}

interface Props {
  enrollment: MfaEnrollmentData
  onConfirm(code: string): Promise<void> | void
  pending?: boolean
  error?: string | null
}

export function MfaEnrollment({ enrollment, onConfirm, pending, error }: Props) {
  const [code, setCode] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)

  const handle = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!acknowledged || code.length < 6) return
    await onConfirm(code)
  }

  return (
    <form onSubmit={handle} data-testid="mfa-enrollment">
      <p className="text-sm text-muted-foreground mb-2">
        Scan this QR with an authenticator app (Google Authenticator, 1Password, etc.).
        <HelpTooltip helpKey="mfa" />
      </p>
      <img src={enrollment.qrCodeUrl} alt="MFA QR code" className="border rounded mb-4" />
      <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
        Or type this secret manually:
        <HelpTooltip helpKey="totp" />
      </p>
      <code className="block p-2 bg-muted rounded text-xs break-all mb-4">{enrollment.secret}</code>
      <label className="flex items-start gap-2 mb-4 cursor-pointer">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={e => setAcknowledged(e.target.checked)}
          className="mt-1"
          data-testid="mfa-acknowledge"
        />
        <span className="text-sm flex items-center gap-1">
          I've saved my backup codes
          <HelpTooltip helpKey="backup_codes" />
        </span>
      </label>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="6-digit code from app"
        value={code}
        onChange={e => setCode(e.target.value.replace(/\s+/g, '').slice(0, 6))}
        className="w-full p-2 border rounded mb-2"
        aria-label="Confirmation code"
      />
      {error && (
        <p role="alert" className="text-sm text-destructive mb-2">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={!acknowledged || code.length < 6 || pending}
        className="w-full p-2 bg-primary text-primary-foreground rounded disabled:opacity-50"
      >
        {pending ? 'Confirming…' : 'Confirm enrollment'}
      </button>
    </form>
  )
}
