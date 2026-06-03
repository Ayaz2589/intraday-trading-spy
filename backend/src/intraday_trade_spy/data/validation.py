"""Shared bar validation (Feature 009).

One definition of "a valid stored bar": a regular-session (09:30–16:00 ET)
5-minute bar with positive volume and sane OHLC. Used by AlpacaBarSource and
available as a defensive net for any source so invalid/garbage bars are
rejected before they reach the cache (FR-010). The yfinance path additionally
filters upstream in `Downloader._normalize`/`_drop_glitches`.
"""

from __future__ import annotations

from datetime import datetime, time
from zoneinfo import ZoneInfo

ET = ZoneInfo("America/New_York")
SESSION_START = time(9, 30)
SESSION_END = time(16, 0)


def in_regular_session(ts_et: datetime) -> bool:
    """True if an ET-localized timestamp falls in the regular session (end-exclusive)."""
    return SESSION_START <= ts_et.timetz().replace(tzinfo=None) < SESSION_END


def ohlc_is_sane(o: float, h: float, lo: float, c: float) -> bool:
    """Positive prices, high is the max, low is the min."""
    return (
        all(x > 0 for x in (o, h, lo, c))
        and h >= lo
        and h >= max(o, c)
        and lo <= min(o, c)
    )


def validate_bar_row(row: dict) -> bool:
    """Validate a normalized BarRow dict (bar_start ISO-8601 with tz)."""
    try:
        ts = datetime.fromisoformat(str(row["bar_start"])).astimezone(ET)
        o, h, lo, c = (
            float(row["open"]),
            float(row["high"]),
            float(row["low"]),
            float(row["close"]),
        )
        v = int(float(row["volume"]))
    except Exception:  # noqa: BLE001 — any parse failure is an invalid bar
        return False
    return in_regular_session(ts) and v > 0 and ohlc_is_sane(o, h, lo, c)


def partition_valid_rows(rows: list[dict]) -> tuple[list[dict], int]:
    """Split rows into (valid, rejected_count)."""
    valid = [r for r in rows if validate_bar_row(r)]
    return valid, len(rows) - len(valid)
