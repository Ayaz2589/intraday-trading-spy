"""Exceptions for the storage layer.

CloudPushError is the base. Specializations narrow the failure mode for
clearer caller-side handling.
"""

from __future__ import annotations


class CloudPushError(Exception):
    """Base class for any error reaching, authenticating to, or writing to the cloud."""


class AuthError(CloudPushError):
    """Authentication / authorization failure (401/403, missing env vars)."""

    @classmethod
    def missing_env_vars(cls, names: list[str]) -> "AuthError":
        joined = ", ".join(names)
        return cls(
            f"Missing required environment variable(s) for --push-to-supabase: {joined}. "
            "See backend/.env.example for the expected names."
        )


class SchemaError(CloudPushError):
    """Schema / payload validation failure (Pydantic ValidationError or DB CHECK violation)."""


class PartialPushError(CloudPushError):
    """Invariant broken: push_run reported success but a verification check failed.

    Should never happen given the transactional Postgres function in 0030.
    If it does, the row state should be audited manually.
    """
