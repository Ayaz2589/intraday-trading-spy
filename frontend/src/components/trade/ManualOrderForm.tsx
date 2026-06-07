import { useState } from 'react'
import { HelpTooltip } from '../help-tooltip'

// Feature 021 (US4): manual paper orders — never exempt from the rules.
// Stop + target required client-side too; the backend risk manager still
// has the absolute veto.

export function ManualOrderForm({
  onSubmit,
  onClose,
  hasPosition,
  error,
  busy = false,
}: {
  onSubmit(body: { stop_loss: number; take_profit: number }): void
  onClose(): void
  hasPosition: boolean
  error: string | null
  busy?: boolean
}) {
  const [stop, setStop] = useState('')
  const [target, setTarget] = useState('')
  const stopN = parseFloat(stop)
  const targetN = parseFloat(target)
  const valid = Number.isFinite(stopN) && Number.isFinite(targetN)

  return (
    <div data-testid="manual-order-form"
         style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
      <span className="stat-label">
        manual order — same risk manager, no exceptions{' '}
        <HelpTooltip helpKey="manual_order" />
      </span>
      <label className="stat-label" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        stop
        <input value={stop} onChange={e => setStop(e.target.value)}
               inputMode="decimal" style={{ width: 90 }} />
      </label>
      <label className="stat-label" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        target
        <input value={target} onChange={e => setTarget(e.target.value)}
               inputMode="decimal" style={{ width: 90 }} />
      </label>
      <button
        type="button"
        className="btn btn-primary"
        disabled={busy || !valid}
        onClick={() => valid && onSubmit({ stop_loss: stopN, take_profit: targetN })}
      >
        Buy SPY
      </button>
      {hasPosition && (
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={onClose}>
          Close position
        </button>
      )}
      {error && (
        <span className="stat-label mono" style={{ color: 'var(--loss)' }}>
          rejected: {error}
        </span>
      )}
    </div>
  )
}
