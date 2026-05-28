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
  | "risk_per_trade";

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
};
