import csv
import hashlib
import time as _time
from datetime import UTC, date, datetime, time, timedelta
from pathlib import Path
from typing import Literal
from zoneinfo import ZoneInfo

import pandas as pd
import yaml
import yfinance
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator

MAX_CHUNK_DAYS = 60
MAX_5M_HISTORY_DAYS = 730
RETRY_BACKOFF_SECONDS = 5
RETRY_MAX_ATTEMPTS = 2
ET = ZoneInfo("America/New_York")

# Session window. Duplicates Feature 001's MarketConfig defaults intentionally;
# see specs/002-historical-spy-yfinance-loader/data-model.md L1 note.
SESSION_START = time(9, 30)
SESSION_END = time(16, 0)

Timeframe = Literal["5m", "1m"]
DataSource = Literal["yfinance", "mock"]


class OutputExistsError(Exception):
    pass


def _is_transient_error(exc: BaseException) -> bool:
    """Classify an exception as transient (retry) vs non-transient (fail fast).

    Used by the Feature 006 /api/data/download endpoint's retry loop
    (clarification 2026-05-30 / Q3).

    Transient:
      - Network errors (ConnectionError, socket / DNS / timeout)
      - HTTP 5xx / 429 from upstream

    Non-transient:
      - Validation errors (ValueError on dates, ranges)
      - "No data" empty results (NoBarsFetchedError)
      - Anything else
    """
    if isinstance(exc, (OutputExistsError, NoBarsFetchedError, ValueError, TypeError)):
        return False

    # httpx errors
    try:
        import httpx

        if isinstance(exc, (httpx.TransportError, httpx.TimeoutException)):
            return True
        if isinstance(exc, httpx.HTTPStatusError):
            status = exc.response.status_code
            return status == 429 or 500 <= status < 600
    except ImportError:
        pass

    # Connection / socket errors at the stdlib level
    if isinstance(exc, (ConnectionError, OSError)):
        return True

    return False


class NoBarsFetchedError(Exception):
    pass


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


class FetchResult(BaseModel):
    model_config = ConfigDict(frozen=True, arbitrary_types_allowed=True)
    raw_df: pd.DataFrame = Field(..., exclude=True)
    requested_start: date
    requested_end: date
    fetched_bar_count: int
    was_retried: bool = False


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


def iter_windows(
    start: date, end: date, max_days: int = MAX_CHUNK_DAYS
) -> list[tuple[date, date]]:
    """Pure function: split [start, end] into consecutive ≤max_days windows."""
    windows: list[tuple[date, date]] = []
    cur = start
    while cur <= end:
        win_end = min(cur + timedelta(days=max_days - 1), end)
        windows.append((cur, win_end))
        cur = win_end + timedelta(days=1)
    return windows


_NORMALIZED_COLS = ["symbol", "timestamp", "open", "high", "low", "close", "volume"]


class Downloader:
    def __init__(self, *, download_fn=None, data_source: DataSource = "yfinance"):
        self._download_fn = download_fn if download_fn is not None else yfinance.download
        self._data_source = data_source

    def fetch(self, req: DownloadRequest) -> FetchManifest:
        if req.out.exists() and not req.force:
            raise OutputExistsError(
                f"{req.out} exists; pass --force to overwrite"
            )
        started = datetime.now(UTC)
        windows = iter_windows(req.start, req.end)
        frames: list[pd.DataFrame] = []
        for i, (ws, we) in enumerate(windows, start=1):
            if req.show_progress and len(windows) > 1:
                print(f"Fetching chunk {i}/{len(windows)}: {ws} -> {we} ...")
            df = self._call_yf(ws, we, req.timeframe)
            frames.append(df)
        raw = pd.concat(frames) if len(frames) > 1 else frames[0]
        normalized = self._normalize(raw)
        dropped = self._drop_glitches(normalized)
        if dropped > 0:
            print(f"Dropped {dropped} rows with NaN/zero volume.")
        if normalized.empty:
            raise NoBarsFetchedError(
                f"yfinance returned 0 rows for {req.start}..{req.end}"
            )
        self._write_csv(normalized, req.out)
        sha = self._sha256(req.out)
        manifest = self._build_manifest(req, normalized, sha, started)
        self._write_manifest(manifest, req.out)
        return manifest

    def _call_yf(
        self, start: date, end: date, timeframe: Timeframe
    ) -> pd.DataFrame:
        last_exc: Exception | None = None
        for attempt in range(RETRY_MAX_ATTEMPTS):
            try:
                return self._download_fn(
                    tickers="SPY",
                    interval=timeframe,
                    start=str(start),
                    end=str(end + timedelta(days=1)),
                    auto_adjust=False,
                    progress=False,
                )
            except Exception as exc:  # noqa: BLE001 — yfinance raises various types for 429
                if "429" in str(exc) and attempt < RETRY_MAX_ATTEMPTS - 1:
                    _time.sleep(RETRY_BACKOFF_SECONDS)
                    last_exc = exc
                    continue
                raise
        assert last_exc is not None
        raise last_exc

    def _normalize(self, raw: pd.DataFrame) -> pd.DataFrame:
        if raw.empty:
            return pd.DataFrame(columns=_NORMALIZED_COLS)
        if isinstance(raw.columns, pd.MultiIndex):
            raw = raw.xs("SPY", axis=1, level=-1)
        df = raw.reset_index().rename(
            columns={
                "Datetime": "timestamp",
                "Date": "timestamp",
                "Open": "open",
                "High": "high",
                "Low": "low",
                "Close": "close",
                "Volume": "volume",
            }
        )
        df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True).dt.tz_convert(ET)
        df["symbol"] = "SPY"
        df = df[_NORMALIZED_COLS]
        df = (
            df.sort_values("timestamp", kind="mergesort")
            .drop_duplicates(subset=["timestamp"], keep="first")
            .reset_index(drop=True)
        )
        mask = (df["timestamp"].dt.time >= SESSION_START) & (
            df["timestamp"].dt.time < SESSION_END
        )
        return df.loc[mask].reset_index(drop=True)

    def _drop_glitches(self, df: pd.DataFrame) -> int:
        before = len(df)
        mask = df["volume"].notna() & (df["volume"] > 0)
        df.drop(df.index[~mask], inplace=True)
        df.reset_index(drop=True, inplace=True)
        return before - len(df)

    def _write_csv(self, df: pd.DataFrame, out: Path) -> None:
        out.parent.mkdir(parents=True, exist_ok=True)
        with open(out, "w", encoding="utf-8", newline="") as f:
            w = csv.writer(f, lineterminator="\n", quoting=csv.QUOTE_MINIMAL)
            w.writerow(_NORMALIZED_COLS)
            for row in df.itertuples(index=False):
                w.writerow(
                    [
                        row.symbol,
                        row.timestamp.isoformat(),
                        f"{row.open:.4f}",
                        f"{row.high:.4f}",
                        f"{row.low:.4f}",
                        f"{row.close:.4f}",
                        int(row.volume),
                    ]
                )

    def _sha256(self, path: Path) -> str:
        return hashlib.sha256(path.read_bytes()).hexdigest()

    def _build_manifest(
        self, req: DownloadRequest, df: pd.DataFrame, sha: str, started: datetime
    ) -> FetchManifest:
        all_dates = pd.date_range(req.start, req.end, freq="D").date
        present = (
            set(df["timestamp"].dt.date.unique()) if len(df) else set()
        )
        gaps = sorted(d for d in all_dates if d not in present)
        return FetchManifest(
            fetched_at=started,
            yfinance_version=yfinance.__version__,
            requested_start=req.start,
            requested_end=req.end,
            requested_timeframe=req.timeframe,
            output_path=str(req.out),
            bar_count=len(df),
            session_count=len(present),
            gap_session_dates=gaps,
            output_sha256=sha,
            data_source=self._data_source,
        )

    def _write_manifest(self, manifest: FetchManifest, out: Path) -> None:
        sidecar = out.with_suffix(out.suffix + ".fetch.yaml")
        sidecar.write_text(
            yaml.safe_dump(
                manifest.model_dump(mode="json"),
                sort_keys=True,
                default_flow_style=False,
            )
        )
