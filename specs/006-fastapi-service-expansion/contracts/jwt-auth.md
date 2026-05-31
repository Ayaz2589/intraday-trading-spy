# Contract: JWT Verification + User-ID Extraction

The auth boundary of the service. Defines how Supabase-issued JWTs are verified and how `user_id` flows through to every protected endpoint.

## Module surface

```python
# intraday_trade_spy.auth.token
def verify_jwt(token: str) -> UUID:
    """Verify a Supabase access token and return the auth.users.id (the `sub` claim).

    Raises AuthError on:
      - missing token / empty string
      - malformed JWT (not 3 dot-separated base64 segments)
      - signature mismatch (JWKS key doesn't validate)
      - expired (`exp` claim in the past)
      - wrong audience (`aud` claim != "authenticated")
      - missing or invalid `sub` claim
    """

# intraday_trade_spy.auth.jwks
def get_jwks(supabase_url: str) -> dict:
    """Return the JWKS for the project. Cached for 15 minutes.

    On cache miss: fetches {supabase_url}/auth/v1/.well-known/jwks.json with
    a 5-second timeout. On fetch failure: raises JWKSFetchError.
    """
```

```python
# intraday_trade_spy.api.deps
def auth_user_id(authorization: str = Header(...)) -> UUID:
    """FastAPI dependency that extracts and verifies the bearer token.

    Returns the auth.users.id UUID on success.
    Raises HTTPException(401) on any failure path.
    Emits a journal_events row with kind='auth_failure' for non-trivial
    failures (so the audit log captures rejected requests).
    """
```

## Verification algorithm

1. **Parse the header**: `Authorization: Bearer <jwt>`. Missing prefix or empty value → 401.
2. **Decode without verification** to read the `kid` (key ID) from the header.
3. **Fetch JWKS** (cached) and find the key matching `kid`. Missing kid → 401.
4. **Verify**:
   - `algorithms=["RS256", "ES256"]` (Supabase uses RS256 for legacy projects, ES256 for newer ones)
   - `audience="authenticated"`
   - `issuer="{SUPABASE_URL}/auth/v1"` (optional but recommended)
   - default `exp` / `nbf` / `iat` claim validation
5. **Extract `sub`** — this is the `auth.users.id`. Parse as UUID; non-UUID → 401.
6. **Return** the UUID.

## Audience requirement (critical)

The Supabase service-role JWT has `aud = "service_role"`. The user JWT has `aud = "authenticated"`. By insisting on `audience="authenticated"`, the service:
- Accepts user-issued JWTs (intended path).
- **Rejects service-role JWTs** even if someone tries to use one as a bearer token (FR-014).

This is THE mechanism that prevents service-role-key elevation through the API.

## JWKS cache behavior

- TTL: 15 minutes.
- Cache key: `supabase_url` (so multi-project test setups are isolated).
- On cache miss: HTTP GET with a 5-second timeout.
- On fetch failure: if cache has a stale entry, use it AND log a warning; if no cache entry, raise.
- Cache lives in-process (single-worker FastAPI). Restart clears it.

## Test obligations

| Test | Expected |
|---|---|
| `verify_jwt("")` | raises `AuthError` |
| `verify_jwt("not.a.jwt")` | raises `AuthError` (malformed) |
| `verify_jwt(<jwt-signed-with-wrong-key>)` | raises `AuthError` (signature) |
| `verify_jwt(<jwt-with-aud=service_role>)` | raises `AuthError` (wrong audience) |
| `verify_jwt(<jwt-with-exp-in-past>)` | raises `AuthError` (expired) |
| `verify_jwt(<valid-jwt>)` | returns `auth.users.id` UUID |
| `get_jwks(url)` second call within 15 min | does NOT hit the network (cache hit) |
| `get_jwks(url)` when network is down + no cache | raises `JWKSFetchError` |
| `get_jwks(url)` when network is down + stale cache exists | returns stale value + logs warning |

Integration tests use the local Supabase's JWT secret to mint test JWTs:

```python
# Helper in tests/api/integration/conftest.py
def mint_jwt(user_id: UUID, supabase_jwt_secret: str, aud: str = "authenticated") -> str:
    payload = {
        "aud": aud,
        "sub": str(user_id),
        "iat": int(time.time()),
        "exp": int(time.time()) + 3600,
        "role": "authenticated",
    }
    return jwt.encode(payload, supabase_jwt_secret, algorithm="HS256")
```

Note: local Supabase signs with HS256 + a known secret; the production project uses RS256/ES256 + JWKS. The auth module supports both because `algorithms=["HS256", "RS256", "ES256"]` is the test-time allowed list (production builds restrict to `["RS256", "ES256"]`).
