# Contract: Help Tooltips (Constitution VI)

Every new UI concept introduced by this feature MUST ship with an inline `<HelpTooltip>` explaining: What is this? Why does it matter? How is the app using it?

The `HelpTooltip` component already exists from Feature 003 — this contract specifies the **content** for each new concept.

## Tooltip texts

### `MFA` (Multi-Factor Authentication)
- **What is this?** A second proof of identity beyond your email — a 6-digit code from an authenticator app (or a backup code you saved).
- **Why does it matter?** Email accounts get compromised. With MFA on, someone needs your phone too. This app stores financial research; we want a second lock.
- **How is the app using it?** We require MFA enrollment on first sign-in. Every subsequent sign-in asks for your authenticator's 6-digit code after your email code.

### `TOTP` (Time-based One-Time Password)
- **What is this?** The 6-digit code that rotates every 30 seconds in apps like Google Authenticator or 1Password.
- **Why does it matter?** TOTP is one of the strongest second factors short of a hardware key. It's deterministic, offline, phishing-resistant if you check the URL before typing.
- **How is the app using it?** Your authenticator app holds a secret we shared with you during enrollment. Each time you sign in, the app gives you the current 30-second code; you type it in to prove you have the phone.

### `OTP` (One-Time Password — email code)
- **What is this?** A 6-digit code we email you to verify the sign-in attempt. Different from your authenticator's TOTP code.
- **Why does it matter?** It proves you control the email address. Without it, anyone who knows your email could request access.
- **How is the app using it?** First step of every sign-in. We send a code to your email; you type it back here. After that we can verify your authenticator (TOTP) for the second factor.

### `Backup codes`
- **What is this?** 8 single-use codes generated during MFA enrollment. Each one can be used in place of your authenticator's TOTP code, once.
- **Why does it matter?** If you lose your phone, you can still sign in. Without backup codes, a lost phone means a locked account.
- **How is the app using it?** We show them once during MFA enrollment. Save them somewhere safe (password manager, paper). When you use one, it's consumed — you can't reuse it.

### `Session`
- **What is this?** Your signed-in identity in this browser. Created when you sign in; cleared when you sign out.
- **Why does it matter?** It's what we check to know it's still you on each request. If your session expires (lapse, sign-out elsewhere, server-side revocation), you'll be sent back to sign-in.
- **How is the app using it?** Stored in your browser. Refreshes silently while you're active. Lives ~1 hour for the access token, ~30 days for the refresh token unless revoked.

### `Saved config`
- **What is this?** A named bundle of backtest parameters — risk limits, opening-range minutes, max trades per day, etc. You pick one when starting a backtest.
- **Why does it matter?** It lets you re-run experiments deterministically and compare results across runs that used identical parameters.
- **How is the app using it?** We seed a `default` config the first time you sign in. You can add more configs later via the CLI (Feature 005) or the API (Feature 006). The UI lists them when you start a backtest.

### `Strategy registry`
- **What is this?** The catalog of available backtest strategies. Today there's one: `VWAP Pullback (Long)`. Tomorrow there might be more.
- **Why does it matter?** Picking a strategy is the first decision in any backtest. The registry is the source of truth for what strategies your backtest engine knows how to run.
- **How is the app using it?** The strategy selector reads from this list. When the backend adds a new strategy, it appears here on your next page load — no UI change needed.

### `Backtest queue`
- **What is this?** Your in-flight backtests. The system caps you at 5 simultaneous runs so the backend stays responsive for everyone.
- **Why does it matter?** If you click "Start Backtest" 6 times in a row, the 6th one is refused (until one of the others finishes). This prevents accidental denial-of-service against your own cloud project.
- **How is the app using it?** We show your queue at the top of the runs list. The "Start Backtest" button is disabled if you're already at the cap.

### `Run status` (queued / running / finished / failed)
- **What is this?** Where your backtest is in its lifecycle. Queued = accepted, not yet started. Running = engine is replaying bars. Finished = results are queryable. Failed = something went wrong; check the failure reason.
- **Why does it matter?** Lets you know what to expect: queued/running might still complete; finished is ready to inspect; failed needs your attention.
- **How is the app using it?** The status flips automatically as your run progresses. We poll every second while it's in flight and every 30 seconds once it's done.

### `Cloud push`
- **What is this?** The act of uploading a backtest run's results to our cloud database. Distinct from running the backtest locally and viewing the output on disk.
- **Why does it matter?** It's how you build durable, queryable history across devices. Without a cloud push, your run lives only in `backend/data/backtests/<run-id>/`.
- **How is the app using it?** Every backtest you start through this UI pushes automatically (it's the only way to make a run visible here). The CLI (Feature 005) also supports an opt-in `--push-to-supabase` flag for local runs.

### `Data-download job`
- **What is this?** An asynchronous fetch of historical SPY 5-minute bars from Yahoo Finance for a date range you specify. The result is stored in our shared bars cache.
- **Why does it matter?** Your backtests need historical data to replay. Instead of running a CLI to fetch data, you submit a job here; we run yfinance for you and put the result somewhere your next backtest can use it.
- **How is the app using it?** The data panel shows your download jobs and their status. On completion, the downloaded date range becomes selectable in the "Start Backtest" dialog.

### `Connection status`
- **What is this?** The colored dot in the topbar. Green = the backend is reachable. Red = we can't reach the backend right now.
- **Why does it matter?** If the dot is red, your actions that need the backend (starting a backtest, fetching data) will fail. Knowing this BEFORE clicking saves frustration.
- **How is the app using it?** We poll the backend's health endpoint every 10 seconds. The dot reflects the most recent result.

## Test obligation (SC-008)

A structural test in `frontend/src/__tests__/help-tooltips.test.tsx` walks every "concept label" in the rendered UI (a curated list matching this contract) and asserts that each one is paired with a `<HelpTooltip>` in its parent tree. Adding a new concept without a tooltip should fail this test.

## Maintenance

When a future feature adds a new concept, that feature's plan + contracts MUST include an entry here (or a successor file). PR review for UI labels rejects unfamiliar concept text without a tooltip.
