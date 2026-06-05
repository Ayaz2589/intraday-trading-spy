# Feature 017 — Clickable Claude Experiments → Draft Configs

**Date**: 2026-06-05 · **Status**: approved (brainstormed in-session; user
chose "feature 017 via speckit") · **Depends on**: 016 (merged PR #3) +
016-polish (merged PR #4)

## Goal

Close the loop from *advisory insight* to *operator action*: an experiment in
Claude's read that is expressible as existing config-knob changes becomes a
one-click **"Draft config →"** that lands on the Strategies page with a
pre-filled, clearly-badged draft the operator reviews, names, creates, and
runs — themselves.

Origin: live 016 e2e — Claude's wf-rr3/default analysis suggested 4
experiments; turning the knob-sweep class of them into runnable configs
today requires manual transcription.

## Constitution II boundary (the design's spine)

016 explicitly excluded "automated parameter optimization from Claude
output". This feature stays advisory because:

1. **No write path**: the draft travels in a URL search param, never the DB.
   Claude's output cannot create, modify, activate, or run anything.
2. **Human is the actor**: the Strategies create-form opens pre-filled and
   badged *"drafted from Claude's experiment — review before creating"*;
   creation requires the operator's explicit action, same form, same
   validation as a manual config.
3. **Whitelist**: suggested changes are restricted server-side to the
   registered tunable knob paths (the 011 sensitivity-knob registry — e.g.
   `strategy.vwap_pullback.target.risk_reward`,
   `strategy.vwap_pullback.max_distance_from_vwap_pct`, risk caps). Anything
   off-whitelist is dropped at parse time and the experiment renders
   text-only.
4. **Same guardrails as manual**: Pydantic schema validation on create;
   nothing auto-activates; runs are launched by the operator.
5. **Provenance**: a created draft records its origin in the config
   description ("from Claude analysis <id>, experiment <n>") — durable audit
   trail (Principle VII).

## Components

### Backend
- **Schema**: `ClaudeExperiment` gains optional
  `suggested_config_changes: list[ConfigChange]` where
  `ConfigChange = {knob_path: str, value: float}`. Part of the
  `messages.parse()` output format — Claude returns structured deltas when an
  experiment is knob-expressible, omits otherwise.
- **Whitelist module**: single source of truth for tunable knob paths +
  bounds, shared with (or derived from) the sensitivity-knob registry.
  Off-whitelist or out-of-bounds suggestions are stripped post-parse (kept in
  the stored analysis jsonb verbatim is NOT done — stored analysis holds the
  already-sanitized version, so the UI can trust it).
- **System prompt**: extend the methodology glossary with the knob registry
  (paths + meaning + bounds) and the instruction to express experiments as
  deltas when possible, free-text otherwise.

### Frontend
- **ClaudeReadCard**: experiments with non-empty sanitized changes render a
  "Draft config →" button; clicking navigates to
  `/strategies?draft=<base64url(JSON)>` carrying {base_config_name, changes,
  analysis_id, hypothesis}. Text-only experiments are unchanged.
- **Strategies page**: on mount with a `draft` search param, open the
  existing create/duplicate-config flow pre-filled: base = cited config (fall
  back to active), suggested knobs applied + visually highlighted, suggested
  name (`<base>-exp-<n>`), provenance line in description; badge the form
  "drafted from Claude's experiment — review before creating". Dismissing
  clears the param.

## Edge cases
- Old stored analyses (no `suggested_config_changes`) → text-only, no button.
- All suggestions stripped by the whitelist → text-only.
- Base config deleted since analysis → fall back to active config, note it.
- Malformed/hand-edited `draft` param → toast + plain Strategies page.

## Testing (TDD per constitution)
- Backend: schema round-trip; whitelist strips off-list paths and
  out-of-bounds values (hand-built fixtures); prompt contains registry;
  stored analysis holds sanitized changes (SDK mocked, as in 016).
- Frontend: button renders only for experiments with changes; click encodes
  the param; Strategies page prefill (base, highlights, name, badge,
  provenance); malformed-param fallback; census/help tooltips
  (`claude_experiment_draft` concept).
- Live e2e: regenerate the insights analysis (schema change → new payload
  hash → fresh call), click a knob experiment, create the config, run a
  study on it.

## Out of scope
- Auto-creating/activating/running anything from Claude output (Principle II).
- New-strategy-code experiments (e.g. "add a regime filter") — text-only.
- Editing the whitelist from the UI.
- Backfilling old analyses with structured suggestions.
