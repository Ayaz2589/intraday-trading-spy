import { useCampaign } from '@/hooks/useCampaigns'
import { HelpTooltip } from '@/components/help-tooltip'
import { SectionTitle, cardSection } from '@/components/section-title'
import {
  VERDICT_CHIP_CLASS,
  VERDICT_LABEL,
} from '@/components/validation/AutoResearchCard'
import type { CampaignCycle, CampaignStage } from '@/api/types'

// Feature 019 (FR-015/FR-016): the per-campaign drill-down — verdict hero +
// one timeline entry per cycle: stage outcomes, the gate CI vs the bar
// applied (k, level), the action taken, and links to every produced artifact.

const STAGE_CHIP: Record<string, string> = {
  ok: 'chip chip-profit',
  pass: 'chip chip-profit',
  fail: 'chip chip-muted',
}

function pct(level: number): string {
  return `${(level * 100).toFixed(2)}%`
}

function StageRow({ stage }: { stage: CampaignStage }) {
  const d = stage.detail ?? {}
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', fontSize: 'var(--fs-sm, 13px)' }}>
      <span style={{ width: 52, textTransform: 'uppercase', fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-faint)', fontWeight: 700 }}>
        {stage.stage}
      </span>
      <span className={STAGE_CHIP[stage.status] ?? 'chip chip-loss'}>{stage.status}</span>
      {stage.stage === 'gate' && typeof d.level === 'number' && (
        <span className="mono" style={{ fontSize: 'var(--fs-xs, 11px)' }}>
          CI [{Number(d.ci_low ?? 0).toFixed(2)}, {Number(d.ci_high ?? 0).toFixed(2)}] vs bar k={d.k} @ {pct(d.level)}
          {' '}<HelpTooltip helpKey="tightened_bar" />
        </span>
      )}
      {typeof d.study_id === 'string' && (
        <a href={`/validation/${d.study_id}`} style={{ color: 'var(--accent, #2563eb)', fontWeight: 600, fontSize: 'var(--fs-xs, 11px)' }}>
          study {d.study_id.slice(0, 8)} →
        </a>
      )}
      {stage.stage === 'act' && typeof d.action === 'string' && (
        <span className="mono" style={{ fontSize: 'var(--fs-xs, 11px)' }}>
          {d.action}
          {typeof d.config_name === 'string' && <> → {d.config_name}</>}
        </span>
      )}
      {stage.stage === 'error' && (
        <span style={{ color: 'var(--loss, #b42318)', fontSize: 'var(--fs-xs, 11px)' }}>
          {String(d.reason ?? '')}
        </span>
      )}
    </div>
  )
}

function CycleCard({ cycle }: { cycle: CampaignCycle }) {
  return (
    <li
      className="card"
      data-testid={`campaign-cycle-${cycle.cycle}`}
      style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, fontSize: 'var(--fs-sm, 13px)' }}>Cycle {cycle.cycle}</span>
        <code className="mono" style={{ fontSize: 'var(--fs-xs, 11px)' }}>{cycle.candidate_config_name}</code>
        {cycle.family && (
          <span className="mono" style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-faint)' }}>
            family {cycle.family}
          </span>
        )}
      </div>
      {cycle.stages.map((s, i) => (
        <StageRow key={i} stage={s} />
      ))}
    </li>
  )
}

export function CampaignDetailPage({ campaignId }: { campaignId: string }) {
  const query = useCampaign(campaignId)
  const campaign = query.data
  if (!campaign) {
    return <p className="stat-label" style={{ padding: 16 }}>Loading campaign…</p>
  }
  const verdict = campaign.verdict
  const detail = campaign.verdict_detail ?? {}
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '0 0 24px' }}>
      <section style={cardSection}>
        <SectionTitle
          title={`Campaign ${String(campaign.seq).padStart(2, '0')}`}
          subtitle={`from ${campaign.starting_config_name} · ${campaign.trials_used}/${campaign.budget} trials used`}
        >
          <HelpTooltip helpKey="auto_research_campaign" />
        </SectionTitle>
        <div
          data-testid="campaign-verdict"
          style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}
        >
          {campaign.status === 'running' ? (
            <span className="chip chip-accent">running</span>
          ) : (
            <span className={VERDICT_CHIP_CLASS[verdict ?? 'failed']}>
              {VERDICT_LABEL[verdict ?? 'failed']}
            </span>
          )}
          {verdict === 'ready_for_lockbox' && <HelpTooltip helpKey="ready_for_lockbox" />}
          {typeof detail.candidate === 'string' && (
            <code className="mono" style={{ fontWeight: 700 }}>{detail.candidate}</code>
          )}
          {verdict === 'ready_for_lockbox' && (
            <span style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)' }}>
              Run your one-shot lockbox test from the Validation page — when YOU decide.
            </span>
          )}
          {verdict === 'stop_tuning' && (
            <span style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)' }}>
              {String(detail.hint ?? detail.reason ?? '')}
            </span>
          )}
          {verdict === 'failed' && (
            <span style={{ color: 'var(--loss, #b42318)', fontSize: 'var(--fs-xs, 11px)' }}>
              {String(detail.reason ?? '')}
            </span>
          )}
        </div>
      </section>

      <section style={cardSection}>
        <SectionTitle
          title="Cycles"
          subtitle={`${campaign.cycles.length} cycle${campaign.cycles.length === 1 ? '' : 's'} — every stage, gate bar, and action`}
        >
          <HelpTooltip helpKey="tightened_bar" />
        </SectionTitle>
        <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0', display: 'grid', gap: 8 }}>
          {campaign.cycles.map(c => (
            <CycleCard key={c.cycle} cycle={c} />
          ))}
        </ul>
      </section>
    </div>
  )
}
