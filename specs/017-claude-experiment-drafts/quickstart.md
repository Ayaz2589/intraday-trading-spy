# Quickstart — 017 Clickable Claude Experiments → Draft Configs

## One-time setup

```bash
# Migration 0124 (cloud, direct-psycopg route): configs.description
# (apply via the established .venv/psycopg + SUPABASE_DB_URL pattern)

# Backend container rebuild (baked code)
docker compose up -d --build backend
```

No new dependencies; ANTHROPIC_API_KEY already configured (016).

## Run the tests

```bash
cd backend
PYTHONPATH=. .venv/bin/pytest tests/validation/test_knobs.py -q          # registry + adversarial sanitation
PYTHONPATH=. .venv/bin/pytest tests/api/new/test_claude_analyst.py \
                              tests/api/new/test_configs_description.py -q

cd ../frontend
npm test -- --run draft-config ClaudeReadCard DraftConfigPanel config-manager
npx tsc --noEmit
```

## SC-001 walkthrough (the acceptance moment)

1. Insights page → Claude's read → **Regenerate** (enabled once — the
   schema-version bump marks pre-017 analyses stale; one fresh paid call).
2. Expand **EXPERIMENTS TO RUN** → at least one card shows
   `knob → value` chips (SC-006) → click **Draft config →**.
3. Strategies page opens with the badged draft panel: base config resolved,
   suggested values highlighted against base, name `<base>-exp-<n>`,
   provenance line. Edit anything → **Create**.
4. The new config appears in the list with its description (provenance);
   launch a walk-forward study on it. Under 2 minutes, zero hand-transcribed
   values (SC-001).
5. Negative checks: dismiss a draft → nothing persisted; hand-mangle the
   `?draft=` param → friendly notice, page fine; a pre-017 analysis renders
   text-only experiments (SC-005).
