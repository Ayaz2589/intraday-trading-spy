# Validation page redesign — Data-page design language

**Date:** 2026-06-04 · **Status:** approved · **Branch:** `redesign/validation-page`
**Scope (user-confirmed):** the main `/validation` route only — the study DETAIL
page (walk-forward table / sensitivity surface) gets its own follow-up pass.
One small backend addition (user-approved): expose `config_name` on the studies
list/detail views so rows can show which config was tested.

## Layout (top to bottom)

1. **Header** — "Validation" + subtitle "Walk-forward, sensitivity & the
   one-shot lockbox — research without self-deception".
2. **ValidationStatCards** — STUDIES (total, kind breakdown subtitle) ·
   FINISHED (green) · FAILED (red when >0) · LOCKBOX (state-colored:
   unspent green "you get one shot" / spent / burned red).
3. **StartStudyCard** — kind as CHIPS (Walk-forward · Sensitivity; replaces the
   <select>), config picker (pre-selects the ACTIVE config — SC-007 semantics
   preserved) + "Manage configs →" link to /strategies, sensitivity-only knob +
   values inputs, Launch button, "N evaluations planned" feedback. While the
   launched study runs: prominent animated status panel (spinner + "Running
   <kind> on <config>…" + % + progress bar + evaluations x/y) driven by the
   existing per-study status polling. Finished: green "✓ Study complete ·
   View results →" — persists until × (the natural next action is viewing).
   Failed: red + reason, persists until ×.
4. **StudiesTable** — stats row (TOTAL · FINISHED · FAILED · EVALUATIONS =
   Σ progress_completed) + table STARTED · KIND (chip) · CONFIG (mono) ·
   PROGRESS (mini bar + x/y) · STATUS (pill). Every row expands (chevron) to a
   detail grid: study id, created, kind, config, progress, RESULT SUMMARY
   (walk-forward: "OOS <mean_oos.expectancy_dollars>/trade · gap
   <mean_gap.expectancy_r>R" from the result JSON; sensitivity: metric name +
   point count), failure reason when failed, and "Open full results →" (the
   existing detail route). List gently polls while any study is non-terminal.
5. **LockboxCard** — absorbs LockboxGate + the candidate-config picker (moves
   inside the card): big state banner, held-out window, one-shot run /
   override-and-burn flows untouched; `lockbox-state` testid preserved.

## Backend addition (the only one)

`ValidationStudyView.config_name: str | None` — lifted from the stored study
`params.config_name` via a before-validator (rows already carry `params`;
list + single-study endpoints both benefit). One endpoint test.

## Carried-over principles

Decompose per card (route = thin composer); hand-rolled visuals, no new deps;
sections fail independently with section-scoped error text; empty states kept;
all existing tooltips stay (walk_forward, parameter_sensitivity, lockbox,
burned_lockbox — no new concepts, no new help keys); constitution VI respected.

## Testing

Backend: studies-list endpoint test for config_name. Frontend: port
start-study-dialog tests into StartStudyCard (same launch payloads; kind via
chips; active-config pre-selection kept), new tests for stat cards, status
panel states (spinner running / persists on finish with results link / failure
+ reason), expandable study rows + result-summary extraction + config column,
lockbox testids. Full typecheck + vitest + backend suite before merge.
