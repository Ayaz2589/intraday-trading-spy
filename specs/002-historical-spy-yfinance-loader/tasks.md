---
description: "Task list for Historical SPY Loader — yfinance Downloader (Feature 002)"
---

# Tasks: Historical SPY Loader — yfinance Downloader

**Input**: Design documents from `/specs/002-historical-spy-yfinance-loader/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`,
`contracts/*`, `quickstart.md`. Constitution v1.1.0 at
`.specify/memory/constitution.md`.

**Tests**: MANDATORY per constitution principle IV (Test-First
Everywhere, v1.1.0) for every task touching
`backend/src/intraday_trade_spy/data/downloader.py` and
`backend/src/intraday_trade_spy/cli/download_spy_data.py`. The only
exempt new file is `backend/scripts/download_spy_data.py` (3-line
wrapper, exempt per the principle's exempt list).

**Organization**: Tasks are grouped by phase. Within Phases 3–7, tasks
also carry the user-story tag (`[US1]` … `[US5]`).

**Task IDs**: Continuous with Feature 001 — this file starts at T071.

## TDD micro-cycle convention

For each implementation task whose target is under
`backend/src/`, the preceding `Test:` task contains the failing test.
Each task runs:

1. Write the failing test
2. Run `pytest <node>` and verify it fails
3. Write minimal implementation
4. Run `pytest <node>` and verify it passes
5. Commit

---

## Phase 1: Setup

**Purpose**: Add yfinance, the `slow` pytest marker, and the offline
test discipline (mock fixture + socket blocker). No production logic
yet.

- [ ] T071 Modify `backend/pyproject.toml` to add `yfinance>=0.2.40` to the `[project] dependencies` list, and add the `slow` marker plus a `markers` config under `[tool.pytest.ini_options]`. Diff:
  ```toml
  [project]
  dependencies = [
      "pydantic>=2.6",
      "pyyaml>=6.0",
      "pandas>=2.2",
      "python-dateutil>=2.9",
      "yfinance>=0.2.40",   # NEW
  ]

  [tool.pytest.ini_options]
  addopts = "-ra --strict-markers"
  testpaths = ["tests"]
  markers = [               # NEW block
      "slow: opt-in tests that hit the real yfinance API (deselect with -m 'not slow')",
  ]
  ```
  Re-install dependencies: `cd backend && pip install -e ".[dev]"`. Verify `python -c "import yfinance; print(yfinance.__version__)"` succeeds.

- [ ] T072 Test: in `backend/tests/conftest.py`, add a session-scope autouse socket-blocker fixture (the test for it is in Phase 7 T117). Surface area:
  ```python
  # ... existing imports/fixtures ...
  import socket
  import pytest

  @pytest.fixture(autouse=True)
  def _block_network(request, monkeypatch):
      """Constitution v1.1.0 + SC-005: any test not marked `slow` MUST NOT touch the network."""
      if request.node.get_closest_marker("slow"):
          return  # opt-in tests are allowed real network
      def _blocked(*args, **kwargs):
          raise RuntimeError("network access blocked in offline test (constitution v1.1.0 SC-005)")
      monkeypatch.setattr(socket, "socket", _blocked)
  ```
  No standalone test in this task — Phase 7's T117 validates it.

- [ ] T073 [P] Test: in `backend/tests/conftest.py`, add a `mock_yfinance_download` fixture that returns a deterministic synthetic DataFrame shaped like yfinance's output. Surface area:
  ```python
  from datetime import datetime
  from zoneinfo import ZoneInfo
  import numpy as np
  import pandas as pd
  import pytest

  ET = ZoneInfo("America/New_York")

  def _synth_yf_df(start: str, end: str, n_bars: int = 78) -> pd.DataFrame:
      """Mimic yfinance's intraday output: DatetimeIndex (UTC), columns Open/High/Low/Close/Adj Close/Volume."""
      idx = pd.date_range(start=f"{start}T13:30:00Z", periods=n_bars, freq="5min", tz="UTC")
      rng = np.random.default_rng(seed=42)  # deterministic
      base = 525.0
      closes = base + rng.normal(0, 0.1, size=n_bars).cumsum()
      df = pd.DataFrame({
          "Open": closes - 0.05, "High": closes + 0.10, "Low": closes - 0.10,
          "Close": closes, "Adj Close": closes, "Volume": (1_000_000 + rng.integers(0, 500_000, size=n_bars)).astype(int),
      }, index=idx)
      df.index.name = "Datetime"
      return df

  @pytest.fixture
  def mock_yfinance_download():
      def _factory(start: str, end: str, n_bars: int = 78):
          df = _synth_yf_df(start, end, n_bars)
          def _mock(tickers, interval, start, end, auto_adjust=False, progress=False, **kwargs):
              return df
          return _mock
      return _factory
  ```

**Checkpoint (Phase 1)**: `pytest --collect-only` reports no failures and the new `slow` marker is registered (no warnings about unknown marker). Verify by adding a throwaway test marked `@pytest.mark.slow` and confirming `pytest -m slow` would collect only that test.

---

## Phase 2: Foundational

**Purpose**: Build the data models (`DownloadRequest`, `FetchResult`,
`FetchManifest`) and module constants. **No user story work may begin
until this phase is complete.**

### Module constants

- [ ] T074 Test: in `backend/tests/test_downloader.py`, add:
  ```python
  from intraday_trade_spy.data.downloader import (
      MAX_CHUNK_DAYS, MAX_5M_HISTORY_DAYS, RETRY_BACKOFF_SECONDS, RETRY_MAX_ATTEMPTS,
  )

  def test_constants_have_expected_values():
      assert MAX_CHUNK_DAYS == 60
      assert MAX_5M_HISTORY_DAYS == 730
      assert RETRY_BACKOFF_SECONDS == 5
      assert RETRY_MAX_ATTEMPTS == 2
  ```
  Run — expect failure (module doesn't exist).

- [ ] T075 Implement the constants block at the top of `backend/src/intraday_trade_spy/data/downloader.py`:
  ```python
  from zoneinfo import ZoneInfo

  MAX_CHUNK_DAYS = 60
  MAX_5M_HISTORY_DAYS = 730
  RETRY_BACKOFF_SECONDS = 5
  RETRY_MAX_ATTEMPTS = 2
  ET = ZoneInfo("America/New_York")
  ```
  Run T074 — expect PASS. Commit.

### `DownloadRequest`

- [ ] T076 Test: in `backend/tests/test_downloader.py`, add:
  ```python
  from datetime import date, timedelta
  from pathlib import Path
  import pytest
  from pydantic import ValidationError
  from intraday_trade_spy.data.downloader import DownloadRequest

  def _today():
      return date.today()

  def test_download_request_accepts_valid():
      req = DownloadRequest(start=date(2026,4,1), end=date(2026,5,1), out=Path("/tmp/x.csv"))
      assert req.timeframe == "5m"
      assert req.force is False

  def test_rejects_start_after_end():
      with pytest.raises(ValidationError):
          DownloadRequest(start=date(2026,5,1), end=date(2026,4,1), out=Path("/tmp/x.csv"))

  def test_rejects_future_start():
      future = _today() + timedelta(days=1)
      with pytest.raises(ValidationError):
          DownloadRequest(start=future, end=future, out=Path("/tmp/x.csv"))

  def test_rejects_range_older_than_history_limit():
      old = _today() - timedelta(days=800)
      with pytest.raises(ValidationError, match="730"):
          DownloadRequest(start=old, end=old, out=Path("/tmp/x.csv"))

  def test_rejects_invalid_timeframe():
      with pytest.raises(ValidationError):
          DownloadRequest(start=date(2026,4,1), end=date(2026,5,1), out=Path("/tmp/x.csv"), timeframe="1d")  # only 5m, 1m allowed
  ```
  Run — expect failure.

- [ ] T077 Add `DownloadRequest` to `backend/src/intraday_trade_spy/data/downloader.py`:
  ```python
  from datetime import date, timedelta
  from pathlib import Path
  from typing import Literal
  from pydantic import BaseModel, ConfigDict, model_validator

  Timeframe = Literal["5m", "1m"]
  DataSource = Literal["yfinance", "mock"]

  class DownloadRequest(BaseModel):
      model_config = ConfigDict(frozen=True)
      start: date
      end: date
      timeframe: Timeframe = "5m"
      out: Path
      force: bool = False
      show_progress: bool = True

      @model_validator(mode="after")
      def _validate_dates(self) -> "DownloadRequest":
          today = date.today()
          if self.start > self.end:
              raise ValueError(f"start ({self.start}) must be <= end ({self.end})")
          if self.start > today or self.end > today:
              raise ValueError(f"start/end must not be in the future (today={today})")
          oldest_allowed = today - timedelta(days=MAX_5M_HISTORY_DAYS)
          if self.start < oldest_allowed:
              raise ValueError(
                  f"start ({self.start}) is older than yfinance's {MAX_5M_HISTORY_DAYS}-day "
                  f"history limit; earliest allowed is {oldest_allowed}"
              )
          return self
  ```
  Run T076 — expect PASS. Commit.

### `FetchResult`

- [ ] T078 Test: in `backend/tests/test_downloader.py`, add:
  ```python
  import pandas as pd
  from datetime import date
  from intraday_trade_spy.data.downloader import FetchResult

  def test_fetch_result_holds_dataframe():
      df = pd.DataFrame({"x": [1, 2, 3]})
      r = FetchResult(raw_df=df, requested_start=date(2026,4,1), requested_end=date(2026,4,3), fetched_bar_count=3)
      assert r.fetched_bar_count == 3
      assert r.was_retried is False
  ```
  Run — expect failure.

- [ ] T079 Add `FetchResult` to `downloader.py`:
  ```python
  import pandas as pd
  from pydantic import Field

  class FetchResult(BaseModel):
      model_config = ConfigDict(frozen=True, arbitrary_types_allowed=True)
      raw_df: pd.DataFrame = Field(..., exclude=True)
      requested_start: date
      requested_end: date
      fetched_bar_count: int
      was_retried: bool = False
  ```
  Run T078 — expect PASS. Commit.

### `FetchManifest`

- [ ] T080 Test: in `backend/tests/test_fetch_manifest.py`:
  ```python
  from datetime import date, datetime, timezone
  from intraday_trade_spy.data.downloader import FetchManifest

  def test_manifest_round_trip_yaml():
      m = FetchManifest(
          fetched_at=datetime(2026,5,28,17,42,11,tzinfo=timezone.utc),
          yfinance_version="0.2.42",
          requested_start=date(2026,4,1), requested_end=date(2026,5,28),
          requested_timeframe="5m", output_path="data/raw/x.csv",
          bar_count=8190, session_count=42,
          gap_session_dates=[date(2026,4,3), date(2026,4,4)],
          output_sha256="c"*64, data_source="yfinance",
      )
      assert m.bar_count == 8190
      assert m.data_source == "yfinance"
      assert len(m.output_sha256) == 64
  ```
  Run — expect failure.

- [ ] T081 Add `FetchManifest` to `downloader.py`:
  ```python
  from datetime import datetime
  from pydantic import AwareDatetime

  class FetchManifest(BaseModel):
      model_config = ConfigDict(frozen=True)
      fetched_at: AwareDatetime
      yfinance_version: str
      requested_start: date
      requested_end: date
      requested_timeframe: Timeframe
      output_path: str
      bar_count: int
      session_count: int
      gap_session_dates: list[date]
      output_sha256: str
      data_source: DataSource
  ```
  Run T080 — expect PASS. Commit.

**Checkpoint (Phase 2)**: `pytest backend/tests/test_downloader.py backend/tests/test_fetch_manifest.py -v` green. `python -c "from intraday_trade_spy.data.downloader import DownloadRequest, FetchResult, FetchManifest; print('ok')"` prints `ok`.

---

## Phase 3: User Story 1 — Download a date-range into a Feature-001-readable CSV (Priority: P1) 🎯 MVP

**Goal**: A single CLI command fetches SPY bars from yfinance (mocked
in tests), normalizes them to Feature 001's CSV schema, and writes the
file plus the sidecar manifest.

**Independent Test**: Run
`python -m intraday_trade_spy.cli.download_spy_data --start <≤60-day window> --end ...`
against a mocked yfinance. The output CSV passes Feature 001's
`load_bars()`.

### Pure chunker

- [ ] T082 [US1] Test: in `backend/tests/test_chunker.py`:
  ```python
  from datetime import date
  from intraday_trade_spy.data.downloader import iter_windows, MAX_CHUNK_DAYS

  def test_single_window_when_range_fits():
      windows = iter_windows(date(2026,4,1), date(2026,5,1), MAX_CHUNK_DAYS)
      assert windows == [(date(2026,4,1), date(2026,5,1))]

  def test_consecutive_non_overlapping_windows():
      windows = iter_windows(date(2026,1,1), date(2026,4,1), 60)
      assert len(windows) == 2
      assert windows[0][1] < windows[1][0]
      assert windows[0][0] == date(2026,1,1)
      assert windows[-1][1] == date(2026,4,1)

  def test_empty_when_start_equals_end():
      windows = iter_windows(date(2026,4,1), date(2026,4,1), 60)
      assert windows == [(date(2026,4,1), date(2026,4,1))]
  ```
  Run — expect failure.

- [ ] T083 [US1] Implement `iter_windows` in `downloader.py`:
  ```python
  from datetime import timedelta

  def iter_windows(start: date, end: date, max_days: int = MAX_CHUNK_DAYS) -> list[tuple[date, date]]:
      windows: list[tuple[date, date]] = []
      cur = start
      while cur <= end:
          win_end = min(cur + timedelta(days=max_days - 1), end)
          windows.append((cur, win_end))
          cur = win_end + timedelta(days=1)
      return windows
  ```
  Run T082 — expect PASS. Commit.

### Downloader: single-chunk happy path (no retry, no gaps)

- [ ] T084 [US1] Test: in `backend/tests/test_downloader.py`:
  ```python
  from datetime import date
  from pathlib import Path
  from intraday_trade_spy.data.downloader import Downloader, DownloadRequest

  def test_fetch_writes_csv_and_manifest(tmp_path, mock_yfinance_download):
      mock_fn = mock_yfinance_download(start="2026-04-01", end="2026-04-01", n_bars=78)
      out = tmp_path / "spy.csv"
      req = DownloadRequest(start=date(2026,4,1), end=date(2026,4,1), out=out)
      d = Downloader(download_fn=mock_fn, data_source="mock")
      manifest = d.fetch(req)
      assert out.exists()
      assert (tmp_path / "spy.csv.fetch.yaml").exists()
      assert manifest.bar_count == 78
      assert manifest.data_source == "mock"
      content = out.read_text().splitlines()
      assert content[0] == "symbol,timestamp,open,high,low,close,volume"
      assert content[1].startswith("SPY,2026-04-01T09:30:00-04:00,")
  ```
  Run — expect failure.

- [ ] T085 [US1] Implement `Downloader.__init__` + `Downloader.fetch` happy path in `downloader.py`. Surface area:
  ```python
  import csv
  import hashlib
  import yaml
  from datetime import datetime, time, timezone
  from pathlib import Path
  import pandas as pd
  import yfinance

  class OutputExistsError(Exception): pass
  class NoBarsFetchedError(Exception): pass

  class Downloader:
      def __init__(self, *, download_fn=None, data_source: DataSource = "yfinance"):
          self._download_fn = download_fn or yfinance.download
          self._data_source = data_source

      def fetch(self, req: DownloadRequest) -> FetchManifest:
          if req.out.exists() and not req.force:
              raise OutputExistsError(f"{req.out} exists; pass --force to overwrite")
          started = datetime.now(timezone.utc)
          windows = iter_windows(req.start, req.end)
          frames: list[pd.DataFrame] = []
          for (ws, we) in windows:
              df = self._call_yf(ws, we, req.timeframe)
              frames.append(df)
          raw = pd.concat(frames) if len(frames) > 1 else frames[0]
          normalized = self._normalize(raw)
          dropped = self._drop_glitches(normalized)
          if dropped > 0:
              print(f"Dropped {dropped} rows with NaN/zero volume.")
          if normalized.empty:
              raise NoBarsFetchedError(f"yfinance returned 0 rows for {req.start}..{req.end}")
          self._write_csv(normalized, req.out)
          sha = self._sha256(req.out)
          manifest = self._build_manifest(req, normalized, sha, started)
          self._write_manifest(manifest, req.out)
          return manifest

      def _call_yf(self, start: date, end: date, timeframe: Timeframe) -> pd.DataFrame:
          # T091 will add retry; this is the minimal version for the test.
          return self._download_fn(tickers="SPY", interval=timeframe, start=str(start),
                                    end=str(end + timedelta(days=1)), auto_adjust=False, progress=False)
  ```
  Plus add the four private helpers stubbed below (the next four task pairs flesh them out). For now make `_normalize`, `_drop_glitches`, `_write_csv`, `_sha256`, `_build_manifest`, `_write_manifest` minimal enough to make T084 pass. Commit.

### Column normalizer

- [ ] T086 [US1] Test: in `backend/tests/test_downloader.py`:
  ```python
  import pandas as pd
  from datetime import date
  from intraday_trade_spy.data.downloader import Downloader

  def test_normalize_renames_and_adds_symbol(mock_yfinance_download):
      mock_fn = mock_yfinance_download(start="2026-04-01", end="2026-04-01", n_bars=10)
      raw = mock_fn(tickers="SPY", interval="5m", start="2026-04-01", end="2026-04-02")
      d = Downloader(download_fn=mock_fn, data_source="mock")
      norm = d._normalize(raw)
      assert list(norm.columns) == ["symbol","timestamp","open","high","low","close","volume"]
      assert (norm["symbol"] == "SPY").all()
      assert str(norm["timestamp"].dt.tz) == "America/New_York"
  ```
  Run — expect failure or wrong columns.

- [ ] T087 [US1] Implement `_normalize` in `downloader.py`:
  ```python
  def _normalize(self, raw: pd.DataFrame) -> pd.DataFrame:
      # Handle both single-symbol (flat columns) and multi-symbol (multi-index) shapes.
      if isinstance(raw.columns, pd.MultiIndex):
          raw = raw.xs("SPY", axis=1, level=-1)
      df = raw.reset_index().rename(columns={
          "Datetime": "timestamp", "Date": "timestamp",
          "Open": "open", "High": "high", "Low": "low", "Close": "close",
          "Volume": "volume",
      })
      df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True).dt.tz_convert(ET)
      df["symbol"] = "SPY"
      df = df[["symbol","timestamp","open","high","low","close","volume"]]
      df = df.sort_values("timestamp", kind="mergesort").drop_duplicates(subset=["timestamp"], keep="first").reset_index(drop=True)
      session_start = time(9, 30)
      session_end = time(16, 0)
      mask = (df["timestamp"].dt.time >= session_start) & (df["timestamp"].dt.time < session_end)
      return df.loc[mask].reset_index(drop=True)
  ```
  Run T086 — expect PASS. Commit.

### Glitch dropper

- [ ] T088 [US1] Test: in `backend/tests/test_downloader.py`:
  ```python
  import numpy as np
  import pandas as pd
  from datetime import datetime
  from zoneinfo import ZoneInfo
  from intraday_trade_spy.data.downloader import Downloader

  ET = ZoneInfo("America/New_York")

  def test_drop_glitches_counts_and_drops():
      d = Downloader(download_fn=lambda **kw: pd.DataFrame(), data_source="mock")
      df = pd.DataFrame({
          "symbol": ["SPY"]*4,
          "timestamp": pd.date_range("2026-04-01 09:30", periods=4, freq="5min", tz=ET),
          "open":[1,1,1,1],"high":[1,1,1,1],"low":[1,1,1,1],"close":[1,1,1,1],
          "volume":[100, np.nan, 0, 200],
      })
      dropped = d._drop_glitches(df)
      assert dropped == 2
      assert len(df) == 2
  ```
  Run — expect failure.

- [ ] T089 [US1] Implement `_drop_glitches` in `downloader.py`:
  ```python
  def _drop_glitches(self, df: pd.DataFrame) -> int:
      before = len(df)
      mask = df["volume"].notna() & (df["volume"] > 0)
      df.drop(df.index[~mask], inplace=True)
      df.reset_index(drop=True, inplace=True)
      return before - len(df)
  ```
  Run T088 — expect PASS. Commit.

### CSV writer (deterministic formatting)

- [ ] T090 [US1] Test: in `backend/tests/test_downloader.py`:
  ```python
  import pandas as pd
  from datetime import datetime
  from pathlib import Path
  from zoneinfo import ZoneInfo
  from intraday_trade_spy.data.downloader import Downloader

  ET = ZoneInfo("America/New_York")

  def test_csv_format_and_determinism(tmp_path):
      d = Downloader(download_fn=lambda **kw: pd.DataFrame(), data_source="mock")
      df = pd.DataFrame({
          "symbol":["SPY","SPY"],
          "timestamp":[datetime(2026,4,1,9,30,tzinfo=ET), datetime(2026,4,1,9,35,tzinfo=ET)],
          "open":[524.1234, 524.5678],"high":[524.5,524.7],"low":[524.0,524.4],
          "close":[524.45,524.55],"volume":[100,200],
      })
      p1 = tmp_path / "a.csv"; p2 = tmp_path / "b.csv"
      d._write_csv(df, p1); d._write_csv(df, p2)
      assert p1.read_bytes() == p2.read_bytes()
      first_line = p1.read_text().splitlines()[1]
      assert "524.1234" in first_line
      assert b"\r\n" not in p1.read_bytes()
  ```
  Run — expect failure.

- [ ] T091 [US1] Implement `_write_csv` in `downloader.py`:
  ```python
  def _write_csv(self, df: pd.DataFrame, out: Path) -> None:
      out.parent.mkdir(parents=True, exist_ok=True)
      with open(out, "w", encoding="utf-8", newline="") as f:
          w = csv.writer(f, lineterminator="\n", quoting=csv.QUOTE_MINIMAL)
          w.writerow(["symbol","timestamp","open","high","low","close","volume"])
          for row in df.itertuples(index=False):
              w.writerow([
                  row.symbol, row.timestamp.isoformat(),
                  f"{row.open:.4f}", f"{row.high:.4f}", f"{row.low:.4f}", f"{row.close:.4f}",
                  int(row.volume),
              ])
  ```
  Run T090 — expect PASS. Commit.

### SHA256 + manifest writer

- [ ] T092 [US1] Test: in `backend/tests/test_downloader.py`:
  ```python
  import hashlib
  from pathlib import Path
  from datetime import date, datetime, timezone
  from intraday_trade_spy.data.downloader import Downloader, FetchManifest

  def test_sha256_matches_file_bytes(tmp_path):
      p = tmp_path / "x.txt"
      p.write_bytes(b"hello")
      d = Downloader(download_fn=lambda **kw: None, data_source="mock")
      assert d._sha256(p) == hashlib.sha256(b"hello").hexdigest()
  ```
  Run — expect failure.

- [ ] T093 [US1] Implement `_sha256` + `_build_manifest` + `_write_manifest` in `downloader.py`:
  ```python
  def _sha256(self, path: Path) -> str:
      return hashlib.sha256(path.read_bytes()).hexdigest()

  def _build_manifest(self, req: DownloadRequest, df: pd.DataFrame, sha: str, started: datetime) -> FetchManifest:
      all_dates = pd.date_range(req.start, req.end, freq="D").date
      present = set(df["timestamp"].dt.date.unique())
      gaps = sorted(d for d in all_dates if d not in present)
      return FetchManifest(
          fetched_at=started, yfinance_version=yfinance.__version__,
          requested_start=req.start, requested_end=req.end,
          requested_timeframe=req.timeframe, output_path=str(req.out),
          bar_count=len(df), session_count=len(present),
          gap_session_dates=gaps, output_sha256=sha, data_source=self._data_source,
      )

  def _write_manifest(self, manifest: FetchManifest, out: Path) -> None:
      sidecar = out.with_suffix(out.suffix + ".fetch.yaml")
      sidecar.write_text(yaml.safe_dump(manifest.model_dump(mode="json"), sort_keys=True, default_flow_style=False))
  ```
  Run T092 + T084 — expect PASS. Commit.

### CLI

- [ ] T094 [US1] Test: in `backend/tests/test_download_cli.py`:
  ```python
  import subprocess, sys
  from pathlib import Path

  def test_cli_end_to_end_under_mock(tmp_path, monkeypatch):
      # Mock yfinance.download at the package level so the CLI's import resolves to it.
      out = tmp_path / "spy.csv"
      env = {"PYTHONPATH": ""}
      # Use --force-mock to inject a deterministic synthetic df. Simpler: run the CLI module function directly.
      from intraday_trade_spy.cli.download_spy_data import main
      import pandas as pd, numpy as np
      idx = pd.date_range("2026-04-01T13:30:00Z", periods=78, freq="5min", tz="UTC")
      df = pd.DataFrame({"Open":1,"High":1,"Low":1,"Close":1,"Adj Close":1,"Volume":[100]*78}, index=idx)
      df.index.name = "Datetime"
      monkeypatch.setattr("yfinance.download", lambda **kw: df)
      rc = main(["--start","2026-04-01","--end","2026-04-01","--out",str(out)])
      assert rc == 0
      assert out.exists()
      assert (out.parent / "spy.csv.fetch.yaml").exists()
  ```
  Run — expect failure.

- [ ] T095 [US1] Implement `backend/src/intraday_trade_spy/cli/download_spy_data.py`:
  ```python
  import argparse
  import sys
  from datetime import date
  from pathlib import Path
  from pydantic import ValidationError
  from intraday_trade_spy.data.downloader import (
      Downloader, DownloadRequest, OutputExistsError, NoBarsFetchedError,
  )

  def _default_out(timeframe: str, start: date, end: date) -> Path:
      return Path("backend/data/raw") / f"spy_{timeframe}_{start}_{end}.csv"

  def main(argv: list[str] | None = None) -> int:
      p = argparse.ArgumentParser(prog="intraday-trade-spy-download")
      p.add_argument("--start", required=True, type=date.fromisoformat)
      p.add_argument("--end", required=True, type=date.fromisoformat)
      p.add_argument("--timeframe", default="5m", choices=["5m", "1m"])
      p.add_argument("--out", default=None, type=Path)
      p.add_argument("--force", action="store_true")
      p.add_argument("--no-progress", action="store_true")
      args = p.parse_args(argv)
      out = args.out or _default_out(args.timeframe, args.start, args.end)
      try:
          req = DownloadRequest(start=args.start, end=args.end, timeframe=args.timeframe,
                                out=out, force=args.force, show_progress=not args.no_progress)
      except ValidationError as e:
          print(f"argument error: {e}", file=sys.stderr); return 2
      if not args.no_progress:
          print(f"Resolved range: {req.start} -> {req.end} ({req.timeframe})")
      try:
          manifest = Downloader().fetch(req)
      except OutputExistsError as e:
          print(f"argument error: {e}", file=sys.stderr); return 2
      except NoBarsFetchedError as e:
          print(f"data error: {e}", file=sys.stderr); return 4
      print(f"Wrote {manifest.bar_count} bars to {req.out}")
      print(f"Wrote manifest to {req.out}.fetch.yaml")
      return 0

  if __name__ == "__main__":
      raise SystemExit(main())
  ```
  Run T094 — expect PASS. Commit.

### Script wrapper (TDD-exempt per constitution v1.1.0)

- [ ] T096 [US1] **TDD-EXEMPT** (≤5-line wrapper, per constitution principle IV exempt list). Create `backend/scripts/download_spy_data.py`:
  ```python
  import sys
  from intraday_trade_spy.cli.download_spy_data import main
  if __name__ == "__main__":
      raise SystemExit(main(sys.argv[1:]))
  ```
  No test required. Note in commit message: "exempt per constitution v1.1.0 principle IV exempt list (≤5-line wrapper)".

**Checkpoint (Phase 3 — MVP)**: Run `pytest backend/tests/test_chunker.py backend/tests/test_downloader.py backend/tests/test_download_cli.py backend/tests/test_fetch_manifest.py -v` — all green. Manually exercise: `python -m intraday_trade_spy.cli.download_spy_data --start <today-30d> --end <today-1d>` and confirm the CSV + manifest land in `backend/data/raw/`. **MVP is demo-ready.**

---

## Phase 4: User Story 2 — Chunk ranges larger than 60 days (Priority: P2)

**Goal**: Requests spanning >60 days transparently issue multiple
yfinance calls and produce one continuous CSV.

**Independent Test**: A 120-day mocked request produces a CSV with no
duplicate timestamps and a manifest claiming bars from both chunks.

- [ ] T097 [US2] Test: in `backend/tests/test_chunker.py`, add:
  ```python
  from datetime import date, timedelta
  from intraday_trade_spy.data.downloader import iter_windows

  def test_120_day_range_produces_two_windows():
      windows = iter_windows(date(2026,1,1), date(2026,1,1) + timedelta(days=119), 60)
      assert len(windows) == 2
      assert windows[0][1] + timedelta(days=1) == windows[1][0]
  ```
  Run — expect PASS (chunker already correct from T083) OR add coverage if missing. Commit only if any change.

- [ ] T098 [US2] Test: in `backend/tests/test_downloader.py`, add:
  ```python
  import pandas as pd
  from datetime import date
  from pathlib import Path
  from intraday_trade_spy.data.downloader import Downloader, DownloadRequest

  def test_two_chunks_concatenate_without_duplicates(tmp_path, mock_yfinance_download):
      # Simulate two consecutive windows that overlap on one day at the boundary.
      mock_a = mock_yfinance_download(start="2026-03-01", end="2026-03-01", n_bars=78)
      mock_b = mock_yfinance_download(start="2026-05-01", end="2026-05-01", n_bars=78)
      calls = {"n": 0}
      def _double_mock(**kw):
          calls["n"] += 1
          return mock_a(**kw) if calls["n"] == 1 else mock_b(**kw)
      d = Downloader(download_fn=_double_mock, data_source="mock")
      out = tmp_path / "spy.csv"
      req = DownloadRequest(start=date(2026,3,1), end=date(2026,5,1), out=out)
      manifest = d.fetch(req)
      assert calls["n"] == 2  # two chunks
      assert manifest.bar_count == 156  # 78 + 78
      lines = out.read_text().splitlines()[1:]
      timestamps = [l.split(",")[1] for l in lines]
      assert len(timestamps) == len(set(timestamps))  # no duplicates
  ```
  Run — expect PASS if downloader is correct, else fix the concat / dedupe path. Commit.

- [ ] T099 [US2] Test: in `backend/tests/test_download_cli.py`, add:
  ```python
  def test_cli_prints_progress_for_chunked_request(capsys, tmp_path, monkeypatch):
      import pandas as pd
      idx_a = pd.date_range("2026-03-01T14:30:00Z", periods=78, freq="5min", tz="UTC")
      idx_b = pd.date_range("2026-05-01T13:30:00Z", periods=78, freq="5min", tz="UTC")
      df_a = pd.DataFrame({"Open":1,"High":1,"Low":1,"Close":1,"Adj Close":1,"Volume":[100]*78}, index=idx_a)
      df_b = pd.DataFrame({"Open":1,"High":1,"Low":1,"Close":1,"Adj Close":1,"Volume":[100]*78}, index=idx_b)
      df_a.index.name = "Datetime"; df_b.index.name = "Datetime"
      calls = {"n": 0}
      def _mock(**kw):
          calls["n"] += 1
          return df_a if calls["n"] == 1 else df_b
      monkeypatch.setattr("yfinance.download", _mock)
      from intraday_trade_spy.cli.download_spy_data import main
      out = tmp_path / "spy.csv"
      rc = main(["--start","2026-03-01","--end","2026-05-01","--out",str(out)])
      assert rc == 0
      captured = capsys.readouterr().out
      # Per cli-download.md contract, progress lines say "Fetching chunk i/n"
      assert "chunk 1" in captured.lower()
      assert "chunk 2" in captured.lower()
  ```
  Run — expect failure (CLI not yet printing per-chunk progress).

- [ ] T100 [US2] Update `Downloader.fetch` and the CLI to emit per-chunk progress when `req.show_progress` is true:
  ```python
  # In Downloader.fetch (downloader.py), replace the for-loop:
  for i, (ws, we) in enumerate(windows, start=1):
      if req.show_progress and len(windows) > 1:
          print(f"Fetching chunk {i}/{len(windows)}: {ws} -> {we} ...")
      df = self._call_yf(ws, we, req.timeframe)
      frames.append(df)
  ```
  Run T099 + T098 — expect PASS. Commit.

**Checkpoint (Phase 4)**: `pytest backend/tests/test_chunker.py backend/tests/test_downloader.py backend/tests/test_download_cli.py -v` green. Manually: `python -m intraday_trade_spy.cli.download_spy_data --start <today-120d> --end <today-1d>` shows two progress lines.

---

## Phase 5: User Story 3 — Symbol locked to SPY (Priority: P3)

**Goal**: The CLI surface and the downloader's internal symbol
parameter both enforce SPY-only at every layer.

**Independent Test**: `--help` lists no symbol/ticker/instrument flag.

- [ ] T101 [US3] Test: in `backend/tests/test_download_cli.py`, add:
  ```python
  import subprocess, sys

  def test_cli_help_does_not_list_symbol_flag():
      result = subprocess.run([sys.executable, "-m", "intraday_trade_spy.cli.download_spy_data", "--help"],
                              capture_output=True, text=True)
      assert result.returncode == 0
      help_text = result.stdout.lower()
      assert "--symbol" not in help_text
      assert "--ticker" not in help_text
      assert "--instrument" not in help_text
  ```
  Run — expect PASS (CLI doesn't define those flags). Commit.

- [ ] T102 [US3] Test: in `backend/tests/test_downloader.py`, add a runtime check that the internal call always uses `"SPY"`:
  ```python
  from intraday_trade_spy.data.downloader import Downloader
  from datetime import date
  from pathlib import Path

  def test_internal_call_uses_spy(tmp_path, mock_yfinance_download):
      seen = {}
      def _capture(**kw):
          seen.update(kw)
          mock = mock_yfinance_download(start="2026-04-01", end="2026-04-01", n_bars=78)
          return mock(**kw)
      from intraday_trade_spy.data.downloader import DownloadRequest
      d = Downloader(download_fn=_capture, data_source="mock")
      req = DownloadRequest(start=date(2026,4,1), end=date(2026,4,1), out=tmp_path/"x.csv")
      d.fetch(req)
      assert seen["tickers"] == "SPY"
  ```
  Run — expect PASS if the downloader is wired correctly; else fix the `_call_yf` call site. Commit.

**Checkpoint (Phase 5)**: All three FR-002 / US3 tests green. Run `python -m intraday_trade_spy.cli.download_spy_data --help` and visually confirm no symbol-related flag appears.

---

## Phase 6: User Story 4 — Reproducible, inspectable fetches (Priority: P4)

**Goal**: The sidecar manifest is complete, the sha256 round-trips,
and `gap_session_dates` lists weekend / holiday dates correctly.

- [ ] T103 [US4] Test: in `backend/tests/test_fetch_manifest.py`, add a full-contents check on a real (mocked) fetch:
  ```python
  import yaml
  import hashlib
  from datetime import date
  from pathlib import Path
  from intraday_trade_spy.data.downloader import Downloader, DownloadRequest

  def test_manifest_contents_after_fetch(tmp_path, mock_yfinance_download):
      mock_fn = mock_yfinance_download(start="2026-04-01", end="2026-04-01", n_bars=78)
      out = tmp_path / "spy.csv"
      req = DownloadRequest(start=date(2026,4,1), end=date(2026,4,1), out=out)
      d = Downloader(download_fn=mock_fn, data_source="mock")
      m = d.fetch(req)
      data = yaml.safe_load((out.parent / "spy.csv.fetch.yaml").read_text())
      assert set(data.keys()) == {
          "bar_count","data_source","fetched_at","gap_session_dates",
          "output_path","output_sha256","requested_end","requested_start",
          "requested_timeframe","session_count","yfinance_version",
      }
      assert data["bar_count"] == m.bar_count
      assert data["data_source"] == "mock"
      # sha256 round-trip
      computed = hashlib.sha256(out.read_bytes()).hexdigest()
      assert data["output_sha256"] == computed
  ```
  Run — expect PASS (or fix any field-name drift). Commit.

- [ ] T104 [US4] Test: in `backend/tests/test_downloader.py`, add a gap-detection test using a range that spans a weekend:
  ```python
  from datetime import date
  from intraday_trade_spy.data.downloader import Downloader, DownloadRequest

  def test_gap_session_dates_includes_weekend(tmp_path, mock_yfinance_download):
      # Mock returns bars only for the start date; sidecar should list the next two days as gaps.
      mock_fn = mock_yfinance_download(start="2026-04-03", end="2026-04-03", n_bars=78)
      out = tmp_path / "spy.csv"
      req = DownloadRequest(start=date(2026,4,3), end=date(2026,4,5), out=out)  # Fri, Sat, Sun
      d = Downloader(download_fn=mock_fn, data_source="mock")
      m = d.fetch(req)
      assert date(2026,4,4) in m.gap_session_dates
      assert date(2026,4,5) in m.gap_session_dates
  ```
  Run — expect PASS if `_build_manifest` gap logic is correct; else fix. Commit.

- [ ] T105 [US4] Test: in `backend/tests/test_downloader.py`, add a reproducibility check on the CSV bytes (FR-015):
  ```python
  from datetime import date
  from intraday_trade_spy.data.downloader import Downloader, DownloadRequest

  def test_two_runs_byte_identical_csv(tmp_path, mock_yfinance_download):
      mock_fn = mock_yfinance_download(start="2026-04-01", end="2026-04-01", n_bars=78)
      out1 = tmp_path / "a.csv"; out2 = tmp_path / "b.csv"
      d = Downloader(download_fn=mock_fn, data_source="mock")
      d.fetch(DownloadRequest(start=date(2026,4,1), end=date(2026,4,1), out=out1))
      d.fetch(DownloadRequest(start=date(2026,4,1), end=date(2026,4,1), out=out2))
      assert out1.read_bytes() == out2.read_bytes()
  ```
  Run — expect PASS. If not, locate the source of non-determinism and pin it (most likely a missing format string). Commit.

**Checkpoint (Phase 6)**: All US4 tests green. Manually open a manifest and confirm `output_sha256` matches `sha256sum`.

---

## Phase 7: User Story 5 — Offline discipline + one opt-in live test (Priority: P5)

**Goal**: The default test invocation runs offline. The
socket-blocker fixture enforces it. One `@pytest.mark.slow` test
hits real yfinance.

- [ ] T106 [US5] Test (validating T072's fixture): in `backend/tests/test_download_cli.py`, add:
  ```python
  import pytest, socket

  def test_socket_is_blocked_by_default():
      with pytest.raises(RuntimeError, match="network access blocked"):
          socket.socket()

  @pytest.mark.slow
  def test_socket_allowed_when_marked_slow():
      s = socket.socket()
      s.close()
  ```
  Run `pytest backend/tests/test_download_cli.py::test_socket_is_blocked_by_default -v` — expect PASS. Run `pytest -m slow backend/tests/test_download_cli.py::test_socket_allowed_when_marked_slow -v` — expect PASS. Commit.

- [ ] T107 [US5] Test: in `backend/tests/test_yfinance_integration.py` (opt-in, real network):
  ```python
  import pytest
  from datetime import date, timedelta
  from pathlib import Path
  from intraday_trade_spy.data.downloader import Downloader, DownloadRequest
  from intraday_trade_spy.data.loader import load_bars
  from intraday_trade_spy.config import MarketConfig

  pytestmark = pytest.mark.slow

  def test_real_yfinance_fetch_loads_via_feature_001(tmp_path):
      # Use a 3-day window ending one trading day ago to avoid edge effects.
      end = date.today() - timedelta(days=1)
      start = end - timedelta(days=2)
      out = tmp_path / "spy_real.csv"
      d = Downloader(data_source="yfinance")
      req = DownloadRequest(start=start, end=end, out=out)
      m = d.fetch(req)
      assert m.bar_count > 0
      # The acid test: Feature 001's loader consumes the file with no errors.
      market = MarketConfig(symbol="SPY", session_start="09:30:00", session_end="16:00:00",
                            no_new_trades_after="15:30:00", force_flat_time="15:55:00")
      df = load_bars(out, market=market)
      assert len(df) == m.bar_count
  ```
  Run `pytest -m slow backend/tests/test_yfinance_integration.py -v` once manually with internet. Expect PASS. Commit.

**Checkpoint (Phase 7)**: `pytest -m "not slow"` green and provably offline. `pytest -m slow` green (when run with internet).

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T108 [P] Append a "Downloading historical SPY data" section to `backend/README.md` linking to the Feature 002 quickstart.

- [ ] T109 [P] Add a note to the root `README.md` mentioning Feature 002 unlocks real-data backtests via `python -m intraday_trade_spy.cli.download_spy_data ...`.

- [ ] T110 Run `ruff check backend/src backend/tests && ruff format --check backend/src backend/tests`. Fix any findings. Re-run until clean.

- [ ] T111 Run `pytest --cov=intraday_trade_spy.data.downloader --cov=intraday_trade_spy.cli.download_spy_data --cov-report=term-missing backend/tests -m "not slow"`. Confirm 100% line coverage for both modules (SC-002). If any uncovered branch exists, add a test.

- [ ] T112 Run the quickstart end-to-end with a real yfinance fetch (`pytest -m slow`). Confirm the produced CSV runs through Feature 001's `run_backtest` cleanly:
  ```bash
  python -m intraday_trade_spy.cli.download_spy_data --start $(date -v-30d +%Y-%m-%d) --end $(date -v-1d +%Y-%m-%d)
  python -m intraday_trade_spy.cli.run_backtest --config backend/config/config.yaml --data backend/data/raw/spy_5m_*.csv
  ```

**Checkpoint (Phase 8)**: All tests green. Ruff clean. Coverage targets met. End-to-end fetch → backtest works on real data.

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 (Setup)** — no upstream; can start immediately.
- **Phase 2 (Foundational)** — depends on Phase 1; blocks every user story.
- **Phase 3 (US1)** — depends on Phase 2. Once green, this is the MVP.
- **Phase 4 (US2)** — depends on Phase 3 (refines the fetch loop).
- **Phase 5 (US3)** — depends on Phase 3 only (CLI exists by then). Independent of Phase 4.
- **Phase 6 (US4)** — depends on Phase 3 (manifest exists). Independent of Phases 4–5.
- **Phase 7 (US5)** — depends on Phase 1 (fixture) and Phase 3 (CLI). Independent of Phases 4–6.
- **Phase 8 (Polish)** — depends on every user-story phase.

### Inside each phase

- TDD-mandatory tasks (preceded by `Test:`) MUST be done test-then-impl. The failing-test step is non-negotiable per constitution v1.1.0 principle IV.
- Tasks within a phase that touch DIFFERENT files and have NO producer/consumer link can run in parallel (`[P]`).
- Tasks within a phase that share a file MUST be serialized.

### Branch hygiene

- Branch `002-historical-spy-yfinance-loader` is already created.
- Commit after each TDD micro-cycle.
- Push after each phase checkpoint.

---

## Parallel Opportunities

### Phase 1 parallel groups

```bash
Task: "T072 Add socket-blocker fixture"
Task: "T073 [P] Add mock_yfinance_download fixture"
# T071 (pyproject.toml) must complete first; both fixtures depend on yfinance + the slow marker being registered.
```

### Phase 2 parallel groups

```bash
# Different test files, no shared state:
Task: "T076 DownloadRequest tests"
Task: "T078 FetchResult tests"
Task: "T080 [P] FetchManifest tests"
```

### Phase 3 parallel groups

```bash
# Independent test authoring tasks (different test files):
Task: "T082 [US1] chunker tests"
Task: "T084 [US1] downloader happy-path test"
Task: "T094 [US1] CLI test"
```

### Phase 6 parallel groups

```bash
Task: "T103 [US4] manifest contents test"
Task: "T104 [US4] gap_session_dates test"
Task: "T105 [US4] byte-identical reproducibility test"
```

### Phase 8 parallel groups

```bash
Task: "T108 Backend README addendum"
Task: "T109 Root README mention"
```

---

## Implementation Strategy

### MVP first (Phase 1 + Phase 2 + Phase 3 = US1 only)

1. Phase 1 Setup (T071–T073): get yfinance + the offline-discipline fixtures in place.
2. Phase 2 Foundational (T074–T081): typed models + module constants.
3. Phase 3 User Story 1 (T082–T096): chunker (pure function), Downloader class, normalizer, glitch dropper, CSV writer, manifest writer, CLI, script wrapper.
4. **STOP and VALIDATE**: run the CLI for a ≤60-day mocked range. Confirm CSV + manifest land.
5. Optionally run `pytest -m slow` once with internet to confirm real yfinance also works.

### Incremental delivery

1. After MVP: Phase 4 (US2) — large-range chunking + per-chunk progress.
2. Then Phase 5 (US3) — assert no symbol flag exists at CLI surface.
3. Then Phase 6 (US4) — full manifest + reproducibility tests.
4. Then Phase 7 (US5) — opt-in real-network test + verify socket blocker works.
5. Then Phase 8 — README mentions + ruff + coverage + quickstart timing.

### Parallel team strategy

This feature is solo-developable. If two developers exist, after MVP
they can split: developer A takes Phases 4 + 5 (chunking + symbol
lock); developer B takes Phases 6 + 7 (provenance + offline
discipline). They converge for Phase 8.

---

## Notes

- Every implementation task whose target is under
  `backend/src/intraday_trade_spy/data/downloader.py` or
  `backend/src/intraday_trade_spy/cli/download_spy_data.py` has a
  preceding `Test:` task — constitution v1.1.0 principle IV.
- The only TDD-exempt new file is T096 (`backend/scripts/download_spy_data.py`,
  ≤5-line wrapper).
- Each task names exact file paths — no placeholders.
- Test code skeletons inline in failing-test tasks; implementation
  signatures inline in impl tasks. The engineer is meant to expand
  them with details inferred from `spec.md`, `data-model.md`, and the
  contracts in `contracts/`.
- Commit after each TDD micro-cycle.
- If any task can't be completed because a file outside the project
  structure tree (plan.md) needs to be created, flag it as a
  deviation and update plan.md before proceeding.
