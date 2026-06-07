# Phase 1 Data Model — Automated Strategy Research (019)

## Migration `0126_research_campaigns.sql`

### New table: `research_campaigns`

One row per campaign. Cycles are a JSONB array on the row (the studies
result-JSONB precedent): campaigns are budget-bounded (≤ ~20 cycles), and a
single document keeps status reads to one query. Writes use the
read-modify-write merge pattern (016 R2) and are single-writer (one
BackgroundTask owns the row; the API only flips `cancel_requested`).

| column | type | notes |
|---|---|---|
| id | UUID PK default gen_random_uuid() | |
| user_id | UUID NOT NULL → auth.users ON DELETE CASCADE | RLS owner |
| strategy_id | UUID NOT NULL → strategies | |
| seq | INTEGER NOT NULL | per-user campaign number (drives `auto<NN>` naming); unique (user_id, seq) |
| starting_config_id | UUID NULL → configs ON DELETE SET NULL | survives config deletion |
| starting_config_name | TEXT NOT NULL | audit trail |
| budget | INTEGER NOT NULL CHECK (budget >= 0) | campaign-level candidate cap (clarification 4) |
| status | TEXT NOT NULL CHECK IN ('running','halted','failed') | |
| verdict | TEXT NULL CHECK IN ('ready_for_lockbox','stop_tuning','budget_exhausted','cancelled','failed') | set exactly once at halt |
| verdict_detail | JSONB NULL | e.g. `{candidate, reason, failed_stage}` |
| cancel_requested | BOOLEAN NOT NULL DEFAULT false | cooperative cancel flag |
| thresholds | JSONB NOT NULL | frozen copy of `research.*` config at launch (base_alpha, default span…) — verdict reproducibility (SC-005) |
| cycles | JSONB NOT NULL DEFAULT '[]' | array of Cycle entries (below) |
| created_at / updated_at | TIMESTAMPTZ NOT NULL DEFAULT now() | |

Indexes: `(user_id, created_at DESC)`; partial unique
`(user_id) WHERE status = 'running'` — enforces the one-active-campaign rule
at the database, not just the router.

RLS: user-owned rows, service role bypasses (0123/0125 boilerplate).

Factory reset: table added to the reset wipe list (it is research data).

### Cycle entry (JSONB shape inside `research_campaigns.cycles`)

```jsonc
{
  "cycle": 1,                       // 1-based
  "candidate_config_id": "…",       // null after config deletion
  "candidate_config_name": "auto07-c2-risk_reward2.5",
  "family": "strategy.vwap_pullback.target.risk_reward",  // "" for cycle 1 (starting config)
  "stages": [                        // append-only stage log
    {"stage": "data",  "status": "ok",   "detail": {"backfill_job_id": null}},
    {"stage": "study", "status": "ok",   "detail": {"study_id": "…"}},
    {"stage": "gate",  "status": "fail", "detail": {"k": 3, "level": 0.9833,
        "ci_low": -0.41, "ci_high": 1.92}},
    {"stage": "act",   "status": "ok",   "detail": {"action": "knob_delta",
        "changes": [{"knob_path": "…", "value": 2.5}], "trial_id": "…"}}
  ],
  "started_at": "…", "ended_at": "…"
}
```

Stage vocabulary: `data | study | gate | act`. Action vocabulary mirrors 018
candidate classes: `knob_delta | gather_evidence | stop_tuning` plus the
terminal `halt`.

### Altered table: `recommendation_trials` (+3 nullable columns)

| column | type | notes |
|---|---|---|
| campaign_id | UUID NULL → research_campaigns ON DELETE SET NULL | provenance survives campaign deletion (FR-010) |
| cycle | INTEGER NULL | which cycle created this trial |
| family | TEXT NULL | sorted, comma-joined knob paths changed vs the campaign's starting config; backfills as NULL for pre-019 rows (counted into k only when matching a non-empty family key — NULL never matches) |

New index: `(user_id, strategy_id, family, created_at DESC)` — the bar
schedule's `k` count.

Existing `source` CHECK ('claude','deterministic') is unchanged — campaign
trials are `source='deterministic'` (the engine acts only on deterministic
candidates; FR-013 keeps the narrator non-actuating).

## Derived/computed values (no storage)

- **k (family trial count)**: `1 + count(recommendation_trials where user,
  strategy, family = candidate.family)` at gate time. Cycle 1 (operator's own
  starting config) uses `k = 1` and writes no trial row.
- **Bar level**: `1 − base_alpha / k`, `base_alpha` from the campaign's frozen
  `thresholds`. Recorded in the gate stage detail AND in the study's persisted
  `pooled_gate.bar` — double-recorded on purpose so each artifact is
  self-describing.
- **Auto-config name**: `auto{seq:02d}-c{cycle}-{leaf}{value:g}` (R5).

## CLI session file (`~/.intraday-trade-spy/session.json`, chmod 600)

```jsonc
{
  "supabase_url": "…",
  "email": "…",
  "access_token": "…",
  "refresh_token": "…",
  "expires_at": 1781000000      // unix seconds; refresh when < now+60
}
```

Never contains the service-role key. `logout` deletes the file.

## config.yaml additions (`research:` section)

```yaml
research:
  default_budget: 6        # campaign trial budget when not specified
  base_alpha: 0.05         # gate alpha at k=1; bar level = 1 - alpha/k
  backfill_start: "2018-01-01"   # full-span auto-backfill start (empty cache)
```

## State transitions

```
Campaign:  running ──(gate pass)──────────→ halted/ready_for_lockbox
           running ──(stop-tuning / no novel candidates)→ halted/stop_tuning
           running ──(budget exhausted)───→ halted/budget_exhausted
           running ──(cancel_requested)───→ halted/cancelled
           running ──(stage error / restart reconciler)→ failed (+reason)
```

`halted` and `failed` are terminal; `verdict` is written exactly once,
atomically with the status flip.
