import { useEffect, useState } from 'react'
import { useConfigs } from '@/hooks/useConfigs'
import {
  useCampaign,
  useCampaigns,
  useCancelCampaign,
  useStartCampaign,
} from '@/hooks/useCampaigns'
import { HelpTooltip } from '@/components/help-tooltip'
import type { Campaign } from '@/api/types'

// Feature 019 (FR-015/FR-016/FR-017): launch + live progress for the
// auto-research campaign. The verdict surface NEVER offers a lockbox spend —
// ready_for_lockbox hands the candidate to the human (the lockbox card on
// this same page).

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
    <span style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3, fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
      {children}
    </span>
  )
}

export const VERDICT_LABEL: Record<string, string> = {
  ready_for_lockbox: 'Ready for lockbox',
  stop_tuning: 'Stop tuning',
  budget_exhausted: 'Budget exhausted',
  cancelled: 'Cancelled',
  failed: 'Failed',
}

export const VERDICT_CHIP_CLASS: Record<string, string> = {
  ready_for_lockbox: 'chip chip-profit',
  stop_tuning: 'chip chip-muted',
  budget_exhausted: 'chip chip-muted',
  cancelled: 'chip chip-muted',
  failed: 'chip chip-loss',
}

function VerdictPanel({ campaign }: { campaign: Campaign }) {
  const verdict = campaign.verdict ?? 'failed'
  const detail = campaign.verdict_detail ?? {}
  return (
    <div
      data-testid="campaign-verdict"
      style={{ marginTop: 12, padding: '12px 14px', borderRadius: 'var(--r-md, 10px)', border: '1px solid var(--border)', background: 'var(--surface-2, #f6f7f9)', display: 'flex', flexDirection: 'column', gap: 8 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <span className={VERDICT_CHIP_CLASS[verdict]}>{VERDICT_LABEL[verdict]}</span>
        {verdict === 'ready_for_lockbox' && <HelpTooltip helpKey="ready_for_lockbox" />}
        {typeof detail.candidate === 'string' && (
          <code className="mono" style={{ fontWeight: 700 }}>{detail.candidate}</code>
        )}
        <a
          href={`/validation/campaigns/${campaign.id}`}
          style={{ marginLeft: 'auto', color: 'var(--accent, #2563eb)', fontWeight: 600, fontSize: 'var(--fs-sm, 13px)' }}
        >
          View cycles →
        </a>
      </div>
      <div style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)' }}>
        {verdict === 'ready_for_lockbox' && (
          <>
            This candidate cleared the tightened gate. Review it, then run your
            one-shot lockbox test from the lockbox card below — when YOU decide.
            The campaign never spends it for you.
          </>
        )}
        {verdict === 'stop_tuning' && (
          <>{String(detail.hint ?? detail.reason ?? 'no setting in this family shows deployable edge')}</>
        )}
        {verdict === 'budget_exhausted' && (
          <>Trial budget used up without a gate pass — review the cycles before spending more trials.</>
        )}
        {verdict === 'cancelled' && <>Cancelled at the stage boundary — nothing half-recorded.</>}
        {verdict === 'failed' && <>{String(detail.reason ?? 'failed')}</>}
      </div>
    </div>
  )
}

function ProgressPanel({ campaign, onCancel, cancelling }: {
  campaign: Campaign
  onCancel: () => void
  cancelling: boolean
}) {
  const lastCycle = campaign.cycles[campaign.cycles.length - 1]
  const lastStage = lastCycle?.stages[lastCycle.stages.length - 1]
  return (
    <div
      data-testid="campaign-progress"
      style={{ marginTop: 12, padding: '12px 14px', borderRadius: 'var(--r-md, 10px)', border: '1px solid var(--accent, #2563eb)', background: 'var(--accent-bg, #eef4fe)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}
    >
      <span className="spinner" aria-hidden />
      <span style={{ fontWeight: 700, fontSize: 'var(--fs-sm, 13px)' }}>
        Cycle {lastCycle?.cycle ?? 1}
        {lastStage ? ` · ${lastStage.stage} ${lastStage.status}` : ' · starting…'}
      </span>
      <span className="mono" style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)' }}>
        candidate {lastCycle?.candidate_config_name ?? campaign.starting_config_name}
      </span>
      <span className="mono" style={{ marginLeft: 'auto', fontSize: 'var(--fs-sm, 13px)', fontWeight: 700 }}>
        {campaign.trials_used}/{campaign.budget} trials
      </span>
      <button type="button" className="btn btn-sm" disabled={cancelling} onClick={onCancel}>
        Cancel campaign
      </button>
    </div>
  )
}

export function AutoResearchCard() {
  const configsQuery = useConfigs()
  const configs = configsQuery.data?.configs ?? []
  const activeName = configs.find(c => c.is_active)?.name
  const [picked, setPicked] = useState<string | null>(null)
  const configName = picked ?? activeName ?? 'default'

  const list = useCampaigns()
  const defaultBudget = list.data?.default_budget
  const [budget, setBudget] = useState<string>('')
  // Seed the budget from config once it arrives; the operator can override.
  useEffect(() => {
    if (budget === '' && defaultBudget !== undefined) setBudget(String(defaultBudget))
  }, [budget, defaultBudget])

  const latest = list.data?.campaigns[0]
  const live = useCampaign(latest?.id)
  const campaign = live.data ?? latest

  const start = useStartCampaign()
  const cancel = useCancelCampaign()

  function launch() {
    const parsed = Number(budget)
    start.mutate({
      config_name: configName,
      budget: Number.isFinite(parsed) ? parsed : undefined,
    })
  }

  const options = configs.length > 0 ? configs.map(c => c.name) : ['default']

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, maxWidth: 420 }}>
          <FieldLabel>
            Starting config <HelpTooltip helpKey="auto_research_campaign" />
          </FieldLabel>
          <select
            aria-label="campaign config"
            value={configName}
            onChange={e => setPicked(e.target.value)}
            style={{ ...inputStyle, minWidth: 260, width: '100%' }}
          >
            {options.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel>
            Trial budget <HelpTooltip helpKey="trial_budget" />
          </FieldLabel>
          <input
            type="number"
            aria-label="campaign budget"
            value={budget}
            min={0}
            onChange={e => setBudget(e.target.value)}
            style={{ ...inputStyle, width: 90, fontFamily: 'var(--mono)' }}
          />
        </div>
        <span style={{ fontSize: 'var(--fs-xs, 11px)', color: 'var(--text-muted)', paddingBottom: 8, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          Halts only at a stopping rule <HelpTooltip helpKey="stopping_rules" />
        </span>
        <button
          type="button"
          className="btn btn-primary"
          style={{ marginLeft: 'auto' }}
          disabled={start.isPending || campaign?.status === 'running'}
          onClick={launch}
        >
          {start.isPending ? 'Starting…' : '▶ Start campaign'}
        </button>
      </div>

      {start.isError && (
        <div style={{ marginTop: 8, color: 'var(--loss, #b42318)', fontSize: 'var(--fs-sm, 13px)' }}>
          {start.error.message}
        </div>
      )}

      {campaign?.status === 'running' && (
        <ProgressPanel
          campaign={campaign}
          cancelling={cancel.isPending}
          onCancel={() => cancel.mutate(campaign.id)}
        />
      )}
      {campaign && campaign.status !== 'running' && <VerdictPanel campaign={campaign} />}
    </div>
  )
}
