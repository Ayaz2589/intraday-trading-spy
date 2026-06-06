import { useState } from 'react'
import { LockboxGate } from './lockbox-gate'
import type { Config, LockboxStatus } from '@/api/types'

// Validation-page redesign: the lockbox section — candidate-config picker
// (pre-selects the ACTIVE config) + the existing one-shot state machine,
// composed into ONE header row via the gate's leading-cell slot.

export function LockboxCard({
  status,
  configs,
  running,
  onRun,
}: {
  status: LockboxStatus
  configs: Config[]
  running: boolean
  onRun: (configName: string, override: boolean) => void
}) {
  const activeName = configs.find((c) => c.is_active)?.name
  const [picked, setPicked] = useState<string | null>(null)
  const configName = picked ?? activeName ?? 'default'
  const options = configs.length > 0 ? configs.map((c) => c.name) : ['default']

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <LockboxGate status={status} running={running} onRun={(override) => onRun(configName, override)}>
        {status.state === 'unspent' && (
          <div style={{ flex: 1, maxWidth: 420 }}>
            <span style={{ display: 'block', marginBottom: 3, fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Candidate config to freeze
            </span>
            <select
              aria-label="lockbox config"
              value={configName}
              onChange={(e) => setPicked(e.target.value)}
              style={{
                minWidth: 260,
                width: '100%',
                padding: '6px 8px',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-sm, 6px)',
                background: 'var(--surface-2, #f6f7f9)',
                color: 'var(--text)',
                fontSize: 'var(--fs-sm, 13px)',
                fontFamily: 'var(--mono)',
              }}
            >
              {options.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </div>
        )}
      </LockboxGate>
      {status.run_id && (
        // Feature 014 (FR-003): the one-shot evaluation is a real run — link it.
        // Pre-014 ledger entries have no run_id and show nothing.
        <div>
          <a href={`/runs/${status.run_id}`} className="btn btn-sm">
            View lockbox run →
          </a>
        </div>
      )}
    </div>
  )
}
