# Strategy page redesign — to the user's mockup

**Date:** 2026-06-05 · **Status:** approved (mockup provided by user; decisions
confirmed) · **Scope:** frontend-only design iteration on Feature 012's
strategy/config page — zero backend/API changes; the design doc is the spec
(no new Spec Kit feature). **Branch:** `redesign/strategy-page`.

## User-confirmed decisions

1. **Lightweight design → implement** (no Spec Kit feature number; TDD still
   mandatory per constitution IV).
2. **Entry / Stop / Target explainer prose lives in a frontend map** keyed by
   `strategy.key` (`strategy-explainers.tsx`, JSX values so key terms render
   bold). No backend registry/schema change; unknown keys omit the sub-cards.
3. **"Default" = the existing `knobsFromConfig` fallbacks** (verified mirror of
   `backend/config/config.yaml`): account 25 000 · risk/trade 0.1 % ·
   position cap 400 % · lockout 2 · OR 15 min · R:R 2.0 · stop buffer 0.05 % ·
   max-dist-VWAP 0.25 %. These drive the per-field "default x" hints, the
   changed-field highlight, and the row-level "N off default" chip.
4. `?` HelpTooltips stay (constitution VI) even though the mockup omits them —
   all seven existing keys carry over (`strategy_registry`, `saved_config`,
   `active_config`, `duplicate_vs_edit`, `position_cap`, `buying_power`,
   `delete_safe`); no new help concepts → no new keys.

## Component breakdown (route stays a thin composer)

```
_authenticated.strategies.tsx
├── page header     — "Strategy & configs" + "Define the strategy logic once,
│   then tune named risk configs to backtest and compare"
├── StrategyHero    — maps useStrategies() (enabled only; a future 2nd strategy
│   stacks another hero). Per strategy: icon chip · display_name ·
│   SPY / LONG / rule_based chips · right-aligned "● active strategy" badge
│   (= enabled) · description · 3-up explainer grid with colored left rails:
│   ENTRY (--accent) · STOP (--loss) · TARGET (--profit), prose from
│   strategy-explainers.tsx
└── ConfigWorkbench (config-manager.tsx shrinks to this composer; owns
    expandedId — init: active config — and the single useConfigs() query)
    ├── NewConfigSection (new-config-form.tsx) — cardSection + SectionTitle
    │   ("New config" + bundle explainer). Form row w/ uppercase labels:
    │   NAME input → SOURCE select (preset/duplicate/scratch) → conditional
    │   PRESET or COPY FROM select → "+ Create config" primary button.
    │   Below: selected preset as Badge + muted description. Create/duplicate
    │   errors inline; on success onCreated(id) → parent expands the new row.
    └── ConfigsSection (config-list.tsx) — cardSection + SectionTitle
        ("Configs", "{n} configs · click one to edit its knobs").
        Single-expand accordion rows:
        ├── collapsed: chevron · mono name · ACTIVE badge (active config) ·
        │   knob chips `risk x%` `cap x%` `R:R x` `lockout x` · right side:
        │   "N off default" chip (any of the 8 knobs ≠ default) · Set active
        │   (non-active only) · Rename · Delete. Rename (inline input +
        │   Save name/Cancel), delete-confirm step, and last-config delete
        │   gating carry over unchanged.
        └── expanded (accent border; header click toggles): ConfigEditor
            (config-editor.tsx) inline —
            header "✎ Edit {name}" (mono accent name);
            SIZING group: Account ($) · Risk/trade (%) · Position cap (%) ·
            Max consec. losses;
            SIGNAL group: Opening range (min) · Risk:reward · Stop buffer (%) ·
            Max dist. VWAP (%);
            each field: uppercase label · input · muted "default {x}" hint;
            value ≠ default → accent border + accent hint + label dot;
            footer: status left ("No changes" / "{n} unsaved changes"),
            right "↻ Reset to defaults" (sets all knobs to defaults locally,
            still needs Save) · "Revert" (discard unsaved edits; disabled when
            clean) · "Save changes" (primary; disabled when clean) →
            useUpdateConfig + buildParams.
```

Removed: `StrategyList.tsx` and `StrategyCard.tsx` (no test files of their
own) — superseded by `StrategyHero`. New files live in
`frontend/src/components/strategies/` (kebab-case, matching
`config-manager.tsx`). Styling = existing tokens + `SectionTitle`/`cardSection`
patterns only; no new CSS variables.

## New pure logic (in `lib/config-knobs.ts`, unit-tested)

- `KNOB_DEFAULTS: KnobValues` — exported constant (today's inline fallbacks,
  deduplicated so `knobsFromConfig` reads from it).
- `offDefaultKeys(knobs): (keyof KnobValues)[]` — knobs differing from
  defaults; length feeds the "N off default" chip, membership feeds field
  highlights.
- chip formatter for the collapsed-row summary (`risk 0.1%` etc., trailing
  zeros trimmed).

## Wiring

`ConfigWorkbench` owns `expandedId` + list query and passes props/callbacks
down; all seven existing hooks/mutations (`useConfigs`, `usePresets`, create /
duplicate / activate / rename / update / delete) are reused untouched — zero
API changes. Query invalidation (configs + runs) unchanged. Errors stay
per-section (existing pattern). `strategy-config-dropdown` and run-viewer
components untouched.

## Testing

Existing 9 `config-manager.test.tsx` cases migrate with the code they cover:
create-from-preset/duplicate → `new-config-form.test.tsx`; list/activate/
rename/delete/last-config gating/ACTIVE badge → `config-list.test.tsx`; knob
save → `config-editor.test.tsx`; tooltip-presence assertions split
accordingly. New cases: page header; hero renders Entry/Stop/Target for
`vwap_pullback` and omits them for an unknown key; accordion expand/collapse +
auto-expand on create; collapsed-row knob chips; "N off default" count;
default hints + changed-field highlight; Reset-to-defaults vs Revert
semantics; footer status text + disabled states; `KNOB_DEFAULTS`/
`offDefaultKeys` unit tests. Full frontend typecheck + vitest; backend
untouched (suite re-run as regression guard only).
