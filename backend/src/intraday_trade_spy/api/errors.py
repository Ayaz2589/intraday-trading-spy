"""Typed HTTP error responses.

Maps internal exceptions to documented machine-readable error codes per
contracts/endpoints.md. Every error response shape is:

    {"error": "machine_readable_code", "message": "Human-readable message"}
"""

from __future__ import annotations

from typing import Literal

from fastapi import HTTPException
from fastapi.responses import JSONResponse


ErrorCode = Literal[
    "missing_or_invalid_token",
    "forbidden",
    "not_found",
    "config_not_found",
    "validation_error",
    "concurrent_run_cap_exceeded",
    "download_cap_exceeded",
    "db_unreachable",
    "invalid_cursor",
    "internal_error",
]


def error_response(*, code: ErrorCode, message: str, status_code: int) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"error": code, "message": message},
    )


def raise_unauthorized(message: str = "missing or invalid token") -> None:
    raise HTTPException(
        status_code=401,
        detail={"error": "missing_or_invalid_token", "message": message},
    )


def raise_not_found(message: str = "resource not found") -> None:
    raise HTTPException(
        status_code=404,
        detail={"error": "not_found", "message": message},
    )


def raise_config_not_found(name: str) -> None:
    raise HTTPException(
        status_code=404,
        detail={
            "error": "config_not_found",
            "message": f"config '{name}' not found for this user",
        },
    )


def raise_validation_error(message: str) -> None:
    raise HTTPException(
        status_code=400,
        detail={"error": "validation_error", "message": message},
    )


def raise_invalid_cursor() -> None:
    raise HTTPException(
        status_code=400,
        detail={"error": "invalid_cursor", "message": "malformed pagination cursor"},
    )


def raise_concurrent_cap(active: int, cap: int) -> None:
    raise HTTPException(
        status_code=429,
        detail={
            "error": "concurrent_run_cap_exceeded",
            "message": f"user has {active} active runs; cap is {cap}",
            "active_runs": active,
            "cap": cap,
        },
    )


def raise_download_cap(active: int, cap: int) -> None:
    raise HTTPException(
        status_code=429,
        detail={
            "error": "download_cap_exceeded",
            "message": f"user has {active} active downloads; cap is {cap}",
        },
    )


def raise_db_unreachable(message: str = "database unreachable") -> None:
    raise HTTPException(
        status_code=503,
        detail={"error": "db_unreachable", "message": message},
    )
