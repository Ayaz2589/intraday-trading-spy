# Feature Specification: Entry-Window Filter Knobs

**Feature Branch**: `020-entry-window`

**Created**: 2026-06-07

**Status**: Draft

**Input**: User description: "Entry-window filter knobs: restrict VWAP-pullback entries to a configurable intraday window (minutes after open), registry-whitelisted so sweeps and campaigns can search the window honestly; skipped setups journaled; default preserves current behavior."

**Evidence motivating this feature** (diagnostic pass, 2026-06-07, full
train-segment archive): the VWAP-pullback's entire net loss is concentrated
in entries taken during the first ~15 minutes after the opening range
completes (651 trades, −125.9R, 29% win rate), while entries between 10:00
and 14:00 ET are net positive (+60R, 37–41% win rate) — consistently across
all five training years. No existing config knob can express "don't trade
the chaotic open"; the three signal-shaping sweeps confirmed no other knob
rescues the always-on strategy. This feature adds the missing dimension so
the validation machinery — not the diagnostic slice — can judge the
hypothesis honestly.

## Clarifications

### Session 2026-06-07

- Q: How should the window be expressed? → A: Minutes after the session
  open (numeric, sweepable), not wall-clock strings — numeric knobs flow
  through the existing whitelist sanitation, bounds checks, sensitivity
  grids, and campaign candidates unchanged. (Recommended option applied —
  operator pre-authorized recommendations.)
- Q: Where is the filter enforced? → A: In the strategy's setup detection —
  outside the window the strategy does not emit a candidate signal, and the
  skipped setup is journaled with an explicit reason. The risk manager's
  independent cutoffs (no-new-trades, force-flat) are untouched and still
  bind. (Recommended: the window is signal logic, like "wait for the opening
  range"; the risk veto remains the safety net, not a research knob's home.)
- Q: What are the defaults? → A: `start_minutes_after_open = 0`,
  `end_minutes_after_open = 390` — equivalent to today's behavior. (As
  clarified this was 360; implementation's golden rejection-breakdown test
  revealed 360 silently re-classifies post-15:30 risk-manager REJECTIONS as
  window skips — not byte-identical. 390 is inert: the no-new-trades cutoff
  keeps governing, exactly as before. Recommended option's intent —
  backward compatibility is non-negotiable — preserved by correcting the
  number, 2026-06-07.)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Constrain when the strategy may enter (Priority: P1)

As the operator, I can set an entry window on any config — earliest and
latest entry time, expressed as minutes after the 09:30 ET open — and the
strategy will only generate entry signals inside that window. Setups that
form outside the window are recorded as skipped (with the reason), because
skipped setups are learning artifacts. A config without an explicit window
behaves exactly as today.

**Why this priority**: This is the feature — the knob the evidence asked
for. Everything else (registry, UI, sweeps) hangs off it.

**Independent Test**: Run the same fixture backtest twice — once with
defaults (identical trades to the pre-feature baseline) and once with a
10:00–14:00 window (no trades entered before 10:00 or after 14:00 ET;
journal contains skipped-setup entries for the filtered signals).

**Acceptance Scenarios**:

1. **Given** a config with `start_minutes_after_open = 30`, **When** a valid
   pullback setup forms 20 minutes after the open, **Then** no signal is
   emitted and a skipped-setup journal entry records the window as the
   reason.
2. **Given** a config with `end_minutes_after_open = 270`, **When** a valid
   setup forms at 14:05 ET (275 minutes), **Then** no signal is emitted and
   the skip is journaled.
3. **Given** default window values, **When** the fixture backtest runs,
   **Then** trades, P&L, and journal are identical to the pre-feature
   baseline.
4. **Given** a window narrower than the opening range (e.g. start 5 with a
   15-minute opening range), **When** the backtest runs, **Then** the
   opening-range rule still governs — entries cannot begin before the range
   completes regardless of the window.
5. **Given** a window end later than the existing no-new-trades cutoff,
   **When** the backtest runs, **Then** the risk manager's cutoff still
   binds — the window can only narrow trading, never extend it.

---

### User Story 2 - Search the window honestly (Priority: P2)

As the operator (or a campaign acting for me), I can sweep the entry-window
knobs through sensitivity studies and have the recommendation engine and
campaigns treat them like any other whitelisted knob: candidates referencing
them pass sanitation, sweeps accept them by path or leaf, and the tightened
bar applies to window-knob families exactly as to existing families.

**Why this priority**: The window is a *hypothesis*, not a result — the
whole point is to let the existing honesty machinery judge it. Without
registry membership the knob can't be searched, recommended, or
campaign-tried.

**Independent Test**: `study-sens --knob start_minutes_after_open --values
0,15,30,45` launches a four-point sweep from the CLI; the sensitivity
surface persists; the recommendation engine can emit (and sanitize)
candidates that change the window knobs.

**Acceptance Scenarios**:

1. **Given** the CLI, **When** a sweep names the knob by leaf or dotted
   path, **Then** it validates and runs like any registry knob.
2. **Given** a model- or engine-suggested change to a window knob with an
   out-of-bounds value (e.g. 500 minutes), **Then** sanitation drops it
   before storage, like any other whitelisted knob.
3. **Given** a campaign whose recommendation engine ranks a window-knob
   delta, **When** the campaign acts on it, **Then** the draft config,
   trial-ledger row (family = the window knob path), and tightened bar all
   behave exactly as for existing knob families.

---

### User Story 3 - See and edit the window in the UI (Priority: P3)

As the operator, the config editor shows the two window knobs alongside the
other signal knobs — with defaults, off-default highlighting, and the "N off
default" chips — and a new educational tooltip explains what the entry
window is, why it matters (the open-chaos evidence), and how the app uses
it. Config rows' diff chips surface an off-default window at a glance.

**Why this priority**: Editing/visibility polish on top of US1; the CLI and
campaigns can already exercise the knobs without it.

**Independent Test**: Open a config in the editor — two new fields appear
under Signal with "default 0 / default 360" hints; setting 30/270 marks them
changed, saves into the config's params, and the config row shows the
off-default chips.

**Acceptance Scenarios**:

1. **Given** the config editor, **When** it renders, **Then** the two window
   fields appear in the Signal group with their defaults and the
   entry-window tooltip.
2. **Given** a saved config with a non-default window, **When** the configs
   list renders, **Then** the row's diff chips include the changed window
   knobs (accent), and "N off default" counts them.
3. **Given** the docs glossary, **When** it renders, **Then** the
   entry-window concept appears with the standard what/why/how explanation.

---

### Edge Cases

- Window start ≥ window end (e.g. start 300, end 240): the config is
  rejected at validation time with a clear message — an empty window is a
  configuration error, not a silent no-trade run.
- Window start before the opening range completes: allowed; the effective
  start is the later of (range completion, window start) — scenario 4.
- Window end after the no-new-trades cutoff: allowed; the cutoff still
  binds — the window never extends trading (scenario 5).
- Pre-feature configs (params without the window keys): load with the
  defaults — identical behavior, no migration of stored params needed.
- A position open when the window closes: the window governs *entries
  only* — exits, stops, targets, and force-flat behave exactly as today.
- Out-of-bounds sweep values (negative, > 390): rejected by the CLI locally
  and by sanitation server-side, like any registry knob.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The strategy configuration MUST accept two new knobs —
  `start_minutes_after_open` and `end_minutes_after_open` (integers, minutes
  after the 09:30 ET session open) — under the VWAP-pullback strategy's
  params, with defaults (0, 390) that reproduce current behavior exactly
  (byte-identical journals — see the Clarifications correction).
- **FR-002**: The strategy MUST NOT emit an entry signal whose bar falls
  outside the configured window. The effective window is
  `[max(opening-range completion, start), min(no-new-trades cutoff, end)]` —
  the window can only narrow trading, never extend it past existing safety
  cutoffs.
- **FR-003**: Every setup suppressed by the window MUST be journaled as a
  skipped setup with an explicit window reason (skipped setups are
  first-class learning artifacts — constitution VII).
- **FR-004**: A config whose window is empty (start ≥ end) MUST be rejected
  at validation time with a message naming both values.
- **FR-005**: Both knobs MUST join the whitelisted knob registry with bounds
  [0, 390] minutes (int), so sanitation, prompts, sweeps (path or unique
  leaf), recommendation candidates, draft configs, and campaign families
  treat them identically to existing knobs.
- **FR-006**: All time logic MUST derive from the existing session clock
  (`America/New_York`; the single source of truth) — no new hand-rolled
  time arithmetic.
- **FR-007**: The config editor MUST show both knobs in the Signal group
  with default hints, changed-from-default highlighting, and save them into
  the config's stored params; config-row diff chips and the "N off default"
  count MUST include them.
- **FR-008**: The new concept MUST ship an educational tooltip (what the
  entry window is, why the open-chaos evidence motivates it, how the app
  uses it), appearing in the editor and the docs glossary.
- **FR-009**: The frontend sensitivity launcher MUST offer both knobs as
  toggle pills with sensible default grids that straddle the config default
  (e.g. start: 0/15/30/45; end: 240/270/300/360).
- **FR-010**: Existing stored configs, presets, studies, and baselines MUST
  be unaffected: params lacking the window keys load as the defaults, and a
  default-window backtest produces byte-identical trades to the pre-feature
  engine.

### Key Entities

- **Entry window**: per-config pair (start, end) in minutes after open;
  part of the strategy's params (no new storage — lives in the existing
  config params JSON like every knob).
- **Skipped setup (window)**: a journal event recording a setup that formed
  outside the window — timestamp, bar, window values, reason.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A fixture backtest with default window values produces
  byte-identical trades and journal to the pre-feature baseline (regression
  gate).
- **SC-002**: A backtest with a 30→270 window contains zero entries before
  10:00 or after 14:00 ET, and every suppressed setup appears in the journal
  with the window reason.
- **SC-003**: `study-sens` accepts both knobs by leaf and dotted path and
  completes a four-point sweep end to end (the same flow that judged the
  other knobs).
- **SC-004**: An engine- or model-suggested window value outside [0, 390] is
  dropped by sanitation before storage, verified by test.
- **SC-005**: The config editor round-trips the knobs (edit → save → reload
  → same values) and flags off-default values; the docs glossary lists the
  new concept.
- **SC-006**: A campaign acting on a window-knob candidate produces a draft
  config + trial-ledger row whose family is the window knob path, gated at
  the tightened bar — indistinguishable in mechanics from existing families.

## Assumptions

- Minutes-after-open is measured from the regular session open (09:30 ET)
  on every trading day; half-days are out of scope for v1 (the existing
  engine already treats sessions uniformly).
- The window applies to the VWAP-pullback strategy's entries only — it is a
  strategy knob, not a market-wide setting; future strategies define their
  own.
- Bounds [0, 390] cover the full regular session (390 minutes = 16:00 ET);
  values beyond the no-new-trades cutoff are legal but inert (scenario 5).
- No database migration: the knobs live inside the existing config params
  JSON; the knob registry is code.
- The diagnostic's specific window (30→270) is NOT baked in as a default or
  recommendation — it is a hypothesis the operator (or a campaign) must
  test through the validation machinery.
