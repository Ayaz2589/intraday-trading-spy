# Feature Specification: Clickable Claude Experiments → Draft Configs

**Feature Branch**: `017-claude-experiment-drafts`

**Created**: 2026-06-05

**Status**: Draft

**Input**: User description: "In Claude's read, make the experiments-to-run
section clickable: clicking an experiment takes the operator to the Strategies
page and prefills a new strategy config they can review, create, and run.
Approved design: docs/superpowers/specs/2026-06-05-claude-experiment-drafts-design.md
(source of truth for decided architecture and the Constitution-II guardrails)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Experiments carry safe, structured knob suggestions (Priority: P1)

When Claude's read suggests an experiment that is expressible as changes to
existing strategy/risk knobs (e.g. "test a 2.5:1 risk-reward"), the stored
analysis carries those changes in structured form — knob path plus suggested
value — and the experiment card displays them plainly ("risk_reward → 2.5").
Suggestions are sanitized before storage against a registered whitelist of
tunable knobs and their bounds: anything off-list or out-of-bounds is removed,
and an experiment whose suggestions are all removed renders as plain text.

**Why this priority**: This is the trust foundation. Without sanitation
against the knob registry before storage, "Claude suggests config values"
becomes an unbounded write-adjacent surface; with it, every suggestion the
operator ever sees is known-valid. It also delivers standalone value: the
operator reads exact suggested values instead of prose.

**Independent Test**: Regenerate an analysis on the existing archive; inspect
the stored experiments — knob-expressible ones carry structured changes whose
paths are all on the whitelist and within bounds; the experiment cards render
the changes; a hand-built analysis with off-list/out-of-bounds suggestions is
stored with those suggestions stripped.

**Acceptance Scenarios**:

1. **Given** an analysis generation where an experiment is knob-expressible,
   **When** the analysis is stored, **Then** the experiment includes
   structured changes (knob path + value) and each path is on the registered
   whitelist with the value inside that knob's bounds.
2. **Given** a generation that proposes an off-whitelist path or an
   out-of-bounds value, **When** the analysis is stored, **Then** the
   offending suggestion is absent from the stored analysis, and an experiment
   left with no suggestions renders as text-only.
3. **Given** an experiment with surviving suggestions, **When** the card
   renders, **Then** each suggestion shows as "knob → value" in plain
   language alongside the hypothesis.
4. **Given** an analysis stored before this feature, **When** it renders,
   **Then** experiments appear exactly as before (text-only) with no errors.

---

### User Story 2 - One click drafts a config to review, create, and run (Priority: P2)

From an experiment card carrying suggestions, the operator clicks
"Draft config →" and lands on the Strategies page with the existing
create-config flow already open and pre-filled: the cited config as the base,
the suggested knob values applied and visually highlighted, a suggested unique
name, and a provenance note identifying the analysis and experiment it came
from. A clear badge states the draft came from Claude's experiment and must be
reviewed. The operator can edit anything, then create the config with the
standard action — and run a study on it like any other config. Dismissing the
form discards the draft entirely.

**Why this priority**: This is the requested capability — closing the loop
from advisory insight to operator action without manual transcription. It
depends on US1's sanitized suggestions.

**Independent Test**: Click "Draft config →" on an experiment with
suggestions; verify the Strategies page opens the create form pre-filled
(base, highlighted values, name, badge, provenance); edit a value; create;
confirm the config exists with provenance recorded and is runnable;
dismiss-without-creating leaves no trace.

**Acceptance Scenarios**:

1. **Given** an experiment with surviving suggestions, **When** the operator
   clicks "Draft config →", **Then** the Strategies page opens the existing
   create-config flow pre-filled with: base = the cited config, suggested
   values applied and highlighted, a suggested unique name, provenance in the
   description, and a "review before creating" badge.
2. **Given** the prefilled form, **When** the operator edits values and
   creates, **Then** the config is created through the same validation as a
   manual config, records its provenance, and can be used to launch a study.
3. **Given** the prefilled form, **When** the operator dismisses it,
   **Then** nothing is persisted and the page returns to its normal state.
4. **Given** the cited base config no longer exists, **When** the draft
   opens, **Then** the active config is used as the base and the operator is
   told about the substitution.
5. **Given** a malformed or hand-edited draft link, **When** the Strategies
   page loads, **Then** it shows a friendly notice and renders normally.

---

### User Story 3 - The boundary explains itself (Priority: P3)

The new concept teaches itself and keeps the advisory boundary explicit: the
draft badge and a help tooltip state that Claude only suggests — the operator
creates; nothing is ever created, activated, or run automatically. A created
config's provenance is visible wherever the config is inspected, so the
operator can always trace "where did this config come from?" back to the
exact analysis.

**Why this priority**: Constitution principle VI (educational UI) and the
guardrail framing that keeps the LLM correctly positioned as advisory
(principle II). Cheap, but it is what makes the feature trustworthy.

**Independent Test**: Sweep the new surfaces for tooltips; verify the badge
language; verify a drafted config's provenance is visible after creation.

**Acceptance Scenarios**:

1. **Given** the experiment card and the prefilled form, **When** they
   render, **Then** each carries a help tooltip explaining the draft concept
   and the advisory boundary (suggests ≠ creates).
2. **Given** a config created from a draft, **When** the operator inspects
   it, **Then** the provenance (which analysis, which experiment) is visible.

---

### Edge Cases

- Experiment proposes a mix of valid and invalid suggestions → only the valid
  ones survive; the card shows what survived.
- All suggestions for an experiment are stripped → text-only card, no button.
- Suggested name collides with an existing config → a unique variant is
  suggested automatically.
- Stored analyses from before this feature → render unchanged, no button.
- The experiments section is collapsed by default → the button appears when
  the section is expanded (no change to the disclosure pattern).
- Regeneration cost: the structured-suggestion change alters the analysis
  payload identity, so the first regeneration after release is a fresh
  provider call (disclosed; expected).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: An analysis experiment MAY carry structured suggested config
  changes, each naming a tunable knob and a suggested value; experiments not
  expressible as knob changes remain free text.
- **FR-002**: The system MUST maintain a single registered whitelist of
  tunable knobs with bounds, and MUST remove any suggested change whose knob
  is off-list or whose value is out of bounds BEFORE the analysis is stored.
  Stored analyses are therefore trustworthy as-is to every consumer.
- **FR-003**: Experiment cards MUST display surviving suggestions in plain
  "knob → value" form, and MUST offer a draft action only when at least one
  suggestion survives.
- **FR-004**: The draft action MUST carry the draft transiently (no
  persistence) to the Strategies page: base config = the analysis's cited
  config, falling back to the active config with an explicit notice if the
  cited config no longer exists.
- **FR-005**: The Strategies page MUST open its existing create-config flow
  pre-filled — base values with suggested changes applied and visually
  highlighted, a suggested unique name, provenance in the description — and
  badged as a Claude-drafted experiment requiring review.
- **FR-006**: Creation MUST occur only through the operator's explicit
  action via the standard create flow and its standard validation; the
  analysis pipeline MUST have no path that creates, modifies, activates, or
  runs anything (Constitution II). Dismissing the draft persists nothing.
- **FR-007**: A config created from a draft MUST durably record its
  provenance (the originating analysis and experiment) and that provenance
  MUST be visible when the config is inspected (Constitution VII).
- **FR-008**: Analyses stored before this feature MUST render unchanged
  (text-only experiments) with no errors; malformed draft links MUST degrade
  to a friendly notice on a normally-functioning page.
- **FR-009**: The new concepts (experiment draft, advisory boundary of the
  draft) MUST be explained via the established help-tooltip mechanism
  (Constitution VI).
- **FR-010**: The generation prompt MUST inform the model of the registered
  knobs and bounds and instruct it to express experiments as knob changes
  when possible — and the whitelist enforcement MUST NOT rely on the model
  following that instruction.

### Key Entities *(include if feature involves data)*

- **Suggested config change**: a knob path + suggested value attached to an
  experiment inside a stored analysis; only whitelist-valid changes are ever
  stored.
- **Knob whitelist**: the registered set of tunable knob paths with bounds —
  the single source of truth for what Claude may suggest and what a draft may
  prefill.
- **Draft (transient)**: the un-persisted payload carried from an experiment
  card to the Strategies create flow: base config reference, changes,
  originating analysis/experiment, suggested name.
- **Provenance note**: the durable record on a created config identifying
  the analysis and experiment it was drafted from.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From a knob-expressible experiment, the operator reaches a
  fully pre-filled create form in one click and can create and launch a study
  on the new config in under 2 minutes — transcribing zero values by hand.
- **SC-002**: 100% of suggestions that reach any user surface reference
  whitelisted knobs with in-bounds values (enforced before storage; verified
  by tests with adversarial fixtures).
- **SC-003**: Zero write operations originate from analysis generation:
  configs come into existence only via the operator's explicit create action
  (verifiable: no create/update calls in the generation path).
- **SC-004**: Every config created from a draft is traceable to its exact
  originating analysis and experiment from the config's own record.
- **SC-005**: All analyses stored before this feature render without error
  and without behavior change (text-only experiments).
- **SC-006**: On the live archive, a regenerated analysis yields at least
  one knob-expressible experiment with valid structured suggestions
  (qualitative live verification at e2e).

## Assumptions

- The whitelist seeds from the knobs already registered for sensitivity
  studies (risk-reward, VWAP distance, risk caps) — the same paths operators
  already sweep; extending it is a deliberate code change, not a UI action.
- The cited base config is resolvable by name from the analysis scope; the
  active config is an acceptable fallback when it is not.
- Changing the analysis output structure changes the stored-analysis identity,
  so the first regeneration after release is a fresh (paid) provider call —
  accepted and disclosed in the UI footer as usual.
- Name suggestions follow "<base>-exp-<n>" with uniqueness enforced by
  suffixing.
- The draft payload travels via navigation state only (e.g. the URL); it is
  never stored server-side, which is what makes "dismiss = no trace" true by
  construction.

## Out of Scope

- Auto-creating, auto-activating, or auto-running anything from analysis
  output (Constitution II — explicitly excluded).
- Experiments requiring new strategy code (e.g. "add a regime filter") —
  they remain text-only.
- Editing the knob whitelist from the UI.
- Backfilling structured suggestions into previously stored analyses.
- Batch-drafting multiple experiments at once.
