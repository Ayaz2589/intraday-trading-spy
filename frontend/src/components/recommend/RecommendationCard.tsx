import { useNavigate } from '@tanstack/react-router'
import { knobLabel } from '@/lib/config-knobs'
import { encodeDraft } from '@/lib/draft-config'
import type { CandidateView } from '@/api/types'

// Feature 018 (US2): one card per recommendation. The ONLY actuation is
// 017's human-gated Draft config → navigation — this component never
// creates, modifies, or runs anything (FR-010). Already-tried candidates
// link the existing config's evidence instead of re-suggesting.

const CLASS_LABEL: Record<CandidateView['klass'], string> = {
  knob_delta: 'knob change',
  gather_evidence: 'gather evidence',
  stop_tuning: 'stop tuning',
}

const CLASS_BADGE: Record<CandidateView['klass'], string> = {
  knob_delta: 'badge-accent',
  gather_evidence: 'badge-info',
  stop_tuning: 'badge-loss',
}

function leafOf(path: string): string {
  return path.split('.').pop() ?? path
}

export function RecommendationCard({
  candidate,
  baseConfigName,
  analysisId,
}: {
  candidate: CandidateView
  baseConfigName: string
  analysisId?: string | null
}) {
  const navigate = useNavigate()
  const draftable =
    candidate.klass === 'knob_delta' &&
    candidate.changes.length > 0 &&
    !candidate.already_tried

  return (
    <div className="finding-card" data-testid="recommendation-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span className={`badge badge-xs ${CLASS_BADGE[candidate.klass]}`}>
          {CLASS_LABEL[candidate.klass]}
        </span>
        {candidate.changes.map((c) => (
          <span
            key={c.knob_path}
            className="mono stat-label"
            title={c.knob_path}
            style={{
              border: '1px solid var(--info)',
              borderRadius: 'var(--r-md)',
              padding: '0 8px',
            }}
          >
            {knobLabel(c.knob_path)} → {c.value}
          </span>
        ))}
        {candidate.already_tried && (
          <span className="badge badge-xs badge-faint" title="this knob set already exists">
            already tried — {candidate.already_tried.config_name}
          </span>
        )}
      </div>

      <div className="finding-claim" title={candidate.narrative_hint}>
        {candidate.narrative_hint}
      </div>

      {candidate.evidence.length > 0 && (
        <div className="stat-label mono" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {candidate.evidence.map((e) => (
            <span key={e.metric_path} title={e.metric_path}>
              {leafOf(e.metric_path)}{' '}
              <strong style={{ color: 'var(--info)' }}>
                ←{' '}
                {typeof e.value === 'number'
                  ? Math.abs(e.value) < 1 ? e.value.toFixed(4) : String(e.value)
                  : String(e.value)}
              </strong>
            </span>
          ))}
        </div>
      )}

      {draftable && (
        <div>
          {/* 017 transport: the draft travels in the URL only — the operator
              reviews and creates; nothing is written from here. */}
          <button
            type="button"
            className="btn btn-sm"
            onClick={() =>
              navigate({
                to: '/strategies',
                search: {
                  draft: encodeDraft({
                    base_config_name: baseConfigName,
                    changes: candidate.changes,
                    analysis_id: analysisId ?? '',
                    experiment_index: candidate.rank - 1,
                    hypothesis: candidate.narrative_hint,
                  }),
                },
              })
            }
          >
            Draft config →
          </button>
        </div>
      )}
    </div>
  )
}
