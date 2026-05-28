# Quickstart: Historical SPY Loader

Assumes Feature 001 is already installed (see
`specs/001-backtest-mvp-spy-vwap-pullback/quickstart.md`).

## 1. Pull the yfinance dependency

```bash
cd backend
source .venv/bin/activate          # the venv from Feature 001
pip install -e ".[dev]"            # re-install picks up yfinance>=0.2.40
python -c "import yfinance; print(yfinance.__version__)"
```

## 2. Run the test suite offline (default)

```bash
pytest -m "not slow"
```

Expected: all tests green, no network calls. The session-scope
socket-blocker fixture enforces this.

## 3. Run the one slow integration test (opt-in, hits real yfinance)

```bash
pytest -m slow
```

Expected: makes one real yfinance call, asserts the resulting CSV
loads via Feature 001's `load_bars()`.

## 4. Download a date range

```bash
python -m intraday_trade_spy.cli.download_spy_data \
    --start 2026-04-01 --end 2026-05-28
```

You should see:

1. `Resolved range: 2026-04-01 → 2026-05-28 (5m)`
2. Optional progress line per chunk (none here — under 60 days).
3. (Possible) `Dropped N rows with NaN/zero volume.`
4. `Wrote <bar_count> bars to backend/data/raw/spy_5m_2026-04-01_2026-05-28.csv`
5. `Wrote manifest to backend/data/raw/spy_5m_2026-04-01_2026-05-28.csv.fetch.yaml`

## 5. Verify provenance

```bash
cat backend/data/raw/spy_5m_2026-04-01_2026-05-28.csv.fetch.yaml
sha256sum backend/data/raw/spy_5m_2026-04-01_2026-05-28.csv
```

The `output_sha256` field in the YAML should match the `sha256sum`
output exactly.

## 6. Run a backtest against the downloaded data

```bash
python -m intraday_trade_spy.cli.run_backtest \
    --config backend/config/config.yaml \
    --data backend/data/raw/spy_5m_2026-04-01_2026-05-28.csv
```

Feature 001's CLI consumes the CSV with no modifications and writes
the usual journal + summary + run.yaml.

## 7. Try a chunked range

```bash
python -m intraday_trade_spy.cli.download_spy_data \
    --start 2026-01-01 --end 2026-04-30
```

Expected: stdout shows two chunk-fetch progress lines (each ≤60 days).
Final CSV is one continuous, deduplicated, sorted file.

## Troubleshooting

- **`ValueError: start ... is older than yfinance's 730-day history
  limit`** — your `--start` is too far back for yfinance's 5m
  endpoint. Pick a more recent date.
- **`OutputExistsError: ...` / exit code 2** — pass `--force` to
  overwrite, or pick a different `--out`.
- **`YFinance error: 429 ...` / exit code 5** — yfinance is
  rate-limiting. Wait a minute and retry. The downloader already
  retries once internally.
- **Tests fail with `RuntimeError: network access blocked in offline
  test`** — a test other than the `slow` integration test attempted a
  network call. Mock at the `yfinance.download` boundary.
