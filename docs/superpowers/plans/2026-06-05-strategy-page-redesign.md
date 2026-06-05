# Strategy Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the `/strategies` page to the user's mockup — strategy hero card with Entry/Stop/Target explainers, a separate "New config" section, and accordion config rows with an inline grouped knob editor showing default hints and off-default highlights.

**Architecture:** Frontend-only (zero backend/API changes). The `config-manager.tsx` monolith is decomposed into focused components (`strategy-hero`, `new-config-form`, `config-list`, `config-editor`) composed by a thin `ConfigWorkbench`; pure diff/format logic lives in `lib/config-knobs.ts`. Spec: `docs/superpowers/specs/2026-06-05-strategy-page-redesign-design.md`.

**Tech Stack:** React 18 + TypeScript + Vite, TanStack Query/Router, Vitest + React Testing Library (happy-dom). Styling = existing CSS variables/classes in `frontend/src/styles/globals.css` (`.card`, `.chip`, `.btn`, `.stat-label`, `cardSection`, `SectionTitle`) — **no new CSS tokens**.

**Working directory:** all commands run from `frontend/` unless noted. Run a single test file with `npm test -- <path>`; full suite `npm test`; typecheck `npm run typecheck`.

**Conventions that must survive the redesign** (existing tests/constitution depend on them):
- HelpTooltips (constitution VI), all 7 keys: `strategy_registry` (hero), `saved_config` + `active_config` (Configs section title), `duplicate_vs_edit` (New config section title), `position_cap` + `buying_power` (Position cap field), `delete_safe` (delete confirm).
- Aria labels kept verbatim: `new config name`, `source`, `preset`, `duplicate from`, `rename ${name}`, `confirm delete ${name}`, `save ${name}`.
- Test ids kept: `active-badge-${name}`, `config-list`, `config-manager`, `strategy-card-${key}`.
- Knob defaults (mirror of `backend/config/config.yaml`, verified 2026-06-05): account 25000 · risk/trade 0.1 · cap 400 · lockout 2 · OR 15 · R:R 2.0 · stop buffer 0.05 · max-dist-VWAP 0.25.

---

## File map

| Action | Path | Responsibility |
|---|---|---|
| Modify | `frontend/src/lib/config-knobs.ts` | + `KNOB_DEFAULTS`, `offDefaultKeys()`, `knobChips()` |
| Create | `frontend/src/lib/config-knobs.test.ts` | unit tests for the above |
| Create | `frontend/src/components/strategies/strategy-explainers.tsx` | Entry/Stop/Target prose map keyed by `strategy.key` |
| Create | `frontend/src/components/strategies/strategy-hero.tsx` | hero card per enabled strategy |
| Create | `frontend/src/components/strategies/strategy-hero.test.tsx` | hero tests |
| Create | `frontend/src/components/strategies/field.tsx` | shared `FieldLabel` + `inputStyle` atoms (TDD-exempt wrapper) |
| Create | `frontend/src/components/strategies/config-editor.tsx` | grouped knob editor (SIZING/SIGNAL, hints, footer) |
| Create | `frontend/src/components/strategies/config-editor.test.tsx` | editor tests |
| Create | `frontend/src/components/strategies/config-list.tsx` | Configs section, accordion rows |
| Create | `frontend/src/components/strategies/config-list.test.tsx` | list tests |
| Create | `frontend/src/components/strategies/new-config-form.tsx` | New config section |
| Create | `frontend/src/components/strategies/new-config-form.test.tsx` | form tests |
| Modify | `frontend/src/components/strategies/config-manager.tsx` | shrink to `ConfigWorkbench` composer |
| Modify | `frontend/src/components/strategies/config-manager.test.tsx` | rewrite as composer-level tests |
| Modify | `frontend/src/routes/_authenticated.strategies.tsx` | page header + new composition |
| Create | `frontend/src/routes/_authenticated.strategies.test.tsx` | page composition test |
| Modify | `frontend/src/components/help-tooltip.feature-007-coverage.test.tsx` | `StrategyList` → `StrategyHero` |
| Delete | `frontend/src/components/strategies/StrategyList.tsx` | superseded by hero |
| Delete | `frontend/src/components/strategies/StrategyCard.tsx` | superseded by hero |

---

### Task 1: Knob defaults + diff helpers in `lib/config-knobs.ts`

**Files:**
- Modify: `frontend/src/lib/config-knobs.ts`
- Test: `frontend/src/lib/config-knobs.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/config-knobs.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  KNOB_DEFAULTS,
  knobChips,
  knobsFromConfig,
  offDefaultKeys,
} from './config-knobs'
import type { Config } from '@/api/types'

const cfg = (params: Record<string, unknown>): Config => ({
  id: '1',
  name: 'x',
  mode: 'backtest',
  timeframe: '5m',
  strategy_id: 's',
  params,
})

describe('KNOB_DEFAULTS', () => {
  it('mirrors backend/config/config.yaml', () => {
    expect(KNOB_DEFAULTS).toEqual({
      account_value: 25000,
      max_risk_per_trade_pct: 0.1,
      max_position_value_pct: 400,
      max_consecutive_losses: 2,
      opening_range_minutes: 15,
      risk_reward: 2.0,
      stop_buffer_pct: 0.05,
      max_distance_from_vwap_pct: 0.25,
    })
  })

  it('is the fallback for an empty config', () => {
    expect(knobsFromConfig(cfg({}))).toEqual(KNOB_DEFAULTS)
  })
})

describe('offDefaultKeys', () => {
  it('is empty at defaults', () => {
    expect(offDefaultKeys({ ...KNOB_DEFAULTS })).toEqual([])
  })

  it('lists every knob that differs from its default', () => {
    const knobs = { ...KNOB_DEFAULTS, max_position_value_pct: 100, risk_reward: 3 }
    expect(offDefaultKeys(knobs)).toEqual(['max_position_value_pct', 'risk_reward'])
  })
})

describe('knobChips', () => {
  it('formats the four collapsed-row summary chips, trimming trailing zeros', () => {
    expect(knobChips({ ...KNOB_DEFAULTS })).toEqual([
      { label: 'risk', value: '0.1%' },
      { label: 'cap', value: '400%' },
      { label: 'R:R', value: '2' },
      { label: 'lockout', value: '2' },
    ])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/config-knobs.test.ts`
Expected: FAIL — `KNOB_DEFAULTS`, `offDefaultKeys`, `knobChips` are not exported.

- [ ] **Step 3: Implement**

In `frontend/src/lib/config-knobs.ts`, after the `KnobValues` interface add:

```ts
// Mirror of backend/config/config.yaml (verified 2026-06-05) — drives the
// editor's "default x" hints, changed-field highlights, and the config rows'
// "N off default" chips.
export const KNOB_DEFAULTS: KnobValues = {
  account_value: 25000,
  max_risk_per_trade_pct: 0.1,
  max_position_value_pct: 400,
  max_consecutive_losses: 2,
  opening_range_minutes: 15,
  risk_reward: 2.0,
  stop_buffer_pct: 0.05,
  max_distance_from_vwap_pct: 0.25,
}

/** Knobs that differ from the built-in defaults (drives "N off default"). */
export function offDefaultKeys(knobs: KnobValues): (keyof KnobValues)[] {
  return (Object.keys(KNOB_DEFAULTS) as (keyof KnobValues)[]).filter(
    k => knobs[k] !== KNOB_DEFAULTS[k],
  )
}

/** Compact summary chips for a collapsed config row. Number→string keeps JS
 *  default formatting (no trailing zeros: 2.0 → "2"). */
export function knobChips(knobs: KnobValues): { label: string; value: string }[] {
  return [
    { label: 'risk', value: `${knobs.max_risk_per_trade_pct}%` },
    { label: 'cap', value: `${knobs.max_position_value_pct}%` },
    { label: 'R:R', value: `${knobs.risk_reward}` },
    { label: 'lockout', value: `${knobs.max_consecutive_losses}` },
  ]
}
```

Then deduplicate `knobsFromConfig` — replace its literal fallbacks with the constant (body otherwise unchanged):

```ts
export function knobsFromConfig(config: Config | undefined): KnobValues {
  const p = (config?.params ?? {}) as Record<string, unknown>
  const num = (v: unknown, fallback: number) => {
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
    return Number.isFinite(n) ? n : fallback
  }
  return {
    account_value: num(get(p, ['risk', 'account_value']), KNOB_DEFAULTS.account_value),
    max_risk_per_trade_pct: num(get(p, ['risk', 'max_risk_per_trade_pct']), KNOB_DEFAULTS.max_risk_per_trade_pct),
    max_position_value_pct: num(get(p, ['risk', 'max_position_value_pct']), KNOB_DEFAULTS.max_position_value_pct),
    max_consecutive_losses: num(get(p, ['risk', 'max_consecutive_losses']), KNOB_DEFAULTS.max_consecutive_losses),
    opening_range_minutes: num(get(p, ['strategy', 'opening_range', 'minutes']), KNOB_DEFAULTS.opening_range_minutes),
    risk_reward: num(get(p, ['strategy', 'vwap_pullback', 'target', 'risk_reward']), KNOB_DEFAULTS.risk_reward),
    stop_buffer_pct: num(get(p, ['strategy', 'vwap_pullback', 'stop', 'buffer_pct']), KNOB_DEFAULTS.stop_buffer_pct),
    max_distance_from_vwap_pct: num(
      get(p, ['strategy', 'vwap_pullback', 'max_distance_from_vwap_pct']),
      KNOB_DEFAULTS.max_distance_from_vwap_pct,
    ),
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/config-knobs.test.ts`
Expected: PASS (5 tests). Also run `npm test -- src/components/strategies/config-manager.test.tsx` — the old manager still consumes `knobsFromConfig`; expect PASS (9 tests, unchanged behavior).

- [ ] **Step 5: Commit**

```bash
git add src/lib/config-knobs.ts src/lib/config-knobs.test.ts
git commit -m "feat(strategies): KNOB_DEFAULTS + off-default diff/chip helpers in config-knobs"
```

---

### Task 2: Strategy explainers map + StrategyHero

**Files:**
- Create: `frontend/src/components/strategies/strategy-explainers.tsx`
- Create: `frontend/src/components/strategies/strategy-hero.tsx`
- Test: `frontend/src/components/strategies/strategy-hero.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/strategies/strategy-hero.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { StrategyHero } from './strategy-hero'

const listStrategiesMock = vi.fn()
vi.mock('@/api/strategies', () => ({
  listStrategies: () => listStrategiesMock(),
}))

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: 0 } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

const vwap = {
  key: 'vwap_pullback_long',
  display_name: 'VWAP Pullback (Long)',
  description:
    'After the opening range completes, a long signal is generated when SPY pulls back to its VWAP from above, with confirmation.',
  symbol: 'SPY',
  direction: 'LONG',
  kind: 'rule_based',
  enabled: true,
}

beforeEach(() => listStrategiesMock.mockReset())

describe('StrategyHero', () => {
  it('renders identity row: name, registry chips, active badge, description, tooltip', async () => {
    listStrategiesMock.mockResolvedValue({ strategies: [vwap] })
    wrap(<StrategyHero />)
    await waitFor(() =>
      expect(screen.getByText('VWAP Pullback (Long)')).toBeInTheDocument(),
    )
    expect(screen.getByText('SPY')).toBeInTheDocument()
    expect(screen.getByText('LONG')).toBeInTheDocument()
    expect(screen.getByText('rule_based')).toBeInTheDocument()
    expect(screen.getByText(/active strategy/)).toBeInTheDocument()
    expect(screen.getByText(/pulls back to its VWAP/)).toBeInTheDocument()
    expect(document.querySelector('[data-help-key="strategy_registry"]')).toBeTruthy()
    expect(screen.getByTestId('strategy-card-vwap_pullback_long')).toBeInTheDocument()
  })

  it('renders Entry / Stop / Target explainer cards for vwap_pullback_long', async () => {
    listStrategiesMock.mockResolvedValue({ strategies: [vwap] })
    wrap(<StrategyHero />)
    await waitFor(() => expect(screen.getByText('Entry')).toBeInTheDocument())
    expect(screen.getByText('Stop')).toBeInTheDocument()
    expect(screen.getByText('Target')).toBeInTheDocument()
    expect(screen.getByText('opening-range high')).toBeInTheDocument()
    expect(screen.getByText('below VWAP')).toBeInTheDocument()
  })

  it('omits the explainer grid for a strategy key without prose', async () => {
    listStrategiesMock.mockResolvedValue({
      strategies: [{ ...vwap, key: 'mystery_strategy' }],
    })
    wrap(<StrategyHero />)
    await waitFor(() =>
      expect(screen.getByText('VWAP Pullback (Long)')).toBeInTheDocument(),
    )
    expect(screen.queryByText('Entry')).toBeNull()
  })

  it('shows the empty state when no strategies are enabled', async () => {
    listStrategiesMock.mockResolvedValue({ strategies: [] })
    wrap(<StrategyHero />)
    await waitFor(() =>
      expect(screen.getByText('No enabled strategies.')).toBeInTheDocument(),
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/strategies/strategy-hero.test.tsx`
Expected: FAIL — cannot resolve `./strategy-hero`.

- [ ] **Step 3: Implement**

Create `frontend/src/components/strategies/strategy-explainers.tsx`:

```tsx
import type { ReactNode } from 'react'

// Educational Entry/Stop/Target breakdown per registered strategy, keyed by
// strategy.key (the registry's stable identifier). Frontend-owned prose per
// the 2026-06-05 redesign decision — a key with no entry here simply renders
// no explainer cards.
export type StrategyExplainer = {
  entry: ReactNode
  stop: ReactNode
  target: ReactNode
}

export const STRATEGY_EXPLAINERS: Record<string, StrategyExplainer> = {
  vwap_pullback_long: {
    entry: (
      <>
        Pullback to <strong>VWAP</strong> from above after the opening range,
        confirmed by a close back above the prior bar high.
      </>
    ),
    stop: (
      <>
        Placed <strong>below VWAP</strong> with a configurable buffer — defines
        1R for sizing.
      </>
    ),
    target: (
      <>
        The <strong>opening-range high</strong>, or a configured{' '}
        <strong>R-multiple</strong> if further.
      </>
    ),
  },
}
```

Create `frontend/src/components/strategies/strategy-hero.tsx`:

```tsx
import type { ReactNode } from 'react'
import { useStrategies } from '@/hooks/useStrategies'
import { HelpTooltip } from '@/components/help-tooltip'
import { STRATEGY_EXPLAINERS } from './strategy-explainers'
import type { Strategy } from '@/api/types'

// Mockup-driven hero card for each enabled strategy (2026-06-05 redesign):
// identity row + registry chips + "active strategy" badge, description, and
// an Entry / Stop / Target explainer grid with colored rails.
export function StrategyHero() {
  const query = useStrategies()

  if (query.isLoading) return <div className="p-4">Loading strategies…</div>
  if (query.isError) return <div className="p-4 text-destructive">Could not load strategies.</div>

  const strategies = query.data ?? []

  return (
    <div data-testid="strategy-hero" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {strategies.map(s => (
        <StrategyHeroCard key={s.key} strategy={s} />
      ))}
      {strategies.length === 0 && (
        <div className="text-sm text-muted-foreground">No enabled strategies.</div>
      )}
    </div>
  )
}

const registryChip: React.CSSProperties = {
  background: 'var(--surface-2)',
  color: 'var(--text-muted)',
  fontFamily: 'var(--mono)',
}

function StrategyHeroCard({ strategy }: { strategy: Strategy }) {
  const explainer = STRATEGY_EXPLAINERS[strategy.key]
  return (
    <section
      className="card"
      data-testid={`strategy-card-${strategy.key}`}
      style={{ padding: '16px 18px' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <span
          aria-hidden
          style={{
            display: 'grid',
            placeItems: 'center',
            width: 34,
            height: 34,
            borderRadius: 'var(--r-sm)',
            background: 'var(--accent-soft)',
            color: 'var(--accent)',
            fontSize: 'var(--fs-md)',
            flexShrink: 0,
          }}
        >
          ◎
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 'var(--fs-md)', fontWeight: 700 }}>
              {strategy.display_name}
            </h2>
            <HelpTooltip helpKey="strategy_registry" />
            <span className="chip" style={registryChip}>{strategy.symbol}</span>
            <span className="chip" style={registryChip}>{strategy.direction}</span>
            <span className="chip" style={registryChip}>{strategy.kind}</span>
            <span className="chip chip-profit" style={{ marginLeft: 'auto' }}>
              ● active strategy
            </span>
          </div>
          <p style={{ margin: '6px 0 0', fontSize: 'var(--fs-sm)', color: 'var(--text-muted)', maxWidth: 720 }}>
            {strategy.description}
          </p>
        </div>
      </div>
      {explainer && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 10,
            marginTop: 14,
          }}
        >
          <ExplainerCard title="Entry" color="var(--accent)" body={explainer.entry} />
          <ExplainerCard title="Stop" color="var(--loss)" body={explainer.stop} />
          <ExplainerCard title="Target" color="var(--profit)" body={explainer.target} />
        </div>
      )}
    </section>
  )
}

function ExplainerCard({ title, color, body }: { title: string; color: string; body: ReactNode }) {
  return (
    <div
      style={{
        borderLeft: `2px solid ${color}`,
        background: 'var(--surface-2)',
        borderRadius: 'var(--r-sm)',
        padding: '10px 12px',
      }}
    >
      <div className="stat-label" style={{ color, marginBottom: 4 }}>{title}</div>
      <p style={{ margin: 0, fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', lineHeight: 1.45 }}>
        {body}
      </p>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/components/strategies/strategy-hero.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/strategies/strategy-explainers.tsx src/components/strategies/strategy-hero.tsx src/components/strategies/strategy-hero.test.tsx
git commit -m "feat(strategies): StrategyHero card with Entry/Stop/Target explainers"
```

---

### Task 3: Shared field atoms + grouped ConfigEditor

**Files:**
- Create: `frontend/src/components/strategies/field.tsx` (TDD-exempt presentational wrapper, covered via component tests)
- Create: `frontend/src/components/strategies/config-editor.tsx`
- Test: `frontend/src/components/strategies/config-editor.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/strategies/config-editor.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { ConfigEditor } from './config-editor'
import type { Config } from '@/api/types'

const patchConfigMock = vi.fn()
vi.mock('@/api/configs', () => ({
  listConfigs: vi.fn(),
  listPresets: vi.fn(),
  createConfig: vi.fn(),
  duplicateConfig: vi.fn(),
  activateConfig: vi.fn(),
  patchConfig: (id: string, patch: unknown) => patchConfigMock(id, patch),
  deleteConfig: vi.fn(),
}))

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: 0 } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

const cfg = (params: Record<string, unknown> = {}): Config => ({
  id: '1',
  name: 'wf-rr3',
  mode: 'backtest',
  timeframe: '5m',
  strategy_id: 's',
  params,
})

// cap 100 + R:R 3 — two knobs off their defaults (400 / 2).
const offDefaultParams = {
  risk: { max_position_value_pct: 100 },
  strategy: { vwap_pullback: { target: { risk_reward: 3 } } },
}

beforeEach(() => patchConfigMock.mockReset())

describe('ConfigEditor', () => {
  it('renders SIZING and SIGNAL groups with default hints', () => {
    wrap(<ConfigEditor config={cfg()} />)
    expect(screen.getByText('Sizing')).toBeInTheDocument()
    expect(screen.getByText('Signal')).toBeInTheDocument()
    expect(screen.getByText('default 25,000')).toBeInTheDocument()
    expect(screen.getByText('default 0.05%')).toBeInTheDocument()
    expect(screen.getByText('default 15min')).toBeInTheDocument()
  })

  it('marks only off-default fields', () => {
    wrap(<ConfigEditor config={cfg(offDefaultParams)} />)
    expect(screen.getByTestId('off-default-max_position_value_pct')).toBeInTheDocument()
    expect(screen.getByTestId('off-default-risk_reward')).toBeInTheDocument()
    expect(screen.queryByTestId('off-default-account_value')).toBeNull()
  })

  it('starts clean: "No changes", Save and Revert disabled', () => {
    wrap(<ConfigEditor config={cfg()} />)
    expect(screen.getByText('No changes')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'save wf-rr3' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Revert' })).toBeDisabled()
  })

  it('tracks dirty count and Revert restores saved values', () => {
    wrap(<ConfigEditor config={cfg()} />)
    fireEvent.change(screen.getByLabelText('Position cap'), { target: { value: '500' } })
    expect(screen.getByText('1 unsaved change')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'save wf-rr3' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Revert' }))
    expect(screen.getByText('No changes')).toBeInTheDocument()
    expect(screen.getByLabelText('Position cap')).toHaveValue(400)
  })

  it('Reset to defaults sets all knobs to defaults (still needs Save)', () => {
    wrap(<ConfigEditor config={cfg(offDefaultParams)} />)
    fireEvent.click(screen.getByRole('button', { name: /Reset to defaults/ }))
    expect(screen.getByLabelText('Position cap')).toHaveValue(400)
    expect(screen.getByLabelText('Risk : reward')).toHaveValue(2)
    expect(screen.getByText('2 unsaved changes')).toBeInTheDocument()
    expect(patchConfigMock).not.toHaveBeenCalled()
  })

  it('saves edited knobs via PATCH params', async () => {
    patchConfigMock.mockResolvedValue(cfg())
    wrap(<ConfigEditor config={cfg()} />)
    fireEvent.change(screen.getByLabelText('Position cap'), { target: { value: '500' } })
    fireEvent.click(screen.getByRole('button', { name: 'save wf-rr3' }))
    await waitFor(() => expect(patchConfigMock).toHaveBeenCalledTimes(1))
    const [id, patch] = patchConfigMock.mock.calls[0] as [string, { params: Record<string, { max_position_value_pct?: number }> }]
    expect(id).toBe('1')
    expect(patch.params.risk.max_position_value_pct).toBe(500)
  })

  it('renders position-cap educational tooltips', () => {
    wrap(<ConfigEditor config={cfg()} />)
    for (const key of ['position_cap', 'buying_power']) {
      expect(document.querySelector(`[data-help-key="${key}"]`)).toBeTruthy()
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/strategies/config-editor.test.tsx`
Expected: FAIL — cannot resolve `./config-editor`.

- [ ] **Step 3: Implement**

Create `frontend/src/components/strategies/field.tsx`:

```tsx
// Tiny shared form atoms for the strategy page sections.
export const inputStyle: React.CSSProperties = {
  padding: '7px 10px',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r-sm)',
  background: 'var(--surface-2)',
  color: 'var(--text)',
  fontSize: 'var(--fs-sm)',
}

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 'var(--fs-2xs)',
        fontWeight: 600,
        color: 'var(--text-muted)',
        marginBottom: 3,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
      }}
    >
      {children}
    </label>
  )
}
```

Create `frontend/src/components/strategies/config-editor.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react'
import { useUpdateConfig } from '@/hooks/useConfigs'
import { HelpTooltip } from '@/components/help-tooltip'
import type { HelpContentKey } from '@/components/help-content'
import { FieldLabel } from './field'
import {
  KNOB_DEFAULTS,
  buildParams,
  get,
  knobsFromConfig,
  type KnobValues,
} from '@/lib/config-knobs'
import type { Config } from '@/api/types'

// Inline knob editor for one config (2026-06-05 redesign): SIZING / SIGNAL
// groups, per-field "default x" hints, changed-from-default highlighting, and
// a Reset-to-defaults / Revert / Save footer.

type FieldDef = {
  key: keyof KnobValues
  label: string
  step: number
  prefix?: string
  suffix?: string
  help?: HelpContentKey
  help2?: HelpContentKey
}

const SIZING_FIELDS: FieldDef[] = [
  { key: 'account_value', label: 'Account', step: 1000, prefix: '$' },
  { key: 'max_risk_per_trade_pct', label: 'Risk / trade', step: 0.05, suffix: '%' },
  { key: 'max_position_value_pct', label: 'Position cap', step: 50, suffix: '%', help: 'position_cap', help2: 'buying_power' },
  { key: 'max_consecutive_losses', label: 'Max consec. losses', step: 1 },
]

const SIGNAL_FIELDS: FieldDef[] = [
  { key: 'opening_range_minutes', label: 'Opening range', step: 5, suffix: 'min' },
  { key: 'risk_reward', label: 'Risk : reward', step: 0.25 },
  { key: 'stop_buffer_pct', label: 'Stop buffer', step: 0.01, suffix: '%' },
  { key: 'max_distance_from_vwap_pct', label: 'Max dist. VWAP', step: 0.05, suffix: '%' },
]

export function ConfigEditor({ config }: { config: Config }) {
  const update = useUpdateConfig()
  const savedKnobs = useMemo(() => knobsFromConfig(config), [config])
  const [knobs, setKnobs] = useState<KnobValues>(savedKnobs)
  const [savedFlash, setSavedFlash] = useState(false)
  useEffect(() => setKnobs(savedKnobs), [savedKnobs])

  const enabledSetup =
    (get(config.params, ['strategy', 'enabled_setup']) as string | undefined) ??
    'vwap_pullback_long'

  const dirtyKeys = (Object.keys(knobs) as (keyof KnobValues)[]).filter(
    k => knobs[k] !== savedKnobs[k],
  )
  const dirty = dirtyKeys.length > 0

  const onChange = <K extends keyof KnobValues>(key: K, value: number) =>
    setKnobs(prev => ({ ...prev, [key]: value }))

  const onSave = () => {
    setSavedFlash(false)
    update.mutate(
      { id: config.id, params: buildParams(knobs, enabledSetup) },
      { onSuccess: () => { setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1500) } },
    )
  }

  const status = update.isPending
    ? 'Saving…'
    : savedFlash
      ? 'Saved'
      : dirty
        ? `${dirtyKeys.length} unsaved change${dirtyKeys.length === 1 ? '' : 's'}`
        : 'No changes'

  return (
    <div data-testid={`config-editor-${config.name}`}>
      <h3 style={{ margin: '0 0 12px', fontSize: 'var(--fs-sm)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span aria-hidden style={{ color: 'var(--accent)' }}>✎</span>
        Edit <code className="mono" style={{ color: 'var(--accent)' }}>{config.name}</code>
      </h3>
      <KnobGroup title="Sizing" fields={SIZING_FIELDS} knobs={knobs} onChange={onChange} />
      <KnobGroup title="Signal" fields={SIGNAL_FIELDS} knobs={knobs} onChange={onChange} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
        <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-faint)' }}>{status}</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button type="button" className="btn" onClick={() => setKnobs({ ...KNOB_DEFAULTS })}>
            <span aria-hidden>↻</span> Reset to defaults
          </button>
          <button type="button" className="btn" disabled={!dirty} onClick={() => setKnobs(savedKnobs)}>
            Revert
          </button>
          <button
            type="button"
            className="btn btn-primary"
            aria-label={`save ${config.name}`}
            disabled={!dirty || update.isPending}
            onClick={onSave}
          >
            Save changes
          </button>
        </span>
      </div>
      {update.isError && (
        <p style={{ color: 'var(--loss, #dc2626)', fontSize: 'var(--fs-xs)', marginTop: 8 }}>
          {(update.error as Error).message}
        </p>
      )}
    </div>
  )
}

function KnobGroup({
  title,
  fields,
  knobs,
  onChange,
}: {
  title: string
  fields: FieldDef[]
  knobs: KnobValues
  onChange(key: keyof KnobValues, value: number): void
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="stat-label" style={{ marginBottom: 6 }}>{title}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
        {fields.map(f => (
          <KnobField key={f.key} def={f} value={knobs[f.key]} onChange={v => onChange(f.key, v)} />
        ))}
      </div>
    </div>
  )
}

function KnobField({
  def,
  value,
  onChange,
}: {
  def: FieldDef
  value: number
  onChange(v: number): void
}) {
  const offDefault = value !== KNOB_DEFAULTS[def.key]
  const adornment: React.CSSProperties = { color: 'var(--text-faint)', fontSize: 'var(--fs-xs)' }
  return (
    <div>
      <FieldLabel>
        {def.label}
        {offDefault && (
          <span
            data-testid={`off-default-${def.key}`}
            aria-hidden
            style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)' }}
          />
        )}
        {def.help && <HelpTooltip helpKey={def.help} />}
        {def.help2 && <HelpTooltip helpKey={def.help2} />}
      </FieldLabel>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '7px 10px',
          border: `1px solid ${offDefault ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: 'var(--r-sm)',
          background: 'var(--surface-2)',
        }}
      >
        {def.prefix && <span style={adornment}>{def.prefix}</span>}
        <input
          type="number"
          aria-label={def.label}
          value={value}
          step={def.step}
          onChange={e => {
            const n = Number(e.target.value)
            if (Number.isFinite(n)) onChange(n)
          }}
          style={{
            flex: 1,
            minWidth: 0,
            width: '100%',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text)',
            fontFamily: 'var(--mono)',
            fontSize: 'var(--fs-sm)',
          }}
        />
        {def.suffix && <span style={adornment}>{def.suffix}</span>}
      </div>
      <div style={{ fontSize: 'var(--fs-2xs)', color: offDefault ? 'var(--accent)' : 'var(--text-faint)', marginTop: 3 }}>
        default {KNOB_DEFAULTS[def.key].toLocaleString('en-US')}{def.suffix ?? ''}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/components/strategies/config-editor.test.tsx`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/strategies/field.tsx src/components/strategies/config-editor.tsx src/components/strategies/config-editor.test.tsx
git commit -m "feat(strategies): grouped ConfigEditor with default hints, off-default highlights, Reset/Revert/Save footer"
```

---

### Task 4: ConfigsSection accordion list

**Files:**
- Create: `frontend/src/components/strategies/config-list.tsx`
- Test: `frontend/src/components/strategies/config-list.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/strategies/config-list.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { ConfigsSection } from './config-list'
import type { Config } from '@/api/types'

const activateConfigMock = vi.fn()
const patchConfigMock = vi.fn()
const deleteConfigMock = vi.fn()
vi.mock('@/api/configs', () => ({
  listConfigs: vi.fn(),
  listPresets: vi.fn(),
  createConfig: vi.fn(),
  duplicateConfig: vi.fn(),
  activateConfig: (id: string) => activateConfigMock(id),
  patchConfig: (id: string, patch: unknown) => patchConfigMock(id, patch),
  deleteConfig: (id: string) => deleteConfigMock(id),
}))

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: 0 } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

const cfg = (
  id: string,
  name: string,
  is_active = false,
  params: Record<string, unknown> = {},
): Config => ({
  id,
  name,
  mode: 'backtest',
  timeframe: '5m',
  strategy_id: 's',
  params,
  is_active,
})

// cap 100 + R:R 3 → "2 off default" (defaults are 400 / 2).
const offDefaultParams = {
  risk: { max_position_value_pct: 100 },
  strategy: { vwap_pullback: { target: { risk_reward: 3 } } },
}

beforeEach(() => {
  for (const m of [activateConfigMock, patchConfigMock, deleteConfigMock]) m.mockReset()
})

describe('ConfigsSection', () => {
  it('shows the count subtitle and knob summary chips per row', () => {
    wrap(
      <ConfigsSection
        configs={[cfg('1', 'default', true), cfg('2', 'wf-rr3', false, offDefaultParams)]}
        expandedId={null}
        onToggle={() => {}}
      />,
    )
    expect(screen.getByText('2 configs · click one to edit its knobs')).toBeInTheDocument()
    const row = screen.getByTestId('config-row-default')
    expect(within(row).getByText('risk')).toBeInTheDocument()
    expect(within(row).getByText('0.1%')).toBeInTheDocument()
    expect(within(row).getByText('400%')).toBeInTheDocument()
    expect(within(row).getByText('lockout')).toBeInTheDocument()
  })

  it('shows "N off default" only for rows that differ', () => {
    wrap(
      <ConfigsSection
        configs={[cfg('1', 'default', true), cfg('2', 'wf-rr3', false, offDefaultParams)]}
        expandedId={null}
        onToggle={() => {}}
      />,
    )
    expect(screen.getByTestId('off-default-wf-rr3')).toHaveTextContent('2 off default')
    expect(screen.queryByTestId('off-default-default')).toBeNull()
  })

  it('marks the active config and activates another', async () => {
    activateConfigMock.mockResolvedValue(cfg('2', 'wf-rr3', true))
    wrap(
      <ConfigsSection
        configs={[cfg('1', 'default', true), cfg('2', 'wf-rr3')]}
        expandedId={null}
        onToggle={() => {}}
      />,
    )
    expect(screen.getByTestId('active-badge-default')).toHaveTextContent('ACTIVE')
    expect(screen.getAllByRole('button', { name: 'Set active' })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Set active' }))
    await waitFor(() => expect(activateConfigMock).toHaveBeenCalledWith('2'))
  })

  it('toggles a row via its header button', () => {
    const onToggle = vi.fn()
    wrap(
      <ConfigsSection
        configs={[cfg('1', 'default', true)]}
        expandedId={null}
        onToggle={onToggle}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'toggle default' }))
    expect(onToggle).toHaveBeenCalledWith('1')
  })

  it('renders the inline editor only for the expanded row', () => {
    wrap(
      <ConfigsSection
        configs={[cfg('1', 'default', true), cfg('2', 'wf-rr3')]}
        expandedId="1"
        onToggle={() => {}}
      />,
    )
    expect(screen.getByTestId('config-editor-default')).toBeInTheDocument()
    expect(screen.queryByTestId('config-editor-wf-rr3')).toBeNull()
  })

  it('renames a config', async () => {
    patchConfigMock.mockResolvedValue(cfg('2', 'renamed'))
    wrap(
      <ConfigsSection
        configs={[cfg('1', 'default', true), cfg('2', 'wf-rr3')]}
        expandedId={null}
        onToggle={() => {}}
      />,
    )
    fireEvent.click(screen.getAllByRole('button', { name: 'Rename' })[1])
    fireEvent.change(screen.getByLabelText('rename wf-rr3'), { target: { value: 'renamed' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }))
    await waitFor(() => expect(patchConfigMock).toHaveBeenCalledWith('2', { name: 'renamed' }))
  })

  it('deletes behind a confirm step and blocks deleting the last config', async () => {
    deleteConfigMock.mockResolvedValue({ deleted: '2' })
    const { unmount } = wrap(
      <ConfigsSection
        configs={[cfg('1', 'default', true), cfg('2', 'wf-rr3')]}
        expandedId={null}
        onToggle={() => {}}
      />,
    )
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[1])
    expect(document.querySelector('[data-help-key="delete_safe"]')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'confirm delete wf-rr3' }))
    await waitFor(() => expect(deleteConfigMock).toHaveBeenCalledWith('2'))
    unmount()

    wrap(
      <ConfigsSection configs={[cfg('1', 'default', true)]} expandedId={null} onToggle={() => {}} />,
    )
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
  })

  it('renders saved_config and active_config tooltips in the section title', () => {
    wrap(
      <ConfigsSection configs={[cfg('1', 'default', true)]} expandedId={null} onToggle={() => {}} />,
    )
    for (const key of ['saved_config', 'active_config']) {
      expect(document.querySelector(`[data-help-key="${key}"]`)).toBeTruthy()
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/strategies/config-list.test.tsx`
Expected: FAIL — cannot resolve `./config-list`.

- [ ] **Step 3: Implement**

Create `frontend/src/components/strategies/config-list.tsx`:

```tsx
import { useState } from 'react'
import { useActivateConfig, useDeleteConfig, useRenameConfig } from '@/hooks/useConfigs'
import { HelpTooltip } from '@/components/help-tooltip'
import { SectionTitle, cardSection } from '@/components/section-title'
import { ConfigEditor } from './config-editor'
import { inputStyle } from './field'
import { knobChips, knobsFromConfig, offDefaultKeys } from '@/lib/config-knobs'
import type { Config } from '@/api/types'

// "Configs" section of the strategy page (2026-06-05 redesign): single-expand
// accordion rows with knob-summary chips and an inline ConfigEditor. Rename /
// delete-confirm / last-config gating carried over from Feature 012.
export function ConfigsSection({
  configs,
  expandedId,
  onToggle,
}: {
  configs: Config[]
  expandedId: string | null
  onToggle(id: string): void
}) {
  const activate = useActivateConfig()
  const rename = useRenameConfig()
  const del = useDeleteConfig()

  return (
    <section data-testid="config-list" style={cardSection}>
      <SectionTitle
        title="Configs"
        subtitle={`${configs.length} config${configs.length === 1 ? '' : 's'} · click one to edit its knobs`}
      >
        <HelpTooltip helpKey="saved_config" />
        <HelpTooltip helpKey="active_config" />
      </SectionTitle>
      <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0', display: 'grid', gap: 8 }}>
        {configs.map(c => (
          <ConfigRow
            key={c.id}
            config={c}
            expanded={c.id === expandedId}
            canDelete={configs.length > 1}
            onToggle={() => onToggle(c.id)}
            onActivate={() => activate.mutate(c.id)}
            onRename={name => rename.mutate({ id: c.id, name })}
            onDelete={() => del.mutate(c.id)}
            renameError={(rename.error as Error | null)?.message}
            deleteError={(del.error as Error | null)?.message}
          />
        ))}
      </ul>
    </section>
  )
}

const summaryChip: React.CSSProperties = {
  background: 'var(--surface-2)',
  color: 'var(--text-muted)',
}

function ConfigRow({
  config,
  expanded,
  canDelete,
  onToggle,
  onActivate,
  onRename,
  onDelete,
  renameError,
  deleteError,
}: {
  config: Config
  expanded: boolean
  canDelete: boolean
  onToggle(): void
  onActivate(): void
  onRename(name: string): void
  onDelete(): void
  renameError?: string
  deleteError?: string
}) {
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(config.name)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const knobs = knobsFromConfig(config)
  const chips = knobChips(knobs)
  const offCount = offDefaultKeys(knobs).length

  return (
    <li
      className="card"
      data-testid={`config-row-${config.name}`}
      style={{
        padding: 0,
        overflow: 'hidden',
        border: expanded ? '1px solid var(--accent, #2563eb)' : undefined,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '10px 12px' }}>
        {renaming ? (
          <>
            <input
              aria-label={`rename ${config.name}`}
              value={name}
              onChange={e => setName(e.target.value)}
              style={inputStyle}
            />
            <button
              type="button"
              className="btn"
              onClick={() => {
                const trimmed = name.trim()
                if (trimmed && trimmed !== config.name) onRename(trimmed)
                setRenaming(false)
              }}
            >
              Save name
            </button>
            <button type="button" className="btn" onClick={() => { setName(config.name); setRenaming(false) }}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              aria-label={`toggle ${config.name}`}
              aria-expanded={expanded}
              onClick={onToggle}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                color: 'var(--text)',
                fontWeight: 600,
                fontFamily: 'var(--mono)',
                fontSize: 'var(--fs-sm)',
              }}
            >
              <span aria-hidden style={{ color: 'var(--text-faint)', fontSize: 10 }}>
                {expanded ? '▾' : '▸'}
              </span>
              {config.name}
            </button>
            {config.is_active && (
              <span data-testid={`active-badge-${config.name}`} className="chip chip-accent">
                ACTIVE
              </span>
            )}
            <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {chips.map(chip => (
                <span key={chip.label} className="chip" style={summaryChip}>
                  {chip.label}&nbsp;
                  <span style={{ fontFamily: 'var(--mono)', color: 'var(--text)' }}>{chip.value}</span>
                </span>
              ))}
            </span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
              {offCount > 0 && (
                <span data-testid={`off-default-${config.name}`} className="chip chip-accent">
                  {offCount} off default
                </span>
              )}
              {!config.is_active && (
                <button type="button" className="btn" onClick={onActivate}>
                  Set active
                </button>
              )}
              <button type="button" className="btn" onClick={() => setRenaming(true)}>
                Rename
              </button>
              {confirmDelete ? (
                <>
                  <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-muted)', alignSelf: 'center' }}>
                    Delete? <HelpTooltip helpKey="delete_safe" />
                  </span>
                  <button
                    type="button"
                    className="btn"
                    aria-label={`confirm delete ${config.name}`}
                    onClick={() => { onDelete(); setConfirmDelete(false) }}
                  >
                    Confirm
                  </button>
                  <button type="button" className="btn" onClick={() => setConfirmDelete(false)}>
                    Keep
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn"
                  disabled={!canDelete}
                  title={canDelete ? undefined : 'Cannot delete your last config'}
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete
                </button>
              )}
            </span>
          </>
        )}
        {(renameError || deleteError) && (
          <span style={{ flexBasis: '100%', color: 'var(--loss, #dc2626)', fontSize: 'var(--fs-xs)' }}>
            {renameError ?? deleteError}
          </span>
        )}
      </div>
      {expanded && !renaming && (
        <div style={{ borderTop: '1px solid var(--border)', padding: 12 }}>
          <ConfigEditor key={config.id} config={config} />
        </div>
      )}
    </li>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/components/strategies/config-list.test.tsx`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/strategies/config-list.tsx src/components/strategies/config-list.test.tsx
git commit -m "feat(strategies): ConfigsSection accordion with knob chips, off-default badge, inline editor"
```

---

### Task 5: NewConfigSection

**Files:**
- Create: `frontend/src/components/strategies/new-config-form.tsx`
- Test: `frontend/src/components/strategies/new-config-form.test.tsx` (create)

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/strategies/new-config-form.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { NewConfigSection } from './new-config-form'
import type { Config } from '@/api/types'

const listPresetsMock = vi.fn()
const createConfigMock = vi.fn()
const duplicateConfigMock = vi.fn()
vi.mock('@/api/configs', () => ({
  listConfigs: vi.fn(),
  listPresets: () => listPresetsMock(),
  createConfig: (b: unknown) => createConfigMock(b),
  duplicateConfig: (id: string, name: string) => duplicateConfigMock(id, name),
  activateConfig: vi.fn(),
  patchConfig: vi.fn(),
  deleteConfig: vi.fn(),
}))

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: 0 } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

const cfg = (id: string, name: string): Config => ({
  id,
  name,
  mode: 'backtest',
  timeframe: '5m',
  strategy_id: 's',
  params: {},
})

beforeEach(() => {
  for (const m of [listPresetsMock, createConfigMock, duplicateConfigMock]) m.mockReset()
  listPresetsMock.mockResolvedValue({
    presets: [
      {
        name: 'aggressive',
        description: 'Bigger risk per trade, looser loss lockout, wider VWAP band.',
        params: {},
      },
    ],
  })
})

async function mount(onCreated = vi.fn()) {
  wrap(
    <NewConfigSection configs={[cfg('1', 'default')]} activeConfigId="1" onCreated={onCreated} />,
  )
  await waitFor(() =>
    expect(screen.getByRole('option', { name: 'aggressive' })).toBeInTheDocument(),
  )
  return onCreated
}

describe('NewConfigSection', () => {
  it('creates from a preset and reports the new id', async () => {
    createConfigMock.mockResolvedValue(cfg('3', 'my-aggro'))
    const onCreated = await mount()
    fireEvent.change(screen.getByLabelText('new config name'), { target: { value: 'my-aggro' } })
    fireEvent.click(screen.getByRole('button', { name: '+ Create config' }))
    await waitFor(() =>
      expect(createConfigMock).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'my-aggro', source: 'preset', preset_name: 'aggressive' }),
      ),
    )
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('3'))
  })

  it('duplicates an existing config', async () => {
    duplicateConfigMock.mockResolvedValue(cfg('3', 'copy'))
    const onCreated = await mount()
    fireEvent.change(screen.getByLabelText('source'), { target: { value: 'duplicate' } })
    fireEvent.change(screen.getByLabelText('new config name'), { target: { value: 'copy' } })
    fireEvent.click(screen.getByRole('button', { name: '+ Create config' }))
    await waitFor(() => expect(duplicateConfigMock).toHaveBeenCalledWith('1', 'copy'))
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('3'))
  })

  it('disables the create button while the name is empty', async () => {
    await mount()
    expect(screen.getByRole('button', { name: '+ Create config' })).toBeDisabled()
  })

  it('shows the selected preset as a chip with its description', async () => {
    await mount()
    expect(screen.getByText('aggressive')).toBeInTheDocument()
    expect(
      screen.getByText('Bigger risk per trade, looser loss lockout, wider VWAP band.'),
    ).toBeInTheDocument()
  })

  it('renders the duplicate_vs_edit tooltip', async () => {
    await mount()
    expect(document.querySelector('[data-help-key="duplicate_vs_edit"]')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/strategies/new-config-form.test.tsx`
Expected: FAIL — cannot resolve `./new-config-form`.

- [ ] **Step 3: Implement**

Create `frontend/src/components/strategies/new-config-form.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { useCreateConfig, useDuplicateConfig, usePresets } from '@/hooks/useConfigs'
import { HelpTooltip } from '@/components/help-tooltip'
import { SectionTitle, cardSection } from '@/components/section-title'
import { FieldLabel, inputStyle } from './field'
import type { Config, ConfigSource } from '@/api/types'

// "New config" section of the strategy page (2026-06-05 redesign). Creation
// flows (preset / duplicate / scratch) carried over from Feature 012; reports
// the created config id so the workbench can expand its row.
export function NewConfigSection({
  configs,
  activeConfigId,
  onCreated,
}: {
  configs: Config[]
  activeConfigId?: string
  onCreated(id: string): void
}) {
  const presetsQuery = usePresets()
  const create = useCreateConfig()
  const duplicate = useDuplicateConfig()
  const presets = presetsQuery.data?.presets ?? []

  const [source, setSource] = useState<ConfigSource>('preset')
  const [newName, setNewName] = useState('')
  const [presetName, setPresetName] = useState('')
  const [dupFromId, setDupFromId] = useState('')
  const createErr = (create.error as Error | null)?.message

  useEffect(() => {
    if (!presetName && presets[0]) setPresetName(presets[0].name)
  }, [presetName, presets])
  useEffect(() => {
    if (!dupFromId && activeConfigId) setDupFromId(activeConfigId)
  }, [dupFromId, activeConfigId])

  const onCreate = () => {
    const name = newName.trim()
    if (!name) return
    if (source === 'duplicate') {
      duplicate.mutate(
        { id: dupFromId, name },
        { onSuccess: c => onCreated((c as Config).id) },
      )
    } else {
      create.mutate(
        {
          name,
          source,
          preset_name: source === 'preset' ? presetName : undefined,
        },
        { onSuccess: c => onCreated((c as Config).id) },
      )
    }
    setNewName('')
  }

  const selectedPreset = presets.find(p => p.name === presetName)

  return (
    <section data-testid="new-config" style={cardSection}>
      <SectionTitle
        title="New config"
        subtitle="A config is a named bundle of strategy + risk knobs — create several to compare A/B, run sensitivity, or freeze a candidate."
      >
        <HelpTooltip helpKey="duplicate_vs_edit" />
      </SectionTitle>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end', marginTop: 12 }}>
        <div style={{ flex: '1 1 180px' }}>
          <FieldLabel>Name</FieldLabel>
          <input
            aria-label="new config name"
            value={newName}
            placeholder="e.g. wf-rr4"
            onChange={e => setNewName(e.target.value)}
            style={{ ...inputStyle, width: '100%' }}
          />
        </div>
        <div>
          <FieldLabel>Source</FieldLabel>
          <select
            aria-label="source"
            value={source}
            onChange={e => setSource(e.target.value as ConfigSource)}
            style={inputStyle}
          >
            <option value="preset">From preset</option>
            <option value="duplicate">Duplicate existing</option>
            <option value="scratch">From scratch</option>
          </select>
        </div>
        {source === 'preset' && (
          <div>
            <FieldLabel>Preset</FieldLabel>
            <select
              aria-label="preset"
              value={presetName}
              onChange={e => setPresetName(e.target.value)}
              style={inputStyle}
            >
              {presets.map(p => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {source === 'duplicate' && (
          <div>
            <FieldLabel>Copy from</FieldLabel>
            <select
              aria-label="duplicate from"
              value={dupFromId}
              onChange={e => setDupFromId(e.target.value)}
              style={inputStyle}
            >
              {configs.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <button
          type="button"
          className="btn btn-primary"
          disabled={!newName.trim() || create.isPending || duplicate.isPending}
          onClick={onCreate}
        >
          + Create config
        </button>
      </div>
      {(createErr || duplicate.isError) && (
        <p style={{ margin: '8px 0 0', color: 'var(--loss, #dc2626)', fontSize: 'var(--fs-xs)' }}>
          {createErr ?? (duplicate.error as Error)?.message}
        </p>
      )}
      {source === 'preset' && selectedPreset && (
        <p
          style={{
            margin: '10px 0 0',
            fontSize: 'var(--fs-xs)',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span className="chip chip-accent">{selectedPreset.name}</span>
          {selectedPreset.description}
        </p>
      )}
    </section>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/components/strategies/new-config-form.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/strategies/new-config-form.tsx src/components/strategies/new-config-form.test.tsx
git commit -m "feat(strategies): NewConfigSection with preset chip + onCreated callback"
```

---

### Task 6: ConfigWorkbench composer (rewrite config-manager)

**Files:**
- Modify: `frontend/src/components/strategies/config-manager.tsx` (full replacement)
- Modify: `frontend/src/components/strategies/config-manager.test.tsx` (full replacement)

The old monolith's behaviors now live in (and are tested by) config-list / config-editor / new-config-form. This file keeps ONLY: the shared list query, the active-config default expansion, the expand/collapse toggle, and the create→auto-expand wiring.

- [ ] **Step 1: Write the failing test**

Replace the entire contents of `frontend/src/components/strategies/config-manager.test.tsx` with:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { ConfigWorkbench } from './config-manager'

const listConfigsMock = vi.fn()
const listPresetsMock = vi.fn()
const createConfigMock = vi.fn()
vi.mock('@/api/configs', () => ({
  listConfigs: () => listConfigsMock(),
  listPresets: () => listPresetsMock(),
  createConfig: (b: unknown) => createConfigMock(b),
  duplicateConfig: vi.fn(),
  activateConfig: vi.fn(),
  patchConfig: vi.fn(),
  deleteConfig: vi.fn(),
}))

function wrap(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: 0 } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

const cfg = (id: string, name: string, is_active = false) => ({
  id,
  name,
  mode: 'backtest',
  timeframe: '5m',
  strategy_id: 's',
  params: {},
  is_active,
})

beforeEach(() => {
  for (const m of [listConfigsMock, listPresetsMock, createConfigMock]) m.mockReset()
  listPresetsMock.mockResolvedValue({
    presets: [{ name: 'aggressive', description: 'more signals', params: {} }],
  })
})

describe('ConfigWorkbench', () => {
  it('expands the active config by default', async () => {
    listConfigsMock.mockResolvedValue({
      configs: [cfg('1', 'default'), cfg('2', 'wf-rr3', true)],
    })
    wrap(<ConfigWorkbench />)
    await waitFor(() =>
      expect(screen.getByTestId('config-editor-wf-rr3')).toBeInTheDocument(),
    )
    expect(screen.queryByTestId('config-editor-default')).toBeNull()
  })

  it('collapses an expanded row and does not re-expand it', async () => {
    listConfigsMock.mockResolvedValue({ configs: [cfg('1', 'default', true)] })
    wrap(<ConfigWorkbench />)
    await waitFor(() =>
      expect(screen.getByTestId('config-editor-default')).toBeInTheDocument(),
    )
    fireEvent.click(screen.getByRole('button', { name: 'toggle default' }))
    await waitFor(() =>
      expect(screen.queryByTestId('config-editor-default')).toBeNull(),
    )
  })

  it('auto-expands a freshly created config', async () => {
    listConfigsMock
      .mockResolvedValueOnce({ configs: [cfg('1', 'default', true)] })
      .mockResolvedValue({ configs: [cfg('1', 'default', true), cfg('3', 'my-aggro')] })
    createConfigMock.mockResolvedValue(cfg('3', 'my-aggro'))
    wrap(<ConfigWorkbench />)
    await waitFor(() =>
      expect(screen.getByTestId('config-editor-default')).toBeInTheDocument(),
    )
    fireEvent.change(screen.getByLabelText('new config name'), { target: { value: 'my-aggro' } })
    fireEvent.click(screen.getByRole('button', { name: '+ Create config' }))
    await waitFor(() =>
      expect(screen.getByTestId('config-editor-my-aggro')).toBeInTheDocument(),
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/strategies/config-manager.test.tsx`
Expected: FAIL — `ConfigWorkbench` is not exported (file still exports `ConfigManager`).

- [ ] **Step 3: Implement**

Replace the entire contents of `frontend/src/components/strategies/config-manager.tsx` with:

```tsx
import { useEffect, useMemo, useState } from 'react'
import { useConfigs } from '@/hooks/useConfigs'
import { NewConfigSection } from './new-config-form'
import { ConfigsSection } from './config-list'

// Feature 012's config manager, slimmed to a composer by the 2026-06-05
// redesign: NewConfigSection creates, ConfigsSection lists + edits inline.
// This file owns the shared list query and which accordion row is expanded.
export function ConfigWorkbench() {
  const configsQuery = useConfigs()
  const configs = configsQuery.data?.configs ?? []
  const activeConfig = useMemo(
    () => configs.find(c => c.is_active) ?? configs[0],
    [configs],
  )

  // undefined = not yet initialized (expand the active config once loaded);
  // null = the operator explicitly collapsed the open row.
  const [expandedId, setExpandedId] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    if (expandedId === undefined && activeConfig) setExpandedId(activeConfig.id)
  }, [expandedId, activeConfig])

  return (
    <div data-testid="config-manager" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <NewConfigSection
        configs={configs}
        activeConfigId={activeConfig?.id}
        onCreated={setExpandedId}
      />
      <ConfigsSection
        configs={configs}
        expandedId={expandedId ?? null}
        onToggle={id => setExpandedId(prev => (prev === id ? null : id))}
      />
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/components/strategies/config-manager.test.tsx`
Expected: PASS (3 tests).

Note: `src/routes/_authenticated.strategies.tsx` still imports the removed `ConfigManager` — the route breaks typecheck until Task 7. That is why Tasks 6 and 7 land back-to-back; do NOT run `npm run typecheck` between them.

- [ ] **Step 5: Commit**

```bash
git add src/components/strategies/config-manager.tsx src/components/strategies/config-manager.test.tsx
git commit -m "refactor(strategies): config-manager becomes ConfigWorkbench composer"
```

---

### Task 7: Page route, header, coverage-test swap, delete old components

**Files:**
- Modify: `frontend/src/routes/_authenticated.strategies.tsx` (full replacement)
- Test: `frontend/src/routes/_authenticated.strategies.test.tsx` (create)
- Modify: `frontend/src/components/help-tooltip.feature-007-coverage.test.tsx` (2 lines)
- Delete: `frontend/src/components/strategies/StrategyList.tsx`, `frontend/src/components/strategies/StrategyCard.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/routes/_authenticated.strategies.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Route } from './_authenticated.strategies'

vi.mock('@/api/strategies', () => ({
  listStrategies: vi.fn().mockResolvedValue({ strategies: [] }),
}))
vi.mock('@/api/configs', () => ({
  listConfigs: vi.fn().mockResolvedValue({ configs: [] }),
  listPresets: vi.fn().mockResolvedValue({ presets: [] }),
  createConfig: vi.fn(),
  duplicateConfig: vi.fn(),
  activateConfig: vi.fn(),
  patchConfig: vi.fn(),
  deleteConfig: vi.fn(),
}))

describe('StrategiesPage', () => {
  it('renders the page header, hero, and config workbench', async () => {
    const Page = Route.options.component as React.ComponentType
    const client = new QueryClient({ defaultOptions: { queries: { retry: 0 } } })
    render(
      <QueryClientProvider client={client}>
        <Page />
      </QueryClientProvider>,
    )
    expect(screen.getByText('Strategy & configs')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Define the strategy logic once, then tune named risk configs to backtest and compare',
      ),
    ).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('strategy-hero')).toBeInTheDocument())
    expect(screen.getByTestId('config-manager')).toBeInTheDocument()
  })
})
```

(If `createFileRoute` refuses to render outside a router in the test env, export `StrategiesPage` from the route file and import it directly instead of going through `Route.options.component` — assertions unchanged.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/routes/_authenticated.strategies.test.tsx`
Expected: FAIL — "Strategy & configs" not found (route still renders old composition and broken `ConfigManager` import).

- [ ] **Step 3: Implement**

Replace the entire contents of `frontend/src/routes/_authenticated.strategies.tsx` with:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { StrategyHero } from '@/components/strategies/strategy-hero'
import { ConfigWorkbench } from '@/components/strategies/config-manager'

export const Route = createFileRoute('/_authenticated/strategies')({
  component: StrategiesPage,
})

function StrategiesPage() {
  return (
    <div className="p-6" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <header>
        <h1 style={{ margin: 0, fontSize: 'var(--fs-lg)', fontWeight: 700 }}>
          Strategy &amp; configs
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: 'var(--fs-xs)', color: 'var(--text-muted)' }}>
          Define the strategy logic once, then tune named risk configs to backtest and compare
        </p>
      </header>
      <StrategyHero />
      <ConfigWorkbench />
    </div>
  )
}
```

In `frontend/src/components/help-tooltip.feature-007-coverage.test.tsx`, change line 115 from:

```ts
    const { StrategyList } = await import('./strategies/StrategyList')
```

to:

```ts
    const { StrategyHero } = await import('./strategies/strategy-hero')
```

and line 129 from `<StrategyList />` to `<StrategyHero />`.

Delete the superseded components:

```bash
git rm src/components/strategies/StrategyList.tsx src/components/strategies/StrategyCard.tsx
```

Confirm nothing else references them:

```bash
grep -rn "StrategyList\|StrategyCard" src/ | grep -v "StrategyListResponse"
```

Expected: no output (only the API type `StrategyListResponse` matches the stem, excluded by the grep).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/routes/_authenticated.strategies.test.tsx src/components/help-tooltip.feature-007-coverage.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A src/routes/_authenticated.strategies.tsx src/routes/_authenticated.strategies.test.tsx src/components/help-tooltip.feature-007-coverage.test.tsx
git commit -m "feat(strategies): Strategy & configs page header + new composition; drop StrategyList/StrategyCard"
```

---

### Task 8: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Frontend typecheck**

Run: `npm run typecheck`
Expected: exit 0, no errors.

- [ ] **Step 2: Full frontend suite**

Run: `npm test`
Expected: all green — including untouched suites (`strategy-config-dropdown`, `run-viewer`, `help-content`). If any unrelated test references removed labels/testids (e.g. old `Create` button, `active` lowercase badge, `strategy-list` testid), update that test to the new contract and note it in the commit message.

- [ ] **Step 3: Backend regression guard (no backend changes were made)**

Run from `backend/`: `python -m pytest -q`
Expected: same pass count as main (586 passed as of feature 015). Any failure here is pre-existing or environmental — investigate before blaming the redesign, but do not ship with it unexplained.

- [ ] **Step 4: Commit (only if Step 2 required test updates)**

```bash
git add -A && git commit -m "test: align remaining suites with redesigned strategy page"
```

---

## Self-review (done at plan time)

- **Spec coverage:** page header (T7) · hero + explainers + frontend map (T2) · New config section w/ preset chip (T5) · accordion rows w/ chips + N-off-default + ACTIVE (T4) · grouped editor w/ hints, highlights, Reset/Revert/Save (T3) · defaults source + diff helpers (T1) · workbench state & create→expand (T6) · all 7 HelpTooltips (T2 strategy_registry, T5 duplicate_vs_edit, T4 saved/active/delete_safe, T3 position_cap/buying_power) · deletions + coverage-test swap (T7) · zero API changes (no task touches `api/` or `hooks/`) · full suites (T8). No gaps found.
- **Migrated test parity:** old 9 cases → create-preset/duplicate (T5), activate/rename/delete/gating/badge (T4), tooltips (T2/T3/T4/T5), knob save (T3, now requires an edit first since Save disables when clean — intentional behavior change per mock), list+active default selection (T6).
- **Type consistency:** `ConfigWorkbench` (T6) matches route import (T7); `ConfigsSection` props `{configs, expandedId, onToggle}` consistent between T4 tests and T6 usage; `NewConfigSection` props `{configs, activeConfigId, onCreated}` consistent between T5 and T6; `config-editor-${name}` / `config-row-${name}` / `off-default-${key|name}` testids consistent across T3/T4/T6.
