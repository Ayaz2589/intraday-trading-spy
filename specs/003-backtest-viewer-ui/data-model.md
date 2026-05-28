# Phase 1 Data Model: Backtest Viewer UI

Two halves: HTTP contract types (returned by the FastAPI server, mirrored
in TypeScript on the frontend) and frontend-only types (route state,
HelpTooltip dictionary).

The backend does NOT define new Pydantic models. The static server
reads existing files and emits dicts; FastAPI's automatic
JSON-serialization handles the wire format. The wire shape is the
TypeScript types below.

---

## TypeScript types (`frontend/src/api/types.ts`)

```typescript
// One row of journal.csv, parsed to JSON.
export type JournalRowView = {
  row_seq: number;
  timestamp: string;            // ISO 8601 with ET offset
  status:
    | "emitted"
    | "approved"
    | "rejected"
    | "executed"
    | "exited"
    | "force_flat"
    | "lockout";
  setup: string | null;
  direction: "long" | null;
  planned_entry: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  quantity: number | null;
  planned_risk_dollars: number | null;
  actual_entry: number | null;
  actual_exit: number | null;
  exit_reason: "stop" | "target" | "force_flat" | null;
  realized_pnl: number | null;
  realized_r: number | null;
  vwap: number | null;
  or_high: number | null;
  or_low: number | null;
  distance_from_vwap_pct: number | null;
  prior_bar_close: number | null;
  reason: string;
  rejection_check: string | null;
  same_bar_tiebreak: "none" | "stop_first" | null;
};

// Summary metrics — mirrors backend SummaryMetrics shape.
export type SummaryMetricsView = {
  total_trades: number;
  wins: number;
  losses: number;
  win_rate: number;
  average_win_r: number;
  average_loss_r: number;
  average_r: number;
  total_r: number;
  profit_factor: number | null;
  max_drawdown_r: number;
  best_trade_r: number | null;
  worst_trade_r: number | null;
  longest_consecutive_loss_streak: number;
  rejected_signal_count: number;
  rejection_breakdown: Record<string, number>;
};

// One item in GET /api/runs response.
export type RunSummaryView = {
  run_id: string;
  started_at: string;             // ISO 8601 UTC
  summary: SummaryMetricsView;
};

// One row of the bars CSV.
export type BarView = {
  symbol: "SPY";
  timestamp: string;              // ISO 8601 with ET offset
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

// run.yaml parsed to JSON.
export type RunManifestView = {
  run_id: string;
  run_started_at: string;
  run_ended_at: string;
  code_version: string;
  config_snapshot: Record<string, unknown>;  // free-form; we read a few well-known keys
  data_fingerprint: {
    sha256: string;
    bar_count: number;
    earliest_timestamp: string;
    latest_timestamp: string;
    session_count: number;
  };
  summary: SummaryMetricsView;
};
```

---

## HelpTooltip dictionary (`frontend/src/components/help-content.ts`)

```typescript
export type HelpContent = {
  title: string;
  description: string;            // three-part: what / why / how
};

// String literal union — every key MUST appear in HELP_CONTENT below;
// every key MUST be paired with a rendered HelpTooltip on the page.
export type HelpContentKey =
  | "vwap"
  | "opening_range"
  | "r_multiple"
  | "profit_factor"
  | "max_drawdown"
  | "win_rate"
  | "rejected_signal"
  | "position_cap"
  | "cooldown"
  | "lockout"
  | "force_flat_exit"
  | "take_profit"
  | "stop_loss"
  | "risk_per_trade";
// 14 concepts. "daily_drawdown" intentionally absent — the backend
// SummaryMetrics doesn't track per-day drawdown separately, only
// run-wide max_drawdown_r. See analyze finding M6 for context.

export const HELP_CONTENT: Record<HelpContentKey, HelpContent> = {
  vwap: {
    title: "VWAP",
    description:
      "Volume-weighted average price for the current trading session. " +
      "It resets at the open each day and acts as an intraday fair-value " +
      "reference. The strategy only looks for long setups when price is " +
      "above VWAP.",
  },
  opening_range: {
    title: "Opening Range",
    description:
      "The high and low of the first 15 minutes of the session " +
      "(09:30–09:45 ET). Traders watch it because breaks above or below " +
      "it can signal early directional bias. The strategy will not " +
      "consider signals until the opening range is complete.",
  },
  r_multiple: {
    title: "R Multiple",
    description:
      "The trade's outcome in units of initial risk. +2R means the " +
      "trade made twice what was risked; -1R means a full-stop loss. " +
      "Used to compare trades on equal footing regardless of share " +
      "count.",
  },
  profit_factor: {
    title: "Profit Factor",
    description:
      "Total R gained on winning trades divided by the absolute total R " +
      "lost on losing trades. Above 1.0 = profitable; the higher, the " +
      "more dollar-per-dollar effective the strategy was. The app " +
      "computes this over all completed trades in this run.",
  },
  max_drawdown: {
    title: "Max Drawdown",
    description:
      "The largest peak-to-trough decline in cumulative R during the run. " +
      "Tells you the worst losing streak this strategy endured. Smaller " +
      "(closer to 0) is better.",
  },
  win_rate: {
    title: "Win Rate",
    description:
      "Percentage of trades that hit their take-profit target. Force-flat " +
      "exits are not counted as wins or losses for this percentage; only " +
      "decisive target/stop outcomes count.",
  },
  rejected_signal: {
    title: "Rejected Signal",
    description:
      "The strategy detected a valid setup but the risk manager blocked " +
      "the trade. This is GOOD — it means the safety rules are working. " +
      "Every rejection includes a `rejection_check` explaining which " +
      "rule fired.",
  },
  position_cap: {
    title: "Position Cap",
    description:
      "Maximum dollar value of any single position, as a percentage of " +
      "account size. Prevents one trade from putting the whole account at " +
      "risk. Default 25%: with $1,000 account, max position is $250.",
  },
  cooldown: {
    title: "Cooldown",
    description:
      "Mandatory waiting period after a losing trade before the strategy " +
      "may take another trade. Designed to prevent revenge trading. " +
      "Default 30 minutes.",
  },
  lockout: {
    title: "Lockout",
    description:
      "All trading is blocked for the remainder of the session. Triggered " +
      "when the daily loss limit is hit or consecutive losses cross the " +
      "threshold. Resets at the next session.",
  },
  force_flat_exit: {
    title: "Force-Flat Exit",
    description:
      "Any open position is closed before market close, regardless of " +
      "stop/target. The app uses 15:55 ET by default — five minutes " +
      "before the close — to ensure no overnight exposure.",
  },
  take_profit: {
    title: "Take-Profit",
    description:
      "Pre-planned exit price if the trade works. The strategy computes " +
      "it from the entry, the stop, and the configured risk:reward ratio " +
      "(default 2:1).",
  },
  stop_loss: {
    title: "Stop-Loss",
    description:
      "Pre-planned exit price if the trade is wrong. NO trade is allowed " +
      "without a stop — this is a NON-NEGOTIABLE rule. The strategy places " +
      "the stop just below the pullback low.",
  },
  risk_per_trade: {
    title: "Risk per Trade",
    description:
      "Maximum dollar loss accepted on any single trade, as a percentage " +
      "of account size. The app uses this + the stop distance to compute " +
      "how many shares to buy. Default 1%: with $1,000 account, max risk " +
      "is $10/trade.",
  },
};
```

---

## Frontend view-model types (route state)

```typescript
// Route param schema (validated at the route boundary).
export type RunViewerParams = {
  run_id: string;
};

// State stored by the run-viewer route.
export type RunViewerState =
  | { kind: "loading" }
  | { kind: "error"; message: string; details?: string }
  | {
      kind: "ready";
      manifest: RunManifestView;
      summary: SummaryMetricsView;
      journal: JournalRowView[];
      bars: BarView[] | null;       // null when bars CSV missing
    };

// Filter state for the journal table.
export type JournalFilter =
  | "all"
  | "executed"
  | "exited"
  | "rejected"
  | "lockout"
  | "force_flat";
```

---

## Validation rules

- All numeric fields in `JournalRowView` may be `null`. The UI MUST
  render a placeholder (`—`) rather than `null` or `NaN`.
- `RunSummaryView.started_at` MUST sort newest-first in the sidebar.
- `BarView` timestamps MUST be valid ISO 8601 with timezone offset.
- `HelpContentKey` is exhaustive — adding a new tooltip requires
  adding to BOTH the union and the `HELP_CONTENT` record (TypeScript
  enforces this at compile time).
- The contract test iterates `Object.keys(HELP_CONTENT)`; every key
  MUST be present as a rendered HelpTooltip on the viewer page.
