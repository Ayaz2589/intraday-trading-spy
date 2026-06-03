export type HelpContent = {
  title: string;
  description: string;
};

// 14 concepts. "daily_drawdown" intentionally absent — the backend
// SummaryMetrics doesn't track per-day drawdown separately, only
// run-wide max_drawdown_r. See analyze finding M6 for context.
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
  | "risk_per_trade"
  | "layout_mode"
  | "show_rejections"
  | "otp"
  | "session"
  | "saved_config"
  | "strategy_registry"
  | "backtest_queue"
  | "run_status"
  | "cloud_push"
  | "data_download_job"
  | "connection_status"
  | "data_coverage"
  | "regime_completeness"
  | "backfill"
  | "data_source";

export const HELP_CONTENT: Record<HelpContentKey, HelpContent> = {
  vwap: {
    title: "VWAP",
    description:
      "Volume-weighted average price for the current trading session. It resets at the open each day and acts as an intraday fair-value reference. The strategy only looks for long setups when price is above VWAP.",
  },
  opening_range: {
    title: "Opening Range",
    description:
      "The high and low of the first 15 minutes of the session (09:30–09:45 ET). Traders watch it because breaks above or below it can signal early directional bias. The strategy will not consider signals until the opening range is complete.",
  },
  r_multiple: {
    title: "R Multiple",
    description:
      "The trade's outcome in units of initial risk. +2R means the trade made twice what was risked; -1R means a full-stop loss. Used to compare trades on equal footing regardless of share count.",
  },
  profit_factor: {
    title: "Profit Factor",
    description:
      "Total R gained on winning trades divided by the absolute total R lost on losing trades. Above 1.0 = profitable; the higher, the more dollar-per-dollar effective the strategy was. The app computes this over all completed trades in this run.",
  },
  max_drawdown: {
    title: "Max Drawdown",
    description:
      "The largest peak-to-trough decline in cumulative R during the run. Tells you the worst losing streak this strategy endured. Smaller (closer to 0) is better.",
  },
  win_rate: {
    title: "Win Rate",
    description:
      "Percentage of trades that hit their take-profit target. Force-flat exits are not counted as wins or losses for this percentage; only decisive target/stop outcomes count.",
  },
  rejected_signal: {
    title: "Rejected Signal",
    description:
      "The strategy detected a valid setup but the risk manager blocked the trade. This is GOOD — it means the safety rules are working. Every rejection includes a rejection_check explaining which rule fired.",
  },
  position_cap: {
    title: "Position Cap",
    description:
      "Maximum dollar value of any single position, as a percentage of account size. Prevents one trade from putting the whole account at risk. Default 25%: with $1,000 account, max position is $250.",
  },
  cooldown: {
    title: "Cooldown",
    description:
      "Mandatory waiting period after a losing trade before the strategy may take another trade. Designed to prevent revenge trading. Default 30 minutes.",
  },
  lockout: {
    title: "Lockout",
    description:
      "All trading is blocked for the remainder of the session. Triggered when the daily loss limit is hit or consecutive losses cross the threshold. Resets at the next session.",
  },
  force_flat_exit: {
    title: "Force-Flat Exit",
    description:
      "Any open position is closed before market close, regardless of stop/target. The app uses 15:55 ET by default — five minutes before the close — to ensure no overnight exposure.",
  },
  take_profit: {
    title: "Take-Profit",
    description:
      "Pre-planned exit price if the trade works. The strategy computes it from the entry, the stop, and the configured risk:reward ratio (default 2:1).",
  },
  stop_loss: {
    title: "Stop-Loss",
    description:
      "Pre-planned exit price if the trade is wrong. NO trade is allowed without a stop — this is a NON-NEGOTIABLE rule. The strategy places the stop just below the pullback low.",
  },
  risk_per_trade: {
    title: "Risk per Trade",
    description:
      "Maximum dollar loss accepted on any single trade, as a percentage of account size. The app uses this plus the stop distance to compute how many shares to buy. Default 1%: with $1,000 account, max risk is $10/trade.",
  },
  layout_mode: {
    title: "Layout Mode",
    description:
      "Overview puts the three summary cards above the chart; Chart focus puts the chart on top with the cards as a three-column row below. Your choice persists across reloads via localStorage.",
  },
  show_rejections: {
    title: "Show rejections on chart",
    description:
      "Marks every bar where the strategy emitted a signal that the risk manager blocked. Consecutive bars sharing the same rejection check collapse into one tag like 'Rej · ×N'. Helps answer 'why didn't this fire?' visually.",
  },
  otp: {
    title: "Email sign-in code",
    description:
      "A one-time, 8-digit code that Supabase emails to you to prove you control the inbox. It expires in 60 minutes. Enter it back into the sign-in form to start a session. No password is ever stored.",
  },
  session: {
    title: "Session",
    description:
      "Your signed-in state. Lives in browser storage as an access token (good for ~1 hour) + a refresh token (used to renew silently). Signing out clears both. If you sign out in another tab, this tab signs out within a heartbeat too.",
  },
  saved_config: {
    title: "Saved config",
    description:
      "A named bundle of strategy + risk knobs (`default`, custom names, etc.). Backtests reference a config by name so you can compare strategy parameter changes without losing prior runs.",
  },
  strategy_registry: {
    title: "Strategy registry",
    description:
      "The list of strategies the backend will let you backtest. Each entry encodes its symbol (SPY-only in v1), direction (long-only in v1), and kind (rule-based in v1). Adding a strategy is a backend code + migration change — the UI just renders whatever is enabled.",
  },
  backtest_queue: {
    title: "Backtest queue",
    description:
      "When you click Start Backtest the run is created with status `queued`. The backend picks it up and transitions it to `running` → `finished` (or `failed`). Refresh cadence speeds up while a run is active and slows down once it finishes.",
  },
  run_status: {
    title: "Run status",
    description:
      "A run is one of four states: queued (waiting for the worker), running (executing the strategy bar-by-bar), finished (results ready), or failed (an error stopped the run; `failure_reason` explains why).",
  },
  cloud_push: {
    title: "Cloud push",
    description:
      "Local CLI runs are uploaded to the same Supabase project so they appear in this web UI alongside backtests started here. The CLI flag is `--push-to-supabase`. Use it when you want your terminal experiment to share the same run history.",
  },
  data_download_job: {
    title: "Data-download job",
    description:
      "A background task that fetches a historical date range from yfinance and stores it as a CSV in Supabase Storage. Once finished, that CSV is selectable as the data source for new backtests.",
  },
  connection_status: {
    title: "Connection status",
    description:
      "A green dot means the backend API is reachable and its database connection is healthy. Red means a recent call to /healthz failed — usually a network blip or the API container being redeployed. Backtests may queue up until it returns.",
  },
  data_coverage: {
    title: "Data coverage",
    description:
      "The span of SPY 5-minute bars currently cached (earliest → latest). Every backtest is only as trustworthy as the data underneath it: a strategy 'edge' measured on a thin slice of history is usually just noise. Coverage tells you, at a glance, how much history your results actually stand on.",
  },
  regime_completeness: {
    title: "Regime completeness",
    description:
      "What fraction of a market regime's expected trading sessions (NYSE calendar, holidays excluded) are actually in the cache. A regime counts as 'covered' at ≥90%. Why it matters: a strategy that only works in one regime (e.g. a 2021 bull run) is fragile — you want it tested across volatility, bull, bear, and chop. Below 90% shows as a gap to backfill.",
  },
  backfill: {
    title: "Backfill",
    description:
      "A background job that loads years of historical SPY bars from Alpaca into the cache, window by window. It's idempotent (re-running adds nothing already stored) and shows live progress. Run it once to turn a 60-day sample into a multi-year, multi-regime one — the foundation for honest backtesting.",
  },
  data_source: {
    title: "Data source",
    description:
      "Where a cached bar came from. Alpaca supplies the multi-year history (free tier = IEX feed); yfinance fills only the most recent days Alpaca hasn't served yet. When both have the same timestamp, the backtest uses exactly one bar (Alpaca preferred) so nothing is double-counted.",
  },
};
