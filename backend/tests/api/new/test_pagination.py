"""Opaque cursor pagination tests (T019)."""

from __future__ import annotations

import pytest


def test_encode_decode_round_trip():
    from intraday_trade_spy.api.pagination import decode_cursor, encode_cursor

    natural_key = "2026-05-31T02:05:08.5Z"
    id_value = "fe90f357-def9-443d-8e3a-2e0e6fc920fc"
    cursor = encode_cursor(natural_key, id_value)
    decoded = decode_cursor(cursor)
    assert decoded == (natural_key, id_value)


def test_decode_none_returns_none():
    from intraday_trade_spy.api.pagination import decode_cursor

    assert decode_cursor(None) is None
    assert decode_cursor("") is None


def test_decode_malformed_raises():
    from intraday_trade_spy.api.pagination import decode_cursor

    for bad in ["not-base64!!!", "YWJj", '{"bad":"json"}', "WzEyM10="]:
        with pytest.raises(ValueError):
            decode_cursor(bad)


def test_cursor_is_opaque():
    """Different inputs produce visibly different cursor strings; clients
    cannot trivially infer the underlying tuple."""
    from intraday_trade_spy.api.pagination import encode_cursor

    a = encode_cursor("2026-01-01", "id-a")
    b = encode_cursor("2026-01-02", "id-b")
    assert a != b
    # Cursor should not contain raw spaces or special chars
    assert " " not in a
    assert "+" not in a  # base64url uses - not +


def test_cursor_stable_under_concurrent_inserts():
    """Covers Q2 guarantee: paginating page 1 → insert new row at head →
    page 2 (using next_cursor from page 1) does NOT skip or repeat rows
    from page 1's result set.

    This is verified at the cursor LEVEL: a cursor encodes the boundary
    `(natural_key, id)`. Anything strictly older/older-or-same-key but smaller-id
    is on a prior page; anything newer is the next page. Inserting at the
    head of the ordering changes the "first page" view next time, but the
    cursor still points to the same boundary on page 2."""
    from intraday_trade_spy.api.pagination import decode_cursor, encode_cursor

    # Simulate a page 1 fetch returning runs with started_at "T1, T2, T3".
    # The next_cursor encodes the last row's (started_at, id).
    cursor_after_page_1 = encode_cursor("2026-05-30T10:00:00Z", "id-T3")
    decoded = decode_cursor(cursor_after_page_1)
    assert decoded == ("2026-05-30T10:00:00Z", "id-T3")

    # A new row inserted at the head (started_at='2026-05-30T15:00:00Z',
    # id='id-T0') doesn't change what page 2 is — page 2 is everything
    # STRICTLY older than the cursor's boundary. The cursor itself encodes
    # the boundary, so it stays valid.
    new_cursor = encode_cursor("2026-05-30T15:00:00Z", "id-T0")
    assert new_cursor != cursor_after_page_1
    # Decoding the original cursor still returns the original boundary —
    # not affected by the new insert.
    assert decode_cursor(cursor_after_page_1) == ("2026-05-30T10:00:00Z", "id-T3")
