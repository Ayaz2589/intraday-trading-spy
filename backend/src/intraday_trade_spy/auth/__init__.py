"""Supabase JWT verification module.

Public surface — see specs/006-fastapi-service-expansion/contracts/jwt-auth.md.
"""

from intraday_trade_spy.auth.jwks import JWKSFetchError, get_jwks
from intraday_trade_spy.auth.token import AuthError, verify_jwt

__all__ = ["AuthError", "JWKSFetchError", "get_jwks", "verify_jwt"]
