import { useState } from 'react'
import { useAuth } from '@/auth/AuthProvider'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

interface Props {
  onSignedOut?: () => void
}

export function SignOutMenu({ onSignedOut }: Props) {
  const { user, signOut } = useAuth()
  const [busy, setBusy] = useState(false)
  const email = user?.email ?? '—'

  const handleSignOut = async () => {
    setBusy(true)
    try {
      await signOut()
      onSignedOut?.()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="icon-btn"
          aria-label={`Account menu for ${email}`}
          data-testid="signout-menu-trigger"
          title={email}
          style={{ padding: 0, background: 'transparent', border: 'none', cursor: 'pointer' }}
        >
          <span
            aria-hidden
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: 'var(--surface-2)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--text)',
            }}
          >
            {email[0]?.toUpperCase() ?? '?'}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--r-lg)',
          padding: 'var(--sp-3) var(--sp-3)',
          minWidth: 200,
        }}
      >
        <div
          style={{
            fontSize: 'var(--fs-xs)',
            color: 'var(--text-muted)',
            padding: '4px 8px',
            marginBottom: 4,
            wordBreak: 'break-all',
          }}
        >
          {email}
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          disabled={busy}
          data-testid="signout-action"
          style={{
            display: 'block',
            width: '100%',
            textAlign: 'left',
            padding: '6px 8px',
            background: 'transparent',
            border: 'none',
            borderRadius: 'var(--r-sm)',
            cursor: busy ? 'wait' : 'pointer',
            color: 'var(--text)',
          }}
        >
          {busy ? 'Signing out…' : 'Sign out'}
        </button>
      </PopoverContent>
    </Popover>
  )
}
