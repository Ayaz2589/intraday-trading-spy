"""T009 — BacktestEngine.run_df equivalence (Feature 011, FR-024).

The validation engine runs hundreds of windowed evaluations, so it must operate
on a pre-loaded, date-sliced DataFrame (parse the full history once, slice per
window) instead of re-reading a CSV per evaluation. This refactor MUST be
behavior-neutral:

  A) run_df(load_bars(F))  ==  run(csv_path=F)   on the same bars
  B) run_df(full_df sliced to whole sessions S..E)  ==  run(csv of just S..E)

(B) is the real behaviour-neutrality claim: the study slices a loaded frame and
calls run_df per window, which must equal materializing a per-window CSV and
running it. Indicators reset per session_date, so slicing whole sessions cannot
bleed across windows.
"""

import pandas as pd

from intraday_trade_spy.backtest.engine import BacktestEngine
from intraday_trade_spy.config import load_config
from intraday_trade_spy.data.loader import load_bars


def _journal_dump(rows):
    return [r.model_dump(mode="json") for r in rows]


def test_run_df_matches_run_on_same_bars(default_config_path, sample_csv_path):
    cfg = load_config(default_config_path)
    eng = BacktestEngine(cfg)

    via_csv = eng.run(csv_path=sample_csv_path, output_dir=None)
    df = load_bars(sample_csv_path, market=cfg.market)
    via_df = eng.run_df(df)

    # Identical trade-by-trade behaviour and identical summary.
    assert _journal_dump(via_df.journal_rows) == _journal_dump(via_csv.journal_rows)
    assert via_df.summary.model_dump() == via_csv.summary.model_dump()

    # Fingerprint *content* matches even though the sha differs (CSV bytes vs
    # DataFrame content) — run(csv) keeps its byte-for-byte fingerprint.
    fp_csv, fp_df = via_csv.run.data_fingerprint, via_df.run.data_fingerprint
    assert fp_df.bar_count == fp_csv.bar_count
    assert fp_df.session_count == fp_csv.session_count
    assert fp_df.earliest_timestamp == fp_csv.earliest_timestamp
    assert fp_df.latest_timestamp == fp_csv.latest_timestamp


def test_run_df_slice_matches_run_over_window_csv(
    default_config_path, sample_csv_path, tmp_path
):
    cfg = load_config(default_config_path)
    eng = BacktestEngine(cfg)
    df = load_bars(sample_csv_path, market=cfg.market)

    # Window = all sessions except the first (whole-session boundary).
    sessions = sorted(df["session_date"].unique())
    assert len(sessions) >= 2, "fixture must have multiple sessions"
    window_dates = set(sessions[1:])
    window_df = df[df["session_date"].isin(window_dates)].reset_index(drop=True)

    # Materialize a CSV of exactly that window and run the legacy path on it.
    raw = pd.read_csv(sample_csv_path)
    raw_ts = pd.to_datetime(raw["timestamp"], utc=True).dt.tz_convert("America/New_York")
    raw_window = raw[raw_ts.dt.date.isin(window_dates)]
    window_csv = tmp_path / "window.csv"
    raw_window.to_csv(window_csv, index=False)

    via_slice = eng.run_df(window_df)
    via_window_csv = eng.run(csv_path=window_csv, output_dir=None)

    assert _journal_dump(via_slice.journal_rows) == _journal_dump(
        via_window_csv.journal_rows
    )
    assert via_slice.summary.model_dump() == via_window_csv.summary.model_dump()
