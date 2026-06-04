import { useState } from 'react'
import { useConfigs } from '@/hooks/useConfigs'
import { useStartStudy, useStudyStatus } from '@/hooks/useStudies'
import { HelpTooltip } from '@/components/help-tooltip'
import type { StartStudyRequest, StudyKind } from '@/api/types'

// Validation-page redesign: the study launcher — kind chips, config picker
// (pre-selects the ACTIVE config, SC-007), and a prominent animated status
// panel that follows the launched study to completion.

const KINDS: Array<{ key: StudyKind; label: string; helpKey: 'walk_forward' | 'parameter_sensitivity' }> = [
  { key: 'walk_forward', label: 'Walk-forward', helpKey: 'walk_forward' },
  { key: 'sensitivity', label: 'Sensitivity', helpKey: 'parameter_sensitivity' },
]

const inputStyle: React.CSSProperties = {
  padding: '6px 8px',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r-sm, 6px)',
  background: 'var(--surface-2, #f6f7f9)',
  color: 'var(--text)',
  fontSize: 'var(--fs-sm, 13px)',
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ display: 'block', marginBottom: 3, fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
      {children}
    </span>
  )
}

// Live status of the launched study: spinner + progress while it runs; a
// persistent verdict with a results link when it ends (× to dismiss).
function StudyStatusPanel({
  studyId,
  kind,
  configName,
  onDismiss,
}: {
  studyId: string
  kind: StudyKind
  configName: string
  onDismiss: () => void
}) {
  const status = useStudyStatus(studyId)
  const s = status.data
  if (!s) return null
  const running = s.status === 'queued' || s.status === 'running'
  const failed = s.status === 'failed'
  const pct = s.progress_total > 0 ? Math.round((s.progress_completed / s.progress_total) * 100) : 0
  const accent = failed ? 'var(--neg, #b42318)' : running ? 'var(--accent, #2563eb)' : 'var(--pos, #1a7f37)'
  const tint = failed ? 'var(--neg-bg, #fdecea)' : running ? 'var(--accent-bg, #eef4fe)' : 'var(--pos-bg, #e6f4ea)'

  return (
    <div
      data-testid="study-status-panel"
      style={{ marginTop: 12, padding: '12px 14px', borderRadius: 'var(--r-md, 10px)', border: `1px solid ${accent}`, background: tint, display: 'flex', flexDirection: 'column', gap: 8 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {running ? (
          <span className="spinner" data-testid="study-spinner" aria-hidden />
        ) : (
          <span aria-hidden style={{ color: accent, fontWeight: 700 }}>{failed ? '✕' : '✓'}</span>
        )}
        <span style={{ fontWeight: 700, fontSize: 'var(--fs-sm, 13px)' }}>
          {running
            ? `Running ${kind === 'walk_forward' ? 'walk-forward' : 'sensitivity'} on ${configName}…`
            : failed
              ? 'Study failed'
              : 'Study complete'}
        </span>
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', color: accent, fontWeight: 700, fontSize: 'var(--fs-sm, 13px)' }}>
          {running ? `${pct}%` : `${s.progress_completed}/${s.progress_total} evaluations`}
        </span>
        {!running && (
          <button type="button" aria-label="dismiss" onClick={onDismiss} style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 'var(--fs-base, 15px)', lineHeight: 1 }}>
            ×
          </button>
        )}
      </div>
      <div style={{ height: 8, borderRadius: 999, background: 'rgba(0,0,0,0.08)', overflow: 'hidden' }}>
        <div style={{ width: `${failed ? 100 : pct}%`, height: '100%', borderRadius: 999, background: accent, transition: 'width 0.5s ease' }} />
      </div>
      <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)', display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <span className="mono">evaluations {s.progress_completed}/{s.progress_total}</span>
        {failed && s.failure_reason && <span className="mono" style={{ color: accent }}>{s.failure_reason}</span>}
        {!running && !failed && (
          <a href={`/validation/${studyId}`} style={{ color: 'var(--accent, #2563eb)', fontWeight: 600 }}>
            View results →
          </a>
        )}
      </div>
    </div>
  )
}

export function StartStudyCard({ defaultConfig = 'default' }: { defaultConfig?: string }) {
  const configsQuery = useConfigs()
  const configs = configsQuery.data?.configs ?? []
  // Pre-select the active config (Feature 012 SC-007); the user can override.
  const activeName = configs.find((c) => c.is_active)?.name
  const [picked, setPicked] = useState<string | null>(null)
  const configName = picked ?? activeName ?? defaultConfig

  const [kind, setKind] = useState<StudyKind>('walk_forward')
  const [knob, setKnob] = useState('strategy.vwap_pullback.target.risk_reward')
  const [values, setValues] = useState('1.5, 2.0, 2.5, 3.0')
  const start = useStartStudy()
  const [launched, setLaunched] = useState<{ id: string; kind: StudyKind; config: string } | null>(null)

  function launch() {
    const body: StartStudyRequest = { kind, config_name: configName }
    if (kind === 'sensitivity') {
      const parsed = values.split(',').map((v) => Number(v.trim())).filter((v) => !Number.isNaN(v))
      body.grid = [{ knob, values: parsed }]
      body.segment = 'train'
    }
    start.mutate(body, {
      onSuccess: (r) => setLaunched({ id: r.study_id, kind, config: configName }),
    })
  }

  const options = configs.length > 0 ? configs.map((c) => c.name) : [defaultConfig]

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
        {KINDS.map((k) => {
          const active = kind === k.key
          return (
            <button
              key={k.key}
              type="button"
              data-testid={`kind-${k.key}`}
              onClick={() => setKind(k.key)}
              style={{
                padding: '3px 12px',
                borderRadius: 999,
                fontSize: 'var(--fs-xs, 11px)',
                fontWeight: 600,
                cursor: 'pointer',
                border: `1px solid ${active ? 'var(--accent, #2563eb)' : 'var(--border)'}`,
                background: active ? 'var(--accent-bg, #e8effd)' : 'var(--surface, #fff)',
                color: active ? 'var(--accent, #2563eb)' : 'var(--text-muted)',
              }}
            >
              {k.label}
            </button>
          )
        })}
        <HelpTooltip helpKey={kind === 'walk_forward' ? 'walk_forward' : 'parameter_sensitivity'} />
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, marginTop: 10, flexWrap: 'wrap' }}>
        <div>
          <FieldLabel>Config</FieldLabel>
          <select aria-label="config" value={configName} onChange={(e) => setPicked(e.target.value)} style={inputStyle}>
            {options.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
        <a href="/strategies" style={{ color: 'var(--accent, #2563eb)', fontSize: 'var(--fs-xs, 11px)', paddingBottom: 8 }}>
          Manage configs →
        </a>

        {kind === 'sensitivity' && (
          <>
            <div style={{ flex: 1, minWidth: 220 }}>
              <FieldLabel>Knob</FieldLabel>
              <input aria-label="knob" value={knob} onChange={(e) => setKnob(e.target.value)} style={{ ...inputStyle, width: '100%', fontFamily: 'var(--mono)' }} />
            </div>
            <div style={{ minWidth: 160 }}>
              <FieldLabel>Values</FieldLabel>
              <input aria-label="values" value={values} onChange={(e) => setValues(e.target.value)} style={{ ...inputStyle, width: '100%', fontFamily: 'var(--mono)' }} />
            </div>
          </>
        )}

        <button
          type="button"
          disabled={start.isPending}
          onClick={launch}
          style={{
            marginLeft: 'auto',
            padding: '7px 16px',
            borderRadius: 'var(--r-md, 8px)',
            border: '1px solid var(--border-strong, #ccc)',
            background: start.isPending ? 'var(--surface-2, #eee)' : 'var(--accent, #2563eb)',
            color: start.isPending ? 'var(--text-muted)' : '#fff',
            fontWeight: 600,
            cursor: start.isPending ? 'default' : 'pointer',
          }}
        >
          {start.isPending ? 'Launching…' : '▶ Launch study'}
        </button>
      </div>

      {start.isError && (
        <div style={{ marginTop: 8, color: 'var(--neg, #b42318)', fontSize: 'var(--fs-sm, 13px)' }}>{start.error.message}</div>
      )}
      {start.isSuccess && (
        <div style={{ marginTop: 6, fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)' }}>
          Launched · {start.data.planned_evaluations} evaluations planned
        </div>
      )}

      {launched && (
        <StudyStatusPanel studyId={launched.id} kind={launched.kind} configName={launched.config} onDismiss={() => setLaunched(null)} />
      )}
    </div>
  )
}
