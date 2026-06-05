# Feature Specification: Recommendation Engine — Config Health + Evidence-Backed Suggestions

**Feature Branch**: `018-recommendation-engine`

**Created**: 2026-06-05

**Status**: Draft

**Input**: User description: "Recommendation engine (feature 018):
evidence-backed config recommendations when the selected config is not
performing. A deterministic backend engine plus an advisory Claude layer,
closing the 016/017 loop. Core pieces: (1) config health monitor —
deterministic, seeded, cited rolling OOS verdict per config (ok / degrading /
failing), never LLM-derived; (2) evidence pack builder mining what the system
already persists — sensitivity plateaus (011), matched-window config
comparisons via spec-hash-deduped child runs (014), regime bleed, pooled-gate
CIs (016); (3) deterministic candidate ranking of whitelisted knob deltas
(017 registry); (4) Claude advisory layer with scope='recommend' — cited,
sanitized, snapshot-pinned, billing-pause aware, strictly advisory; (5)
actuation reuses 017's human-gated Draft config → flow, validated by
walk-forward + pooled gate; (6) health badge on Strategies, Recommendations
panel on Insights. Governance: advisory-only and human-gated throughout; the
engine must be able to recommend 'stop tuning this knob family'; no new
strategy code generation; data-snooping honesty — surface trial counts
against the same OOS archive; the lockbox stays sealed as final arbiter."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The operator sees an honest health verdict per config (Priority: P1)

For every config with out-of-sample history, the operator sees a health
verdict — **ok / degrading / failing / insufficient evidence** — computed
deterministically from the OOS archive the app already holds: how the
config's recent validation windows compare to its archive baseline, the
status of its latest pooled gate, and whether enough windows exist to say
anything at all. The verdict ships with its supporting numbers (the cited
inputs that produced it), is identical on every recomputation against the
same archive, and never involves a language model. It surfaces as a badge on
the active config on the Strategies page and per-config in a new
Recommendations panel on the Insights page.

**Why this priority**: This is the trigger for everything else and delivers
standalone value: "is my selected config still earning its keep?" is the
question the operator currently answers by manually cross-referencing
studies. An honest, reproducible verdict — including the humility state
"insufficient evidence" — is useful even if no recommendation is ever
generated.

**Independent Test**: Seed the archive with a config whose recent OOS windows
clearly underperform its baseline plus a failed pooled gate; the verdict
reads failing with the comparison numbers displayed. Recompute: the verdict
and every cited number are byte-identical. A config with fewer windows than
the published evidence floor reads insufficient evidence and offers no
judgment.

**Acceptance Scenarios**:

1. **Given** a config whose recent OOS windows underperform its archive
   baseline beyond the published margin, **When** health is computed,
   **Then** the verdict is degrading (or failing if its latest pooled gate
   also failed) and the comparison values are displayed beside it.
2. **Given** a config whose recent windows track its baseline and whose gate
   passed, **When** health is computed, **Then** the verdict is ok.
3. **Given** a config with fewer OOS windows than the evidence floor,
   **When** health is computed, **Then** the verdict is insufficient
   evidence and no degrading/failing judgment is rendered.
4. **Given** an unchanged OOS archive, **When** health is recomputed at any
   time, **Then** the verdict and all cited inputs are identical.
5. **Given** the active config on the Strategies page, **When** the page
   renders, **Then** its health badge is visible with a tooltip explaining
   what the verdict means and how it is computed.

---

### User Story 2 - Evidence-backed recommendations the operator can act on (Priority: P2)

For a config that is not ok (or on demand for any config with sufficient
evidence), the operator generates recommendations. The system first
assembles an evidence pack purely from artifacts it already persists:
parameter-sensitivity plateaus versus peaks from past sweeps, matched-window
comparisons against other configs (same validation windows, different
knobs), per-regime bleed, and pooled-gate confidence intervals. From that
pack it derives a deterministic, ranked list of candidate knob changes — every
path and value inside the registered whitelist and bounds — plus, where the
evidence supports neither tweak nor hope, the explicit recommendation classes
**gather more evidence** (e.g. "no sensitivity sweep exists for this knob —
run one") and **stop tuning** ("no setting in this family shows deployable
edge; consider a different registered strategy"). The advisory layer then
narrates the ranked candidates with cited claims, in the same
snapshot-pinned, billing-pause-aware contract as existing analyses. Each
recommendation renders as a card with knob-delta chips and the existing
"Draft config →" human-gated action; candidates whose knob set matches an
already-tried config are flagged as already tried with a link to that
config's evidence instead of being re-suggested. The deterministic content —
verdict, ranked candidates, citations — renders fully even when the advisory
layer is unconfigured or paused.

**Why this priority**: This is the feature's namesake value — turning the
archive's accumulated learnings into concrete, safe next steps — but it
depends on US1's trigger and is worthless without the honesty machinery
around it.

**Independent Test**: On an archive containing sensitivity sweeps and two
configs sharing validation windows, generate recommendations for the failing
config: ranked candidates appear with on-whitelist knob deltas, each
citing the evidence that ranked it; one candidate matching an existing
config's knobs is flagged already-tried; with the advisory layer paused the
same candidates render without narrative; clicking Draft config → lands on
the Strategies create flow prefilled, and nothing is created without the
operator's explicit action.

**Acceptance Scenarios**:

1. **Given** a failing config and a populated archive, **When**
   recommendations are generated, **Then** a ranked candidate list renders
   in which every knob path is on the registered whitelist, every value is
   in bounds, and every candidate displays at least one cited evidence value
   resolvable against the app's own data.
2. **Given** a candidate whose knob set equals an existing config's,
   **When** the list renders, **Then** that candidate is marked already
   tried and links to the existing config's evidence rather than offering a
   draft.
3. **Given** an archive in which every tried setting's gate includes zero,
   **When** recommendations are generated, **Then** a stop-tuning
   recommendation is present and states that no setting in the family has
   shown deployable edge.
4. **Given** a knob with no sensitivity evidence, **When** that knob would
   otherwise be a candidate, **Then** the system recommends gathering
   evidence (running the missing study) instead of asserting a delta.
5. **Given** the advisory layer is unconfigured or paused, **When** the
   panel renders, **Then** the health verdict and ranked candidates render
   fully and only the narrative is absent.
6. **Given** a recommendation card, **When** the operator clicks
   Draft config →, **Then** the existing human-gated draft flow opens
   prefilled and no config is created or run triggered without explicit
   operator action; a config created from it carries provenance.
7. **Given** the OOS archive has changed since recommendations were
   generated, **When** the panel renders, **Then** the recommendations are
   marked stale and can be regenerated; regenerating against an unchanged
   archive reproduces identical candidates and rankings.

---

### User Story 3 - The data-snooping ledger keeps the loop honest (Priority: P3)

The Recommendations panel surfaces how many recommendation-originated
variants have already been tried against the current OOS archive for this
config family, alongside a plain-language warning that repeatedly tuning
against the same out-of-sample data erodes its meaning. The trial count is
part of the evidence pack itself, so the advisory narrative can reason about
it ("this is the 9th variant against this archive — discount accordingly").
The lockbox is never consumed, cited, or recommended for use by this
feature; it remains the final arbiter outside the loop.

**Why this priority**: A recommendation engine is a machine for running many
trials against the same archive — exactly how out-of-sample quietly becomes
in-sample. Without a visible trial ledger the feature would make the
system's honesty worse, not better. It is P3 only because it depends on the
other two stories existing.

**Independent Test**: Create several configs through the draft flow from
recommendations, run their studies, and reopen the panel: the trial count
reflects them, the warning renders, the count appears in the evidence pack
of the next generation, and no surface of the feature reads or references
lockbox data.

**Acceptance Scenarios**:

1. **Given** N configs created from recommendations and validated against
   the current archive, **When** the panel renders, **Then** the trial
   count for the family reads N with an explanation of why it matters.
2. **Given** a new recommendation generation, **When** the evidence pack is
   assembled, **Then** it includes the family's trial count.
3. **Given** any recommendation surface, **When** inspected, **Then** no
   lockbox segment data is read, displayed, or suggested for use.

---

### Edge Cases

- A config with zero OOS windows (never studied): insufficient evidence —
  the panel offers exactly one suggestion: run a walk-forward study.
- Every config in the system is ok: the panel says so plainly and the
  operator can still generate recommendations on demand for curiosity.
- The evidence pack is thin (no sensitivity sweeps anywhere, single config,
  no matched windows): candidates degrade gracefully to
  gather-more-evidence recommendations citing what is missing — never
  knob deltas asserted without evidence.
- Stop-tuning fires while only one strategy is registered: the
  recommendation states there is no registered alternative yet rather than
  inventing one (no new strategy code in v1).
- The archive changes mid-session (a study completes): previously rendered
  recommendations show the stale marker on next render, mirroring existing
  snapshot-pin behavior.
- Two configs share a name across strategies or a config was deleted after
  being tried: trial ledger counts attach to the underlying family identity,
  not the display name, and survive config deletion.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST compute, for any config with OOS history, a
  health verdict in {ok, degrading, failing, insufficient evidence} as a
  pure, seeded, reproducible function of the persisted OOS archive (recent
  windows vs archive baseline, latest pooled-gate status, evidence floor) —
  identical output for identical archive state, never derived from a
  language model.
- **FR-002**: Every health verdict MUST ship with its cited inputs (the
  numbers that produced it), displayed wherever the verdict is shown.
- **FR-003**: The thresholds defining the verdict (recent-window count,
  degradation margin, evidence floor) MUST be published configuration
  values, not hardcoded constants.
- **FR-004**: The health verdict MUST surface as a badge on the active
  config on the Strategies page and per-config in a Recommendations panel
  on the Insights page.
- **FR-005**: The evidence pack MUST be assembled exclusively from already
  persisted artifacts — sensitivity results, study child runs (matched by
  validation window), pooled-gate results, regime labels, and the trial
  ledger — and its assembly MUST NOT execute new backtests.
- **FR-006**: Candidate generation MUST be deterministic and emit only knob
  deltas whose paths are on the registered whitelist and whose values are
  within bounds; candidates whose knob set matches an existing config MUST
  be flagged as already tried with a reference to that config instead of
  being offered as a draft.
- **FR-007**: The engine MUST support three recommendation classes — knob
  delta, gather more evidence, and stop tuning — and MUST emit stop-tuning
  when no tried setting in the family shows deployable edge, and
  gather-more-evidence when candidates would otherwise rest on missing
  evidence.
- **FR-008**: The advisory layer MUST reuse the existing analysis contract
  for a recommendation scope: every claim cites an evidence value resolvable
  against the pack, suggested changes are sanitized against the same
  whitelist before storage, analyses are snapshot-pinned to the archive
  state, and the billing pause applies. Stored recommendations MUST render
  read-only while paused.
- **FR-009**: All deterministic content (verdicts, ranked candidates,
  citations, trial counts) MUST render fully when the advisory layer is
  unconfigured or paused; only the narrative may be absent.
- **FR-010**: Recommendation surfaces MUST NOT create configs, modify
  configs, or trigger runs; the only actuation path is the existing
  human-gated draft flow, and configs created from recommendations MUST
  carry durable provenance.
- **FR-011**: The system MUST maintain a per-family trial ledger counting
  recommendation-originated variants tried against the current OOS archive,
  surface it on the panel with an explanation of data-snooping risk, and
  include it in the evidence pack.
- **FR-012**: No recommendation surface may read, display, or suggest
  consuming lockbox data.
- **FR-013**: The UI MUST visibly distinguish seeded/deterministic content
  from advisory narrative, consistent with the existing determinism-split
  presentation.
- **FR-014**: Each new concept (health verdict, recommendation classes,
  evidence pack, trial count / data snooping) MUST ship with an explanatory
  tooltip answering what it is, why it matters, and how the app uses it.

### Key Entities *(include if feature involves data)*

- **Health Verdict**: a config's OOS health state (ok / degrading / failing
  / insufficient evidence) plus the cited inputs and threshold values that
  produced it; reproducible from archive state.
- **Evidence Pack**: the assembled deterministic inputs for one
  recommendation generation — sensitivity plateau/peak summaries,
  matched-window config comparisons, regime bleed, gate CIs, trial count —
  pinned to an archive snapshot.
- **Recommendation**: one ranked suggestion of class knob-delta /
  gather-more-evidence / stop-tuning, carrying cited evidence values, and
  for knob deltas the whitelisted path/value pairs and any already-tried
  flag.
- **Recommendation Analysis**: the stored advisory narrative over an
  evidence pack (scope: recommend), snapshot-pinned, with sanitized
  suggestions — same lifecycle as existing analyses.
- **Trial Ledger Entry**: a record attributing a created config / completed
  study to recommendation provenance within a config family against an
  archive snapshot; survives config deletion.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For any config with OOS history, the operator can read its
  health verdict and the numbers behind it in a single page visit — no
  manual cross-referencing of studies.
- **SC-002**: Recomputing health or regenerating candidates against an
  unchanged archive reproduces identical verdicts, candidates, and rankings
  — 100% of the time.
- **SC-003**: 100% of stored knob suggestions (deterministic and advisory)
  are on-whitelist and in-bounds; every displayed recommendation shows at
  least one cited value resolvable to the app's own data.
- **SC-004**: Zero configs created or runs triggered by the feature without
  explicit operator action; 100% of recommendation-originated configs carry
  provenance.
- **SC-005**: With the advisory layer disabled, the operator can still see
  verdicts and ranked candidates for every eligible config (deterministic
  core fully functional).
- **SC-006**: On an archive where every tried setting fails its gate, a
  stop-tuning recommendation is present in 100% of generations for that
  family.
- **SC-007**: The operator can go from seeing a failing verdict to a
  prefilled draft config for the top candidate in under 2 minutes, without
  leaving the app.

## Assumptions

- Verdict thresholds (recent-window count K, degradation margin, evidence
  floor) get concrete values at planning time and live in configuration per
  the engineering standards; the spec fixes their existence and semantics,
  not their values.
- "Config family" means configs belonging to the same registered strategy;
  the trial ledger counts at that granularity and attaches to identity, not
  display name.
- Recommendations may be generated on demand for any config with sufficient
  evidence (health gates emphasis, not permission).
- Health is computed on demand when its surfaces load; background/scheduled
  monitoring is not part of this feature.
- The existing analysis settings (single billing-pause switch, snapshot
  pinning, citation rendering) extend to the recommendation scope unchanged.
- Evidence sources are limited to artifacts persisted by features 011, 014,
  and 016 plus the new trial ledger; where an artifact class is absent the
  engine degrades to gather-more-evidence rather than inferring.
- Only registered strategies may be referenced as alternatives in
  stop-tuning recommendations; today that set has one member, so the
  recommendation may state that no alternative exists yet.

## Out of Scope

- Auto-applying recommendations, auto-creating configs, or auto-running
  studies — every actuation remains human-gated.
- Generating or modifying strategy logic/code; ML-based recommendation
  models (v1 constitution: rule-based, no ML).
- Opening, reading, or budgeting the lockbox.
- Scheduled or background health monitoring, alerting, or notifications.
- Triggering new backtests to score candidates — rankings are hypotheses for
  the existing validation machinery, not results.
- Live-trading readiness signals of any kind (paper-first stands).
