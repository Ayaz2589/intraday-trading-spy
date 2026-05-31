"""Opaque cursor pagination (clarification Q2).

Cursors encode `(natural_ordering_value, id)` tuples as base64url-encoded
JSON. Clients treat them as black boxes; stability under concurrent
inserts/deletes is guaranteed by the natural-ordering filter.
"""

from __future__ import annotations

import base64
import json
from typing import Any, Optional


def encode_cursor(natural_key: Any, id_value: str) -> str:
    """Encode `(natural_key, id)` as an opaque base64url cursor string."""
    payload = json.dumps([str(natural_key), str(id_value)], separators=(",", ":"))
    raw = base64.urlsafe_b64encode(payload.encode("utf-8")).decode("ascii")
    return raw.rstrip("=")


def decode_cursor(cursor: Optional[str]) -> Optional[tuple[str, str]]:
    """Decode a cursor string. Returns `None` when cursor is None or empty.
    Raises ValueError on a malformed cursor."""
    if not cursor:
        return None

    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        raw = base64.urlsafe_b64decode(padded).decode("utf-8")
        decoded = json.loads(raw)
    except (ValueError, json.JSONDecodeError) as exc:
        raise ValueError(f"malformed cursor: {exc}") from exc

    if not isinstance(decoded, list) or len(decoded) != 2:
        raise ValueError("cursor must be a 2-tuple")

    natural_key, id_value = decoded
    if not isinstance(natural_key, str) or not isinstance(id_value, str):
        raise ValueError("cursor fields must be strings")

    return natural_key, id_value
