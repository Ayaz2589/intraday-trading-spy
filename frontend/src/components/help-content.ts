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
  | "data_source"
  // Feature 010 (honest backtest) concepts
  | "slippage"
  | "fees"
  | "expectancy"
  | "sharpe"
  | "sortino"
  | "drawdown_money"
  | "drawdown_pct"
  | "return_distribution"
  | "equity_curve"
  | "per_bucket"
  | "confidence_interval"
  | "sample_size"
  // Feature 011 (validation engine) concepts
  | "walk_forward"
  | "in_sample"
  | "out_of_sample"
  | "is_oos_gap"
  | "parameter_sensitivity"
  | "plateau_vs_peak"
  | "bootstrap_ci"
  | "permutation_test"
  | "lockbox"
  | "burned_lockbox"
  // Feature 012 (config management) concepts
  | "active_config"
  | "duplicate_vs_edit"
  | "delete_safe"
  | "buying_power"
  // Feature 013 (data observability) concepts
  | "cache_heatmap"
  | "backfill_job_history"
  | "data_lineage"
  // Feature 014 (study child-run persistence) concepts
  | "child_run"
  | "study_drilldown"
  | "rerun_study"
  // Feature 015 (Monte Carlo path-risk) concepts
  | "monte_carlo_simulation"
  | "shuffle_method"
  | "max_drawdown_distribution"
  | "losing_streak"
  | "underwater_period"
  | "mc_iterations_seed"
  | "forward_cone"
  | "risk_of_ruin"
  | "mc_in_sample_caveat"
  // Feature 016 (insights) concepts
  | "pooled_gate"
  | "sign_test"
  | "fisher_combined"
  | "edge_timeseries"
  | "window_distribution"
  | "claude_advisory"
  | "snapshot_pin"
  // Feature 017 (claude experiment drafts) concepts
  | "claude_experiment_draft"
  // Feature 018 (recommendation engine) concepts
  | "health_verdict"
  | "recommendation_classes"
  | "evidence_pack"
  | "trial_count";

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
      "Maximum dollar value of any single position, as a percentage of account size. Prevents one trade from putting the whole account at risk. For an intraday strategy the default is 400% — 4x intraday buying power (see Buying power). Too low a cap (e.g. 100%) makes the risk-based size exceed the cap so nearly every signal is rejected and you get 0 trades.",
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
      "Runs are created by validation studies (each evaluation is saved already-finished or failed) and by CLI pushes. A run's status moves queued → running → finished (or failed — `failure_reason` explains why). Refresh cadence speeds up while anything is active and slows down once it finishes.",
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
  slippage: {
    title: "Slippage",
    description:
      "The gap between the price you expected and the price you actually got. Real fills are slightly worse than the quote — you buy a hair higher and sell a hair lower. The backtest models this as a fixed adverse amount per share on both entry and exit, so PnL reflects reality instead of perfect fills.",
  },
  fees: {
    title: "Fees / commissions",
    description:
      "The broker's per-share charge on each side of a trade. Our execution broker is commission-free for equities (so the default is $0), but the knob exists so other cost assumptions can be modeled. Fees are deducted from every trade's PnL.",
  },
  expectancy: {
    title: "Expectancy",
    description:
      "The average amount you expect to make per trade: (win% × average win) − (loss% × average loss). It's the single best 'is there an edge?' number — positive means the system makes money on average after costs, negative means it bleeds. Shown in R (risk units) and dollars.",
  },
  sharpe: {
    title: "Sharpe ratio",
    description:
      "Risk-adjusted return: average daily return divided by its volatility, annualized. Higher is better — it rewards smooth equity growth and penalizes wild swings. It lets you compare strategies that make the same money but with very different ride quality.",
  },
  sortino: {
    title: "Sortino ratio",
    description:
      "Like Sharpe, but it only counts downside volatility in the denominator. Upside swings shouldn't be 'penalized' as risk, so Sortino judges return against the kind of volatility that actually hurts — drawdowns. Undefined when there are no losing days.",
  },
  drawdown_money: {
    title: "Max drawdown ($)",
    description:
      "The largest peak-to-trough drop in account equity over the run, in dollars. It answers 'what's the worst losing stretch I'd have had to sit through?' — which drives position sizing and whether you could psychologically survive trading this.",
  },
  drawdown_pct: {
    title: "Max drawdown (%)",
    description:
      "The same worst peak-to-trough drop, expressed as a percentage of account equity. Because it's scale-invariant, it's the figure to compare across account sizes and strategies — a 20% drawdown means the same thing at $5k or $5M.",
  },
  return_distribution: {
    title: "Return distribution",
    description:
      "How individual trade results are spread out: the median (typical trade), the standard deviation (how much they vary), and the skew (whether a few big winners or losers dominate). It reveals whether an edge is broad and reliable or propped up by a handful of lucky trades.",
  },
  equity_curve: {
    title: "Equity curve",
    description:
      "Your account value plotted across the sequence of trades, starting from the configured account size. A steady climb is healthy; deep dips show the drawdowns you'd have lived through. The shape matters as much as the endpoint.",
  },
  per_bucket: {
    title: "Per-bucket performance",
    description:
      "Trade results grouped by hour of day, weekday, and month. It shows where an edge actually lives or breaks — e.g. strong in the first hour, weak midday. Useful for understanding the strategy, but slicing thin invites overfitting, so treat small buckets with suspicion.",
  },
  confidence_interval: {
    title: "Confidence interval",
    description:
      "A range that the true win rate is likely to fall within, given how many trades we've seen. With few trades the range is wide (the number is mostly noise); with many it tightens. A 60% win rate on 8 trades and on 800 trades mean very different things — this shows which.",
  },
  sample_size: {
    title: "Sample size (N)",
    description:
      "How many trades a result is based on. Small samples are dominated by luck — an '83% win rate on 6 trades' is a coin-flip story. We flag results below a threshold as low-confidence so a tiny sample is never mistaken for a real, durable edge.",
  },
  // Feature 011 (validation engine)
  walk_forward: {
    title: "Walk-forward",
    description:
      "Tune on one window of history, then measure on the very next window you did NOT look at — and roll that forward across the data. It's the closest thing to forward testing you can do on past data, and the cleanest way to tell a real edge from one fit to noise.",
  },
  in_sample: {
    title: "In-sample (IS)",
    description:
      "Performance over the training window — the data the config was chosen on. It is optimistic by construction: a config always looks at least decent on the data used to pick it. Judge an edge by out-of-sample, not this.",
  },
  out_of_sample: {
    title: "Out-of-sample (OOS)",
    description:
      "Performance over the window immediately after the training window — data the config never saw. This is the honest number. An edge that holds up out-of-sample is the only kind worth trading.",
  },
  child_run: {
    title: "Child run",
    description:
      "A real, saved backtest produced by one evaluation inside a validation study — one walk-forward window, one sensitivity grid point, or the lockbox one-shot. It has the same trades, journal, and chart as any standalone run, so you can see exactly WHY that slice performed the way it did. Child runs appear in the Backtests list with an origin badge (kind · IS/OOS · window) and are also reachable through their study.",
  },
  study_drilldown: {
    title: "Study drill-down",
    description:
      "Aggregates can hide what actually happened. Each window row expands into its in-sample / out-of-sample pair, and 'View run' opens that evaluation's full backtest — trades, journal, chart, and significance testing. Studies run before this feature shipped have no saved evaluations; re-run the study to get a drillable version.",
  },
  rerun_study: {
    title: "Re-run study",
    description:
      "Starts a brand-new study with exactly the same kind, config, and parameters as this one — no tweaking, no re-optimization. The engine and data are deterministic, so the results should reproduce; the new study also saves every evaluation as a drillable child run. The original study is never modified.",
  },
  is_oos_gap: {
    title: "In-sample vs out-of-sample gap",
    description:
      "How much worse the out-of-sample result is than the in-sample one (OOS − IS). A small gap means the edge generalizes; a large drop means the config was fit to the noise of the training window — the classic overfitting signature.",
  },
  parameter_sensitivity: {
    title: "Parameter sensitivity",
    description:
      "How performance changes as you nudge a knob across a range of values. We evaluate an explicit grid of values and plot the result, so you can see whether the edge is stable or fragile to small changes.",
  },
  plateau_vs_peak: {
    title: "Plateau vs spike",
    description:
      "On the sensitivity surface, prefer a broad PLATEAU — a block of neighboring values that all work — over a lone SPIKE that only works at one exact setting. A plateau is a robust edge; a spike is usually a config fit to noise that will not survive live.",
  },
  bootstrap_ci: {
    title: "Bootstrap confidence interval",
    description:
      "Resample your own trades (with replacement) thousands of times to see how much a metric like expectancy could have varied by luck. The resulting range is the confidence interval — if it comfortably excludes zero, the edge is less likely to be a fluke.",
  },
  permutation_test: {
    title: "Permutation / Monte-Carlo test",
    description:
      "Asks: could random entries — under the SAME session rules, stop/target geometry, and costs — have produced this result? We build a null distribution from random-entry runs; the p-value is the fraction that did at least as well. p < 0.05 means random timing rarely matches you, so your entry timing likely has real edge.",
  },
  monte_carlo_simulation: {
    title: "Monte Carlo path risk",
    description:
      "Your equity curve is just ONE ordering of your trades — stats like max drawdown depend heavily on that order. This panel resamples your run's real trades thousands of times (seeded, so results are exactly reproducible) to show the RANGE of paths your edge could have produced. It answers 'how bad could it get?', not 'is the edge real?' — that's the significance panel's job.",
  },
  shuffle_method: {
    title: "Reshuffle (path risk)",
    description:
      "Take the exact trades this run produced and shuffle their ORDER thousands of times. Every shuffle ends at the same final P&L (same trades!) — but the drawdowns, losing streaks, and time underwater along the way differ. If your observed drawdown sits near the unlucky tail of the distribution, your smooth curve was partly ordering luck.",
  },
  max_drawdown_distribution: {
    title: "Max drawdown distribution",
    description:
      "Max drawdown is the deepest peak-to-trough drop in equity. Across reshuffles you get a distribution: P50 is the typical ordering, P95 the unlucky tail. The dot on the strip marks YOUR actual run — compare it to P95 before deciding whether you could stomach this strategy live.",
  },
  losing_streak: {
    title: "Longest losing streak",
    description:
      "The most consecutive losing trades in a row. Streaks drive abandonment more than total loss does — a strategy you quit during a normal streak is worse than no strategy. The distribution shows what streak lengths are NORMAL for these trades, so a live streak inside the P95 range is expected, not broken.",
  },
  underwater_period: {
    title: "Underwater period",
    description:
      "How many consecutive trades equity spent below its previous high-water mark. Long underwater stretches feel like the strategy is dead even when nothing is wrong. The reshuffle distribution shows how long recovery typically takes with these exact trades, counted in trades (not days).",
  },
  mc_iterations_seed: {
    title: "Iterations & seed",
    description:
      "Iterations = how many simulated paths were generated (from config, default 2,000). The seed fixes the random number generator, so the same run + same settings reproduce every number byte-for-byte — nothing is stored; the result is recomputed on demand and always lands on the same answer.",
  },
  forward_cone: {
    title: "Forward projection cone",
    description:
      "Draw trades at random (with replacement) from this run's real trade distribution and walk forward — thousands of times. The shaded bands show where equity landed in 50% (dark) and 90% (light) of simulated futures; the line is the median path. Wide cone = high outcome uncertainty. It assumes the future behaves like this sample, so treat it as a range of plausibility, not a forecast.",
  },
  risk_of_ruin: {
    title: "Risk of ruin",
    description:
      "Across all simulated forward paths, the fraction where equity dipped below your STARTING account value by at least each threshold — at any point, even if it recovered later. A 12% chance of a −10% dip means roughly 1 in 8 futures touches that pain level. Pick the threshold you genuinely couldn't stomach and check its probability before trading a strategy forward.",
  },
  mc_in_sample_caveat: {
    title: "In-sample caveat",
    description:
      "These trades came from data the strategy's settings were tuned against (or that can't be proven otherwise), so the edge — and therefore every risk estimate built on it — is likely overstated. Only walk-forward validation windows and the lockbox run are provably out-of-sample. Use those for the honest version of these numbers.",
  },
  pooled_gate: {
    title: "Pooled study gate",
    description:
      "Pools every out-of-sample window's trades into ONE statistical verdict: does the pooled expectancy confidence interval exclude zero? This is the pre-registered precondition for spending the lockbox — if the CI includes zero, the edge can't be distinguished from luck and the lockbox stays sealed. Seeded, so re-running reproduces the verdict exactly.",
  },
  sign_test: {
    title: "Sign test (windows positive)",
    description:
      "Ignores magnitudes and asks a blunt question: if the strategy had no edge, how often would at least this many windows end positive by coin-flip? 9 of 12 positive gives p ≈ 0.073 — suggestive, not conclusive. A robust edge should win most windows, not just a few big ones.",
  },
  fisher_combined: {
    title: "Fisher's combined p-value",
    description:
      "Combines the per-window permutation p-values into one number testing 'no edge in ANY window'. A tiny combined p (like 1e-8) with a failing pooled CI means the edge is REAL but REGIME-DEPENDENT — some windows beat chance decisively while others bleed it back. That points to filtering research, not more testing.",
  },
  edge_timeseries: {
    title: "Edge time-series",
    description:
      "One point per out-of-sample window across the whole archive, per config. A stable edge plots as points consistently above zero; a regime-bound edge alternates — exactly what failed the wf-rr3 gate. Defaults to Expectancy R because raw $ is meaningless across configs run at different account sizes; shaded bands mark labeled market regimes. Click any point to drill into that window's full run.",
  },
  window_distribution: {
    title: "Per-config window distribution",
    description:
      "Compares configs window-by-window instead of by one pooled number: how many windows ended positive, and the quartiles of window outcomes. Two configs can pool similarly but distribute very differently — the one that wins MORE windows with SHALLOWER losers is the more livable edge.",
  },
  claude_advisory: {
    title: "Claude's read (advisory)",
    description:
      "An LLM's narrative perspective on YOUR already-computed statistics. It is strictly advisory: it never trades, never tunes knobs, and is outside the strategy → risk → broker path. Every claim must cite the metric backing it — the app renders that metric's real value beside the claim so hallucinated numbers are immediately visible. Treat it as a skeptical colleague, not an authority.",
  },
  snapshot_pin: {
    title: "Snapshot pinning",
    description:
      "Each analysis is stored with a hash of the exact data it analyzed. Re-opening the page shows the stored analysis free of charge; regeneration only makes sense (and is only enabled) when the underlying data actually changed. Unlike the seeded gate numbers, LLM output is NOT deterministic — the pin tells you exactly which data a narrative described.",
  },
  claude_experiment_draft: {
    title: "Drafted from Claude's experiment",
    description:
      "Claude suggested this experiment as concrete knob changes; the app validated every suggestion against the registered tunable knobs and their bounds BEFORE you ever saw it. Claude only suggests — nothing is created, activated, or run until YOU review the values and click Create, through the exact same form and validation as a hand-made config. The created config records where it came from.",
  },
  health_verdict: {
    title: "Config health verdict",
    description:
      "A deterministic judgment of whether this config is still earning its keep out-of-sample: ok, degrading (recent validation windows fell below the config's own archive baseline), failing (the pooled gate failed AND recent windows are non-positive), or insufficient evidence (too few windows to say anything). It is computed purely from stored results with published thresholds — no AI involved — and recomputing against unchanged data always yields the same verdict. Hover the badge for the exact numbers behind it.",
  },
  recommendation_classes: {
    title: "Recommendation classes",
    description:
      "Recommendations come in three honest flavors. A knob change is a setting the archive has actually measured (a sensitivity plateau or another config's matched-window result) — never an untested invention. Gather evidence means the data to justify a change doesn't exist yet, and names the study to run. Stop tuning fires when every config in the family failed its pooled gate: more knob-turning won't conjure an edge that isn't there. Every recommendation is a hypothesis for the validation machinery — nothing is ever applied automatically.",
  },
  evidence_pack: {
    title: "Evidence pack",
    description:
      "The bundle of already-stored results a recommendation is computed from: this config's out-of-sample windows, matched-window comparisons against sibling configs, sensitivity-sweep neighborhoods, per-regime results, pooled-gate intervals, and how many variants were already tried. It is assembled read-only — no new backtests run — and pinned to a snapshot fingerprint so you always know which data a recommendation (or Claude's narrative about it) described.",
  },
  trial_count: {
    title: "Trial count (data snooping)",
    description:
      "How many recommendation-originated config variants have already been tried against this same out-of-sample archive. Why it matters: every time you tune, test, and re-tune against the same data, the 'out-of-sample' label quietly stops being true — with enough tries, something will look good by luck alone. The ledger survives config deletion, feeds back into the evidence Claude reads, and the lockbox stays sealed as the final arbiter no recommendation can touch.",
  },
  lockbox: {
    title: "Lockbox",
    description:
      "A slice of the most recent history held completely out of sight while you research. You spend it exactly once: run your single frozen candidate on it. Because you never tuned against it, that one result is an honest final check before risking anything forward.",
  },
  burned_lockbox: {
    title: "Burned / contaminated lockbox",
    description:
      "Once you run a SECOND, different config against the lockbox, it is no longer untouched — you've started fitting to it. The system blocks this by default; doing it deliberately permanently marks the lockbox 'burned', and its results can no longer be trusted as a clean out-of-sample test.",
  },
  active_config: {
    title: "Active config",
    description:
      "Exactly one of your saved configs is the 'active' one. It's pre-selected wherever you pick a config — start backtest, new study, lockbox — so you don't have to re-choose each time. Setting another config active just changes that default; it never edits any config's knobs.",
  },
  duplicate_vs_edit: {
    title: "Duplicate vs. edit",
    description:
      "Editing changes a config's knobs in place — every future run that picks it uses the new values (past runs keep their own snapshot, so they're unaffected). Duplicate makes a separate named copy so you can change one knob and compare A vs. B side by side. Research = duplicate then tweak; fixing a typo = edit.",
  },
  delete_safe: {
    title: "Why deleting is safe",
    description:
      "Deleting a config never corrupts run history. Every past run stored its own full copy of the knobs it ran with (a snapshot), so those results stay intact and readable — the run simply no longer links to a live config. You can't delete your last remaining config.",
  },
  buying_power: {
    title: "Intraday buying power",
    description:
      "A pattern-day-trader account can take intraday positions up to 4x its cash (then must close them by the session end — no overnight). That's why the position cap defaults to 400%: it reflects standard 4x day-trading buying power so the strategy can size a realistic intraday position while the per-trade-risk and daily-loss limits still bind.",
  },
  cache_heatmap: {
    title: "Cache completeness chart",
    description:
      "Each bar is one month of your price-history stockpile (height = trading days cached): green = every NYSE trading day is cached, orange = some days are missing (hover to see exactly which), blue = the current month (judged only against days that have already happened), grey = not cached / in the future. Market holidays and half-days are already excluded — so any day listed as missing is a REAL gap you could backfill.",
  },
  backfill_job_history: {
    title: "Backfill job history",
    description:
      "Every 'Backfill history' click becomes a job: the requested date range is split into ~monthly windows, each fetched and added to the cache. Duplicates are skipped, so re-running over data you already have adds ~0 bars — that's the healthy outcome, not an error. Failed jobs stay listed with their reason so you can see what went wrong even after a later job succeeds.",
  },
  data_lineage: {
    title: "What this data feeds",
    description:
      "A quick link between the data and the research built on it: how many backtests and validation studies have run against this cache, and when the most recent one ran. Counts match the Runs page. Deeper per-run lineage (which exact dates each run consumed) is planned for the insights feature.",
  },
};
