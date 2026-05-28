# Contract: `run.yaml` schema

Single YAML file written per run at `<run-dir>/run.yaml`. Together with
`journal.csv` and the input CSV, this file makes a run reproducible
(spec FR-014 + FR-015).

## Writer settings

- Encoding: UTF-8, no BOM.
- `yaml.safe_dump(..., sort_keys=True, default_flow_style=False)`.
- Trailing newline: yes.

## Top-level keys

```yaml
run_id:               <string>          # YYYYMMDD-HHMMSS-<short-data-hash>
run_started_at:       <ISO 8601 UTC>    # e.g. 2026-05-28T14:23:11+00:00
run_ended_at:         <ISO 8601 UTC>
code_version:         <git SHA or "unversioned">
data_fingerprint:
  sha256:             <64 hex chars>
  bar_count:          <integer>
  earliest_timestamp: <ISO 8601 ET>     # e.g. 2026-05-28T09:30:00-04:00
  latest_timestamp:   <ISO 8601 ET>
  session_count:      <integer>
resolved_config:
  app:
    name: intraday-trade-spy
    timezone: America/New_York
    mode: backtest
  market:
    symbol: SPY
    session_start: "09:30:00"
    session_end: "16:00:00"
    no_new_trades_after: "15:30:00"
    force_flat_time: "15:55:00"
  data:
    timeframe: 5m
    csv_path: <string>
    output_dir: <string>
    require_regular_session_only: true
  strategy:
    enabled: true
    allowed_directions: [long]
    enabled_setup: vwap_pullback_long
    opening_range:
      minutes: 15
    vwap_pullback:
      min_minutes_after_open: 15
      max_distance_from_vwap_pct: 0.25
      confirmation:
        require_close_above_prior_bar_high: true
        require_close_above_vwap: true
      stop:
        type: below_pullback_low
        buffer_pct: 0.05
      target:
        risk_reward: 2.0
  risk:
    account_value: 1000.0
    max_risk_per_trade_pct: 1.0
    max_daily_loss_pct: 2.0
    max_trades_per_day: 3
    max_consecutive_losses: 2
    cooldown_after_loss_minutes: 30
    max_position_value_pct: 25.0
    require_stop_loss: true
    require_take_profit: true
    allow_overnight_positions: false
  broker:
    provider: paper
    live_auto_enabled: false
    fees_per_share: 0.0
    slippage_per_share: 0.0
summary:
  # Same shape as summary.json (see summary-json-schema.md).
  total_trades: <integer>
  # ... etc
```

## Replay contract

The combination (`run.yaml`, the input CSV referenced by its
`data_fingerprint.sha256`) is the reproducibility unit. A future
`replay_backtest` command (not in this feature) MAY consume this file
to re-run an identical backtest. For this feature:

- The CLI `--config` and `--data` flags MUST always populate the
  `resolved_config` and `data_fingerprint` blocks consistently with
  the actual inputs used.
- The values written to `resolved_config` MUST be the post-defaults,
  post-validation view of the config — not the raw on-disk YAML.

## Determinism notes

- `run_started_at` / `run_ended_at` are intentionally NOT used in the
  byte-identical reproducibility check. The check compares
  `journal.csv` only (spec FR-015 acceptance test).
- `code_version` may differ if the code has been edited between runs;
  this is expected and is the entire point of recording it.
