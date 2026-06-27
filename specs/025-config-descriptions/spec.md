# Feature Specification: Human-Readable Config Descriptions

**Feature Branch**: `025-config-descriptions`

**Created**: 2026-06-27

**Status**: Draft

**Input**: User description: "Make strategy config names more human-readable — auto-derive a plain-English description of what each config does from its parameters, shown everywhere configs are listed/selected. Auto-description only: no DB migration, no user editing."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Understand what a config does at a glance (Priority: P1)

A researcher opens the Strategies page and sees a list of strategy configs. Today the names are
cryptic, auto-generated tokens like `auto09-c3-buffer_pct0.2` or `auto11-c4-max_distance_from_vwap_pct1`,
which say nothing about how the config trades. With this feature, each config also shows a concise,
plain-English summary of its behaviour — derived automatically from the config's own parameters —
so the researcher can tell configs apart and recall what each one does without opening it.

**Why this priority**: This is the entire point of the feature and delivers value on its own. With
~29 configs (most auto-generated), the inability to distinguish them is the core pain. A read-only,
deterministic summary solves it immediately for every existing config with zero manual effort.

**Independent Test**: Load the Strategies page with the existing configs and confirm each row
displays a human-readable summary (e.g. "VWAP pullback · 0.2% stop buffer · ≤0.5% from VWAP ·
2:1 R:R · 15-min opening range · all-day entry") next to its technical name. Fully testable in
isolation; delivers the headline value by itself.

**Acceptance Scenarios**:

1. **Given** a config whose params set stop buffer 0.2%, max distance from VWAP 0.5%, risk:reward
   2.0, opening range 15 min, and entry window 0–390 min, **When** the researcher views it in any
   config list, **Then** a single-line human-readable summary naming those characteristics is shown
   alongside (not replacing) the technical name.
2. **Given** two configs that differ only in stop buffer, **When** the researcher views both,
   **Then** their summaries differ in the stop-buffer phrase, making the distinction visible.
3. **Given** the same config viewed twice, **When** its summary is generated each time, **Then** the
   summary text is identical (deterministic / recompute-identical).

---

### User Story 2 - Distinguish configs while selecting one to run (Priority: P2)

When a researcher is about to launch a backtest, study, or paper session, they pick a config from a
selector (the topbar strategy-config dropdown, or any config picker). The human-readable summary
appears in the selector so they choose the right config without memorising the cryptic token.

**Why this priority**: Selection is the second most common moment of confusion. It builds directly on
the US1 summary (same derived data, different surface), so it is valuable but secondary to simply
seeing the summaries in the list.

**Independent Test**: Open the topbar config selector and confirm each option shows its summary
(or the summary is shown for the highlighted/active config), in addition to the technical name.

**Acceptance Scenarios**:

1. **Given** the config selector is open, **When** the researcher reads an option, **Then** the
   option presents both the technical name and the human-readable summary.
2. **Given** a config is active, **When** the researcher views the selector trigger, **Then** the
   active config's summary is available (inline or via tooltip) without opening the menu.

---

### User Story 3 - Learn how the summary is produced (Priority: P3)

A researcher new to the app sees the summaries and wants to know what they mean and where they come
from. An educational help affordance explains: what the summary is, why it matters, and that it is
derived automatically from the config's parameters (not hand-written, not editable).

**Why this priority**: Required by the project's educational-UI principle, but the feature delivers
value without it. It is the smallest, last slice.

**Independent Test**: Locate the help affordance next to the summary on the Strategies page and
confirm it answers What / Why / How (derived from params).

**Acceptance Scenarios**:

1. **Given** the Strategies page, **When** the researcher activates the summary's help affordance,
   **Then** an explanation states the summary is auto-derived from the config's parameters and is
   not a stored or editable field.

---

### Edge Cases

- **Config missing some knobs**: The summary includes only the parameters present in the config and
  silently omits absent ones. It never errors on missing keys.
- **Config with empty/null params**: The summary degrades gracefully to a minimal label (at least
  the strategy family, e.g. "VWAP pullback") rather than an empty string or an error.
- **Unknown parameter present**: A parameter not in the known registry is ignored by the summary
  (no raw key dumped into user-facing text).
- **Entry window covering the whole session** (0–390 min): rendered as "all-day entry" rather than a
  noisy "0–390 min" phrase; a narrower window is rendered with its actual bounds.
- **Existing provenance text**: The auto-summary is separate from, and must never overwrite or
  display in place of, the config's existing free-text provenance description.
- **Very long summary**: The summary stays concise (a bounded set of the most salient parameters) so
  it remains readable in a list row.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST derive a concise, human-readable summary of each config's behaviour
  purely from that config's parameters, requiring no manual input.
- **FR-002**: The summary derivation MUST be deterministic — the same parameters always produce the
  exact same summary text (recompute-identical).
- **FR-003**: The system MUST expose, for each config, both (a) a compact one-line summary string and
  (b) a structured, ordered list of human-readable {label, value} highlights, so the presentation
  layer can render either a single line or a chip/stat layout.
- **FR-004**: Each parameter's human-readable label and unit MUST come from the established knob
  vocabulary already used elsewhere in the app (so labels stay consistent across the product) rather
  than being reinvented.
- **FR-005**: The summary MUST be presented alongside — never replacing — the config's technical
  name, because the technical name remains the durable identifier referenced by runs and studies.
- **FR-006**: The human-readable summary MUST appear on the Strategies page config list and in the
  config selector(s) used to choose a config to run.
- **FR-007**: The system MUST handle configs with missing, partial, empty, or unknown parameters
  gracefully — omitting absent items and never producing an error or a raw parameter key.
- **FR-008**: The feature MUST NOT read, write, alter, or display the config's existing free-text
  provenance description field; the auto-summary is an independent, derived value.
- **FR-009**: The feature MUST require no database schema change and MUST store nothing new — the
  summary is computed at read time from existing config parameters.
- **FR-010**: The Strategies page MUST include an educational help affordance explaining what the
  summary is, why it matters, and that it is auto-derived from the config's parameters.
- **FR-011**: The summary MUST cover the v1 vwap_pullback strategy's salient knobs: stop buffer,
  max distance from VWAP, risk:reward target, opening-range minutes, and entry window — and identify
  the strategy family.
- **FR-012**: The summary MUST express each parameter in human terms (e.g. percentages with units,
  a "2:1 R:R" ratio, an entry window as "all-day" or an explicit minute range) rather than raw
  numeric param values without context.

### Key Entities *(include if feature involves data)*

- **Config Summary**: A derived (not stored) representation of a single config's behaviour. Has a
  one-line `summary` string and an ordered list of `highlights`, each a {label, value} pair. Computed
  from the config's parameters and the shared knob vocabulary. Lifetime: per read; never persisted.
- **Config** (existing): The strategy configuration with a technical `name`, a `params` object, and a
  separate free-text provenance `description`. This feature reads `params` only and leaves `name` and
  `description` untouched.
- **Knob Vocabulary** (existing): The established mapping from each parameter to its human-readable
  label and units, reused as the source of truth for summary wording.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of existing configs display a non-empty human-readable summary on the Strategies
  page (no config shows only its cryptic token).
- **SC-002**: Given two configs that differ in at least one summarised parameter, their summaries
  differ — a viewer can distinguish any two materially-different configs by summary alone.
- **SC-003**: Generating a config's summary twice yields byte-identical text (deterministic).
- **SC-004**: A researcher can identify what a previously-unseen config does, from its summary alone,
  without opening the config's parameter editor.
- **SC-005**: No config's stored data changes as a result of viewing summaries (the feature is purely
  read-only; provenance and all other fields are byte-identical before and after).
- **SC-006**: A config with missing or empty parameters still renders a summary (at minimum the
  strategy family) and never produces an error.

## Assumptions

- **Scope is auto-description only**: No editable display name, no new database column, no migration,
  and no user-authored labels — confirmed with the requester. A future feature could add an editable
  override.
- **Single strategy in v1**: The only strategy is vwap_pullback; the summary vocabulary targets its
  knobs. Additional strategies would extend the same derivation pattern later.
- **Knob vocabulary is the wording source**: The existing knob registry already carries human labels
  and units suitable for user-facing text; the summary reuses them for consistency.
- **Technical name stays**: The cryptic technical name remains visible everywhere as the durable
  identifier; the summary augments, not replaces, it.
- **Salient-subset, not exhaustive**: The summary highlights the strategy-defining knobs (entry,
  stop, target, opening range, entry window) rather than every risk-management parameter, to stay
  concise and readable in a list.
- **Read-time computation is acceptable**: Deriving the summary on each read (rather than caching it)
  is performant enough given the small number of configs per user.
