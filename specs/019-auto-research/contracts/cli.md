# Contract — Research CLI (`intraday-trade-spy-research`)

Console script (pyproject `[project.scripts]`); every subcommand supports
`--json` (machine output to stdout, exit code semantics below). Human output
always names the artifact id and where to see it in the UI (FR-003).

Environment: `ITS_API_URL` (default `http://127.0.0.1:8001`),
`SUPABASE_URL` + `SUPABASE_ANON_KEY` (sign-in only), `ITS_SESSION_FILE`
(default `~/.intraday-trade-spy/session.json`).

## Sessions

| command | behavior |
|---|---|
| `login [--email X]` | OTP request → prompt for the emailed code → verify → write session file (0600). |
| `whoami` | prints email + user id from the stored session (refreshing if needed). |
| `logout` | deletes the session file. |

Any data command without a valid session exits `3` with the exact remediation
line: `Not signed in — run: intraday-trade-spy-research login` (FR-002). A 401
mid-command triggers one silent refresh-and-retry before failing.

## Data & studies

| command | wraps | notes |
|---|---|---|
| `backfill [--start D] [--end D]` | POST /api/bars/backfill (+ status poll with `--wait`) | defaults from config |
| `study-wf --config NAME [--wait]` | POST /api/validation/studies kind=walk_forward | prints study id; `--wait` polls to completion |
| `study-sens --config NAME --knob K --values 1.5,2,2.5 [--wait]` | POST kind=sensitivity, segment=train | K = dotted path or unique leaf; validated against KNOB_REGISTRY locally, invalid → exit 2 + valid-knob list (FR-005) |
| `studies` | GET /api/validation/studies | |
| `study-status ID` | GET /api/validation/studies/{id}/status | |
| `gate STUDY_ID [--mode fast]` | POST /api/validation/studies/{id}/pooled-gate | |
| `significance RUN_ID` | POST /api/validation/significance | |
| `monte-carlo RUN_ID` | POST /api/validation/monte-carlo | |

## Lockbox (FR-004 — confirmation-gated)

| command | behavior |
|---|---|
| `lockbox` | GET /api/validation/lockbox — status only, always safe. |
| `lockbox-run --config NAME --confirm` | POST /api/validation/lockbox/run. Without `--confirm`: prints the one-shot consequence, exits `2`, sends nothing. Burning additionally requires `--override --confirm`. |

## Recommendations & advisory

| command | wraps |
|---|---|
| `health` | GET /api/recommend/health |
| `recommend` | GET /api/recommend/pack |
| `analyze --scope recommend\|insights\|study [--scope-id ID] [--force]` | POST /api/insights/claude-analysis |

## Campaigns

| command | wraps |
|---|---|
| `campaign-start --config NAME [--budget N]` | POST /api/research/campaigns |
| `campaign-status [ID]` | GET …/{id}; no ID → the most recent campaign |
| `campaign-list` | GET /api/research/campaigns |
| `campaign-cancel ID` | POST …/{id}/cancel |

## Exit codes

| code | meaning |
|---|---|
| 0 | success |
| 1 | API/network error (message printed; `--json` → the error envelope) |
| 2 | refused locally (missing `--confirm`, invalid knob, bad args) |
| 3 | not signed in / session irrecoverable |

## `--json` output

Exactly the API response body (or `{"error": …}` envelope) — no CLI-invented
shapes — so scripts compose against the same contracts the frontend uses.

## Excluded by design

No `reset` subcommand (FR-004); no service-role usage anywhere (FR-002 — the
service key is never read by CLI code, asserted by test).

## Make targets (thin wrappers, config-exempt)

`make research-login`, `make backfill [START= END=]`,
`make study-wf CONFIG=…`, `make study-sens CONFIG=… KNOB=… VALUES=…`,
`make gate STUDY=…`, `make significance RUN=…`, `make monte-carlo RUN=…`,
`make lockbox`, `make lockbox-run CONFIG=… CONFIRM=1`, `make health`,
`make recommend`, `make campaign CONFIG=… [BUDGET=N]`,
`make campaign-status [ID=…]`, `make campaign-cancel ID=…` — each ≤2 lines,
delegating to the console script.
