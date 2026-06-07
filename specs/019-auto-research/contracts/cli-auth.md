# Contract — CLI session lifecycle (email-OTP)

The CLI is a *public client*: it holds only the anon key (already public in
every browser bundle) and user-scoped tokens. The service-role key is never
read by CLI code paths — a test asserts `SUPABASE_SERVICE_ROLE_KEY` is absent
from the CLI module's environment access.

## Login (one-time, interactive)

```
1. CLI → GoTrue: POST {SUPABASE_URL}/auth/v1/otp
       headers: apikey: <anon>
       body: {"email": "<operator email>", "create_user": false}
2. operator reads the 6-digit code from email, pastes it
3. CLI → GoTrue: POST {SUPABASE_URL}/auth/v1/verify
       headers: apikey: <anon>
       body: {"type": "email", "email": "…", "token": "<code>"}
   ← {access_token, refresh_token, expires_in/expires_at, user}
4. CLI writes session file (0600): {supabase_url, email, access_token,
   refresh_token, expires_at}
```

`create_user: false` — login never provisions accounts; an unknown email gets
GoTrue's error surfaced verbatim.

## Per-command token use

```
if expires_at < now + 60s:  refresh()
request → API with Authorization: Bearer <access_token>
on 401:  refresh() once, retry once; still 401 → exit 3 with login hint
```

## Refresh

```
POST {SUPABASE_URL}/auth/v1/token?grant_type=refresh_token
   headers: apikey: <anon>
   body: {"refresh_token": "<stored>"}
← new {access_token, refresh_token, …}   // rotation: BOTH replaced atomically
```

Refresh failure (revoked/expired) → delete nothing, exit 3 with the login
hint (the operator may retry; `login` overwrites).

## Security invariants (each is a test)

- Session file mode is 0600; a group/world-readable existing file is
  rewritten with corrected mode and a warning.
- No CLI command ever sends `SUPABASE_SERVICE_ROLE_KEY` in any header/body.
- Tokens never appear in stdout/stderr/logs (including `--json` output and
  error paths).
- The API keeps rejecting `aud != authenticated` (FR-014 of 007) — this
  feature adds no API auth changes.
