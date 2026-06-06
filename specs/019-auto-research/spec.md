# Feature Specification: Automated Strategy Research

**Feature Branch**: `019-auto-research`

**Created**: 2026-06-06

**Status**: Draft

**Input**: User description: "Automated strategy research: authenticated research CLI for every pipeline step, a server-side auto-research loop with honest stopping rules, and a dashboard panel to launch and monitor it. The loop goes through the full flow (data freshness → walk-forward → pooled gate → recommendations → next candidate) until it finds an effective strategy or honestly concludes there is none — and it never spends the lockbox itself."

## Clarifications

### Session 2026-06-06

- Q: How should the research CLI establish the operator's session on first run? → A: One-time email-code sign-in (the same OTP path the web app uses); the session is persisted locally and auto-renewed.
- Q: When a campaign finds the bar cache stale or empty, what should it do? → A: Auto-backfill as the first step of the cycle (full span if empty, incremental if stale); halt with failed(no-data) only if the backfill itself fails.
- Q: Where should the campaign launch/monitor surface live? → A: An Auto-research section on the Validation page (alongside studies and the lockbox), with a per-campaign drill-down detail page; no new navigation item.
- Q: How should the trial budget be scoped? → A: Per campaign — one cap on total candidates tried; family-level honesty comes from the trial-count-tightened bar and the engine's stop-tuning verdict, not per-family sub-budgets.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Run the whole research pipeline from the terminal (Priority: P1)

As the operator, I can perform every step of the research pipeline from my
terminal with one command per step — refresh market data, launch a
walk-forward or sensitivity study, watch a study's progress, compute the
pooled gate verdict, run significance or Monte Carlo path-risk for a run,
check or (deliberately) spend the lockbox, and pull the recommendation
engine's health verdicts, evidence pack, and ranked candidates — without
opening the browser. Each command acts as *me* (the same identity the web
app uses), so everything it creates shows up in the UI exactly as if I had
clicked it.

**Why this priority**: It is the foundation the automation is built on —
every loop cycle is a composition of these steps — and it is independently
valuable on day one (terminal-driven research, scripting, future CI).
Shipping it first also forces the one genuinely new problem (acting as the
authenticated operator from outside the browser) to be solved before
anything depends on it.

**Independent Test**: With the application services running and an empty or
populated research archive, an operator completes a full manual pass —
data refresh → walk-forward study → pooled gate → recommendations — using
only terminal commands, and every artifact (study, runs, gate verdict)
is visible in the web UI afterwards.

**Acceptance Scenarios**:

1. **Given** the operator has completed the one-time sign-in, **When** they
   issue the walk-forward study command for a named config, **Then** a study
   starts, its id is printed, and a status command reports progress until
   completion — identical to a study launched from the Validation page.
2. **Given** a completed walk-forward study, **When** the operator issues the
   pooled-gate command, **Then** the same verdict the Insights page would
   show (pass/fail with confidence interval) is computed, persisted, and
   printed.
3. **Given** the operator has never signed in on this machine, **When** they
   issue any research command, **Then** they are told exactly how to
   establish a session, and no command silently falls back to privileged
   server credentials.
4. **Given** an unspent lockbox, **When** the operator issues the lockbox
   command *without* the explicit confirmation flag, **Then** nothing is
   spent and the command explains that this is a one-shot, irreversible
   action requiring explicit confirmation.
5. **Given** a sensitivity study request naming a knob outside the
   whitelisted registry, **When** the command is issued, **Then** it is
   rejected with the list of valid knobs before anything reaches the server.

---

### User Story 2 - One-action auto-research campaign with honest stopping rules (Priority: P2)

As the operator, I can start a *campaign* from a named starting config with
a trial budget, walk away, and come back to an explicit, honest verdict.
Unattended, each cycle: confirms research data is current, runs a
walk-forward study on the current candidate, computes the pooled gate, and
— if the gate fails — consults the deterministic recommendation engine and
acts on its top-ranked next step: a whitelisted knob change becomes a new
draft config (recorded in the trial ledger with campaign provenance), a
gather-evidence recommendation runs the prescribed study, and a stop-tuning
verdict halts the campaign. The campaign halts only at one of four ends:
**ready-for-lockbox** (gate passed — the candidate is frozen for *my*
one-shot decision), **stop-tuning** (no deployable edge in this family),
**budget exhausted**, or **cancelled by me**. It never spends or burns the
lockbox itself, and the bar a candidate must clear tightens as the family's
recorded trial count grows, so the gate cannot be worn down by volume.

**Why this priority**: This is the feature's headline value — the "find an
effective strategy" automation — but it composes the P1 building blocks and
the existing study/gate/recommendation machinery, so it correctly comes
second.

**Independent Test**: With a populated bar cache, start a campaign with a
small budget against a config known to fail the gate; the campaign runs
multiple cycles unattended, writes one trial-ledger row per candidate
tried, and halts with an explicit verdict; the lockbox state before and
after is identical.

**Acceptance Scenarios**:

1. **Given** a starting config whose walk-forward result fails the pooled
   gate and a budget of N trials, **When** the campaign runs, **Then** it
   tries ranked candidates cycle by cycle and halts with a verdict, having
   consumed at most N trials, with every cycle journaled.
2. **Given** a candidate that passes the pooled gate mid-campaign, **When**
   the cycle completes, **Then** the campaign halts with
   **ready-for-lockbox**, names the candidate config, and the lockbox
   remains untouched.
3. **Given** the recommendation engine returns a stop-tuning verdict,
   **When** the cycle evaluates next steps, **Then** the campaign halts with
   **stop-tuning** and says so in plain language.
4. **Given** a family whose recorded trial count has grown during the
   campaign, **When** a later candidate is gated, **Then** the pass bar
   applied is at least as strict as the bar applied to the first trial, and
   the applied bar is recorded with the verdict.
5. **Given** a campaign in progress, **When** the operator cancels it,
   **Then** it halts cleanly at the end of the current step with verdict
   **cancelled**, and nothing is left half-recorded.
6. **Given** the service restarts mid-cycle, **When** the operator checks
   campaign status, **Then** the campaign is either resumed or marked
   failed-with-reason — never silently stuck showing "running".

---

### User Story 3 - Launch and monitor campaigns from the dashboard (Priority: P3)

As the operator, I can start a campaign from the Auto-research section on
the Validation page (pick the starting config, set the budget), watch it
progress cycle by cycle — current
stage, gate verdicts so far, candidates tried, trial-ledger growth — and see
the terminal verdict prominently, with guidance on the next human step
(e.g., "candidate ready — run your one-shot lockbox test from the
Validation page"). Past campaigns are listed with drill-down to the studies,
configs, and ledger rows they produced. Every new concept on the panel
carries the standard educational tooltip.

**Why this priority**: Observability and ergonomics for the loop — valuable,
but only once the loop exists; the CLI covers launching/monitoring in the
interim.

**Independent Test**: Start a small-budget campaign from the panel; the
panel reflects each cycle's progress without a manual refresh, and after the
halt the verdict, candidate lineage, and links to produced artifacts are
all reachable from the campaign's detail view.

**Acceptance Scenarios**:

1. **Given** an idle system, **When** the operator launches a campaign from
   the panel, **Then** progress (cycle number, stage, last gate verdict)
   updates visibly as the campaign advances.
2. **Given** a halted campaign, **When** the operator opens its detail view,
   **Then** the verdict, every cycle's outcome, and links to each produced
   study/config/ledger row are present.
3. **Given** a running campaign, **When** the operator opens the panel on
   another page load (or after a service restart), **Then** the shown state
   matches the persisted truth.

---

### Edge Cases

- Empty or stale bar cache (fresh world): the campaign auto-backfills as
  the first step of the cycle — the full research span when empty,
  incremental when stale — and halts with **failed** (reason: no research
  data) only if that backfill itself fails. It never runs studies on
  nothing.
- Starting config already passes the gate: the campaign halts on cycle 1
  with **ready-for-lockbox** without consuming budget on candidates.
- Recommendation engine returns no actionable candidates (thin evidence and
  no prescribed study): campaign halts honestly (no invented candidates).
- Top-ranked candidate duplicates an existing config's knob projection: it
  is skipped in favor of the next ranked candidate; if all are duplicates,
  the campaign halts.
- Budget of zero: the campaign evaluates the starting config only and halts.
- Advisory AI unavailable or paused for billing: campaigns and CLI are fully
  functional — the deterministic core never depends on the narrator.
- Data provider outage mid-campaign: the cycle fails soft with the reason
  recorded; the campaign halts rather than looping on errors.
- A second campaign is launched while one is running: rejected with a clear
  message (one active campaign at a time).
- A config created by the campaign is deleted mid-run by the operator: the
  campaign's ledger rows survive (deletion-surviving, as today), and the
  campaign fails soft if its current candidate vanished.
- CLI session expired or revoked: commands fail with the re-sign-in
  instruction; no privileged fallback.

## Requirements *(mandatory)*

### Functional Requirements

**Research CLI (US1)**

- **FR-001**: The operator MUST be able to execute every research pipeline
  step as a single terminal command: data refresh/backfill (with date
  range), walk-forward study launch, sensitivity study launch (knob +
  values), study list/status/progress, pooled gate computation for a study,
  significance and Monte Carlo computation for a run, lockbox status, the
  one-shot lockbox run, config health verdicts, the recommendation evidence
  pack and ranked candidates, and an advisory analysis request.
- **FR-002**: Every CLI command MUST act as the authenticated operator —
  the same identity and data scope as the web app. Commands MUST NOT use
  privileged server credentials as the acting identity, and a missing or
  expired session MUST produce a clear re-sign-in instruction, never a
  silent privilege fallback. First-run sign-in is a one-time email-code
  flow (the same one-time-passcode path the web app uses); the resulting
  session is persisted on the operator's machine and renewed automatically
  thereafter.
- **FR-003**: Each command MUST report its outcome both human-readably and
  machine-readably (ids, status, and where to see the artifact in the UI),
  so scripts and the campaign runner can compose commands.
- **FR-004**: Irreversible actions invoked via CLI (the one-shot lockbox
  run, and its contaminating override) MUST require an explicit
  confirmation flag and MUST explain the consequence when the flag is
  absent. Whole-database deletion is NOT exposed via CLI.
- **FR-005**: Sensitivity knobs accepted by the CLI MUST be validated
  against the whitelisted knob registry before submission, with the valid
  knob list shown on rejection.

**Auto-research campaign (US2)**

- **FR-006**: The operator MUST be able to start a campaign by naming a
  starting config and a campaign-level trial budget (one cap on the total
  candidates the campaign may try — there are no per-family sub-budgets);
  defaults for the budget and stopping thresholds live in the
  application's configuration file (no hardcoded numbers).
- **FR-007**: Each campaign cycle MUST: verify research data currency and
  auto-backfill any gap (full span when the cache is empty, incremental
  when stale; halt as **failed** only if the backfill itself fails), run
  a walk-forward study on the current candidate, compute the pooled gate,
  and on failure act on the deterministic recommendation engine's
  top-ranked next step — knob-delta → create a draft config; gather-evidence
  → run the prescribed study; stop-tuning → halt.
- **FR-008**: A campaign MUST halt only with one of: **ready-for-lockbox**
  (gate passed), **stop-tuning**, **budget-exhausted**, **cancelled**, or
  **failed** (with reason). On gate pass it MUST identify the candidate and
  stop — a campaign MUST NEVER spend, burn, or otherwise touch the lockbox.
- **FR-009**: The pooled-gate pass bar applied within a campaign MUST
  tighten deterministically as the knob family's recorded trial count grows
  (monotonically non-loosening), and the bar applied MUST be recorded
  alongside each verdict so any cycle's decision is recomputable.
- **FR-010**: Every candidate a campaign tries MUST be recorded as a trial
  ledger row carrying campaign provenance (campaign id, cycle number,
  source recommendation), surviving config deletion, exactly like
  operator-initiated trials today.
- **FR-011**: Campaign state MUST be persisted and journaled per cycle; a
  service restart MUST leave the campaign resumable or explicitly
  failed-with-reason — never silently "running". Exactly one campaign may
  be active at a time.
- **FR-012**: Campaigns MUST operate only against backtest/paper research —
  nothing a campaign does may place live trades or change live-trading
  enablement.
- **FR-013**: The advisory AI narrator MUST be optional during campaigns
  (default: off mid-cycle) and its unavailability MUST NOT degrade any
  deterministic step.
- **FR-014**: Campaign status — current cycle, stage, verdicts so far,
  candidates tried, terminal verdict — MUST be queryable at any time (from
  both CLI and UI) with the same persisted truth.

**Dashboard panel (US3)**

- **FR-015**: An Auto-research section on the Validation page MUST let the
  operator launch a campaign (starting config, budget), observe live
  progress cycle by cycle, and cancel a running campaign; each campaign
  MUST have a drill-down detail page reviewing every cycle with links to
  every produced study, config, and ledger row. No new top-level
  navigation item is introduced.
- **FR-016**: The terminal verdict MUST be displayed prominently with the
  recommended next human action; **ready-for-lockbox** MUST direct the
  operator to the existing lockbox decision (never offer to spend it from
  the campaign surface).
- **FR-017**: Every new concept introduced by the panel (campaign, cycle,
  trial budget, stopping rule, tightened bar) MUST ship with the standard
  educational tooltip explaining what it is, why it matters, and how the
  app uses it.

### Key Entities

- **Campaign**: one automated research run — starting config, trial budget,
  stopping thresholds in effect, state (running/halted), terminal verdict,
  timestamps, operator.
- **Cycle**: one iteration within a campaign — candidate config, study
  produced, gate verdict with the bar applied, action taken next
  (knob-delta / gather-evidence / halt), outcome, journal references.
- **Candidate lineage**: the chain from starting config through each
  auto-created draft (which knob changed, from which recommendation),
  linking to trial-ledger rows.
- **Stopping rule set**: the budget and the trial-count→pass-bar schedule
  applied; recorded per campaign so verdicts are reproducible later.
- **Operator session (CLI)**: the persisted terminal identity — who, when
  established, renewable until revoked; never a privileged server identity.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An operator completes a full research pass (data refresh →
  walk-forward → pooled gate → recommendations) end to end using only
  terminal commands — zero browser interactions — and every artifact is
  subsequently visible in the web UI.
- **SC-002**: A campaign launched with budget N halts unattended with an
  explicit verdict after at most N candidate trials, with zero human input
  between launch and halt.
- **SC-003**: Across any campaign, the lockbox ledger is byte-identical
  before and after — automated lockbox spend is impossible by construction,
  verified by test.
- **SC-004**: The number of configs a campaign creates equals the number of
  new trial-ledger rows with that campaign's provenance — no untracked
  trials.
- **SC-005**: Re-evaluating any recorded cycle from its persisted inputs
  reproduces the identical gate verdict and applied bar (determinism).
- **SC-006**: The documented bar schedule is monotonically non-loosening in
  trial count, and a worked example exists where a result that passes at
  trial 1 fails at a higher trial count — proving volume cannot wear the
  gate down.
- **SC-007**: Campaign progress shown in the dashboard reflects persisted
  state within 5 seconds of a cycle transition, and survives page reloads
  and service restarts without showing phantom "running" states.
- **SC-008**: After the one-time sign-in, CLI commands keep working for at
  least 30 days of regular use without re-authentication, and no command
  ever transmits privileged server credentials as its identity.

## Assumptions

- Single-operator system (matches today's model); "the operator" is the one
  existing authenticated user.
- One active campaign at a time is sufficient for v1; queueing/parallel
  campaigns are out of scope.
- Default trial budget and the bar-tightening schedule live in the existing
  application configuration file; the spec does not fix their numeric
  values, only their behavior (configurable, monotone non-loosening).
- The campaign composes *existing* validation machinery (walk-forward
  studies, pooled gate, recommendation engine, trial ledger); it introduces
  orchestration and the multiplicity schedule, not new statistical methods.
- The CLI's one-time sign-in is interactive: the operator requests an
  email one-time code (the web app's existing sign-in method), enters it
  once, and the stored session renews automatically thereafter (clarified
  2026-06-06).
- Mid-cycle advisory narration is off by default to control cost; an
  optional end-of-campaign advisory summary may be requested explicitly.
- Whole-database deletion (factory reset) stays UI-only.
- Live trading remains disabled and out of scope (constitutional).
