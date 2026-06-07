# Quickstart — Automated Strategy Research (019)

## One-time setup

```bash
# anon key (same value as frontend VITE_SUPABASE_ANON_KEY) → backend/.env
echo 'SUPABASE_ANON_KEY=<anon key>' >> backend/.env

make api-dev                      # the API must be running (:8001)
make research-login               # email → paste the 6-digit code → done
```

The session lives in `~/.intraday-trade-spy/session.json` and renews itself;
you won't sign in again for months.

## Terminal-driven research (US1)

```bash
make backfill                                     # fill/refresh the SPY bar cache
make study-wf CONFIG=default                      # walk-forward study (prints id)
make gate STUDY=<id>                              # pooled gate verdict + CI
make recommend                                    # health, evidence, ranked candidates
make study-sens CONFIG=default KNOB=risk_reward VALUES=1.5,2,2.5,3
make lockbox                                      # status (always safe)
make lockbox-run CONFIG=default CONFIRM=1         # the one-shot — only when YOU decide
```

Every command prints the artifact id and the UI page where it's visible;
add `--json` (or use the console script directly) for machine output:

```bash
backend/.venv/bin/intraday-trade-spy-research study-wf --config default --wait --json
```

## An auto-research campaign (US2)

```bash
make campaign CONFIG=default BUDGET=6
make campaign-status            # cycle, stage, gate verdicts, bar applied
make campaign-cancel ID=<id>    # cooperative halt → verdict: cancelled
```

The campaign: checks data freshness (auto-backfills gaps) → runs walk-forward
→ computes the pooled gate at the **tightened bar** (1 − α/k for the family's
k-th recorded trial) → on failure takes the recommendation engine's top
candidate (new draft config + trial-ledger row) → repeats. It halts with one
of: `ready_for_lockbox`, `stop_tuning`, `budget_exhausted`, `cancelled`,
`failed(reason)` — and it can never spend your lockbox.

## Watching from the dashboard (US3)

Validation page → **Auto-research** section: launch (config + budget), live
stage strip while running, history table; click a campaign for the per-cycle
timeline (study links, gate CI vs the bar applied, candidates created).
`ready_for_lockbox` links you to the lockbox card — the final shot stays
yours.

## Verifying the honesty properties

```bash
# lockbox untouched by campaigns (SC-003)
make lockbox            # before
make campaign CONFIG=default BUDGET=2 && make campaign-status
make lockbox            # after — identical

# every trial recorded (SC-004): campaign-status trials_used equals the new
# ledger rows shown on the campaign detail page
```
