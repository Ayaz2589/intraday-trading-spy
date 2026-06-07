# Phase 0 Research — Automated Strategy Research (019)

All unknowns from Technical Context resolved below. Format per plan template:
Decision / Rationale / Alternatives considered.

## R1 — CLI authentication: GoTrue email-OTP over REST

**Decision**: The CLI signs in with the exact flow the web app uses, via two
GoTrue REST calls with the **anon** key (`SUPABASE_ANON_KEY`, new var in
`backend/.env`, value identical to the frontend's `VITE_SUPABASE_ANON_KEY`):

1. `POST {SUPABASE_URL}/auth/v1/otp` `{email, create_user: false}` — sends the
   same email code the sign-in page sends (the frontend already verifies
   6-digit codes via `verifyOtp(email, token)`, so the email template
   carries a code — verified in `frontend/src/auth/AuthProvider.tsx`).
2. `POST {SUPABASE_URL}/auth/v1/verify` `{type: "email", email, token}` →
   `{access_token, refresh_token, expires_at, user}`.

Session persists at `~/.intraday-trade-spy/session.json` (chmod 600,
overridable via `ITS_SESSION_FILE`). Before each API call the CLI refreshes
when the access token is within 60 s of expiry — `POST
/auth/v1/token?grant_type=refresh_token` — and rewrites the file (Supabase
rotates refresh tokens; the new pair replaces the old). A 401 from the API
triggers one refresh-and-retry, then a clear `login` instruction. Supabase
refresh tokens do not expire by default → satisfies SC-008 (≥30 days).

**Rationale**: Reuses the only sign-in method that exists for the operator's
account; zero auth-server changes; the API's FR-014 service-role rejection
stays intact; anon key is a publishable key (already shipped to every
browser), so storing it in `backend/.env` adds no privilege.

**Alternatives considered**: password grant (requires admin-setting a password
on the operator account — a new secret with no current consumer); pasting a
browser session (manual, expires, clunky); API-side dev bypass (weakens the
verified FR-014 security property — rejected outright).

## R2 — CLI shape: one console script, make targets as sugar

**Decision**: New console script `intraday-trade-spy-research` (argparse
subcommands, httpx, `--json` for machine output on every command):
`login / whoami / logout / backfill / study-wf / study-sens / studies /
study-status / gate / significance / monte-carlo / lockbox /
lockbox-run / health / recommend / analyze / campaign-start /
campaign-status / campaign-list / campaign-cancel`. Sensitivity knobs are
validated client-side against `validation.knobs.KNOB_REGISTRY` (FR-005) and
accept either the dotted path or its unique leaf (`risk_reward`).
`lockbox-run` requires `--confirm` (and `--override --confirm` to burn);
without it, it prints the consequence and exits non-zero (FR-004). No reset
command (FR-004). Make targets (`make study-wf CONFIG=…`, `make campaign
BUDGET=…`, …) are thin wrappers; API base URL from `ITS_API_URL` (default
`http://127.0.0.1:8001`).

**Rationale**: A real console script is testable under pytest (constitution
IV) and reusable from any shell/CI; make targets stay config-thin (exempt).
JSON output is what lets future scripts compose steps (FR-003).

**Alternatives considered**: pure-Makefile curl recipes (untestable, no auth
lifecycle, JSON wrangling in shell); a Node CLI in frontend (wrong side of the
repo for research tooling; duplicate API typing).

## R3 — Campaign runner: BackgroundTask + persisted state, fail-explicit on restart

**Decision**: `POST /api/research/campaigns` inserts a `research_campaigns`
row (`status='running'`) and enqueues `run_campaign_task` via FastAPI
BackgroundTasks — the exact lifecycle pattern of studies
(`validation_lifecycle.run_study_task`). The engine appends a cycle entry to
the row's `cycles` JSONB after every stage transition (read-modify-write, the
R2-016 merge pattern) and re-reads `cancel_requested` between stages
(cooperative cancel → verdict `cancelled`). On API startup, a reconciler marks
any `running` campaign `failed` with reason `service restart` — the spec
allows resume-or-fail-explicit; v1 chooses fail-explicit (deterministic,
simple), resume is future work. The runner invokes the study/gate/recommend
machinery **in-process** (same functions the routers call), not over HTTP — no
credentials problem, no self-calls.

**Rationale**: Studies already prove this pattern works in this deployment;
in-process composition reuses `make_study_persist`, `run_pooled_gate_fast`,
and `recommend/` functions directly with the storage client already scoped to
the user.

**Alternatives considered**: separate worker process/queue (new infra for a
single-operator app); CLI-driven loop client-side (dies with the laptop;
campaign state belongs server-side, FR-011); resume-on-restart (needs
re-attachable study jobs — studies themselves are not resumable today, so
honesty demands fail-explicit).

## R4 — The tightened bar: Bonferroni on the pooled-gate CI level, keyed to the family ledger count

**Decision**: The pooled gate today passes iff the bootstrap CI (level
`1 − α₀`, α₀ = 0.05) on pooled OOS expectancy excludes 0 from below. Inside a
campaign, cycle gates are computed at level `1 − α₀ / k`, where
`k = 1 + (recommendation_trials rows with the same family for this user +
strategy)` counted **at gate time**. `family` is a new TEXT column on the
ledger: the comma-joined sorted set of knob paths the candidate changes
relative to the campaign's starting config (e.g.
`strategy.vwap_pullback.target.risk_reward`); the starting config itself
gates at `k = 1` (no new trial row is written for cycle 1, which evaluates the
operator's own config). Both `k` and the applied level are recorded in the
cycle entry and in the persisted gate payload (`pooled_gate.bar = {k, level}`)
so any verdict is recomputable (SC-005). Monotonicity: ledger rows are never
deleted (0125 semantics), so `k` is non-decreasing per family → the level is
non-loosening (SC-006). `α₀` lives in `config.yaml` under
`research.base_alpha`.

**Rationale**: Bonferroni is the textbook family-wise error correction —
trivially explainable in a tooltip ("after k tries, a result must clear a
1 − α/k confidence bar"), deterministic, and implementable as one parameter
already threaded through the existing bootstrap (it takes a CI level).

**Alternatives considered**: fixed margin added to the CI bound (arbitrary
units, harder to justify); Benjamini-Hochberg FDR (controls a different error
rate; sequential semantics don't fit a halt-on-first-pass loop);
deflated-Sharpe-style corrections (heavier machinery than this gate's
expectancy statistic warrants in v1).

## R5 — Candidate naming + duplicate handling

**Decision**: Auto-created configs are named `auto<NN>-c<cycle>-<leaf><value>`
(e.g. `auto07-c3-risk_reward2.5`), where `NN` is the campaign's short number
(its row's sequence within the user's campaigns), `leaf` the changed knob's
path leaf, `value` formatted with trailing-zero trimming. On collision or
when the candidate's knob projection equals an existing config's
(`recommend.candidates` already computes `matches_existing`), the engine skips
to the next ranked candidate; if none remain → verdict `stop_tuning`
(`reason: no_novel_candidates`).

**Rationale**: Deterministic, sortable, self-describing names; reuses 018's
existing duplicate detection rather than re-deriving it.

**Alternatives considered**: UUID-suffixed names (opaque in the configs list);
operator-prompted names (defeats unattended operation).

## R6 — Data-freshness step

**Decision**: Cycle stage 1 reads the existing coverage aggregate (013's
psycopg path) — empty cache → start a full-span backfill (the 009 default
window from config), stale (last cached session older than the previous
completed trading session) → incremental backfill from the last cached day.
The stage polls the backfill job (existing `bars/backfill` machinery) to
completion; job failure → campaign verdict `failed` with the job's persisted
failure reason (FR-007 clarification).

**Rationale**: Reuses the persisted-job backfill (013) end to end; "previous
completed session" comes from the existing trading-calendar helpers — no new
time logic (engineering standards).

**Alternatives considered**: proceed-if-stale (was clarification option C —
user chose auto-backfill); blocking synchronous fetch (loses 013's job
history/failure persistence).

## R7 — Frontend live progress

**Decision**: `useCampaignStatus(id)` polls `GET /api/research/campaigns/{id}`
with `refetchInterval: 2000` while `status === 'running'` (the
`useStudyStatus` pattern; SC-007's ≤5 s bound with margin). The Validation
page renders `AutoResearchCard` (launch form: config select via `useConfigs`,
budget input seeded from `research.default_budget` exposed in the campaign
list response; live stage strip; cancel button) + `CampaignsTable` (history),
and a detail route `/validation/campaigns/$campaignId` renders the cycle
timeline with per-cycle: stage outcomes, gate verdict + bar applied
(`k`, level), action taken, links (study → `/validation/{id}`, config, ledger
row). New HELP_CONTENT keys: `auto_research_campaign`, `trial_budget`,
`tightened_bar`, `stopping_rules`, `ready_for_lockbox`.

**Rationale**: Poll-based status is the established live pattern in this app
(studies, backfill jobs); no websockets infra exists and none is warranted.

**Alternatives considered**: SSE/websocket push (new infra, single operator,
2 s polling is indistinguishable at this scale).

## R8 — Where verdict guidance points

**Decision**: `ready_for_lockbox` renders the candidate name + a link to the
Validation page's lockbox card (which already preselects/accepts a config
choice) with copy "Run your one-shot lockbox test when YOU are ready" — the
campaign surface never exposes a spend control (FR-016). `stop_tuning`
surfaces the engine's own stop-tuning rationale text (018 already generates
it).

**Rationale**: Keeps the human-gate boundary visually unambiguous; reuses
018's language for honesty verdicts.

**Alternatives considered**: inline lockbox button on the campaign verdict
(rejected — exactly the temptation FR-008/FR-016 exists to prevent).
