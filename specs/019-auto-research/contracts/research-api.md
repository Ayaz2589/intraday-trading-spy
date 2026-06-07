# Contract — Campaign API (`/api/research`)

All endpoints require the standard bearer auth (`auth_user_id`); all reuse the
existing error envelope (`{detail: {error, message}}`).

## POST `/api/research/campaigns` → 202

Start a campaign. Body:

```jsonc
{
  "config_name": "default",     // required; must exist
  "budget": 6                   // optional; default research.default_budget
}
```

Responses:
- `202` `CampaignView` (below) with `status: "running"`, `cycles: []`.
- `404 config_not_found` — unknown config name.
- `409 campaign_already_running` — the partial unique index's rule surfaced
  as a clear error; message names the running campaign id.
- `422` — body validation.

## GET `/api/research/campaigns` → 200

```jsonc
{ "campaigns": [CampaignView, …],        // newest first
  "default_budget": 6 }                   // from config — seeds the launch form
```

## GET `/api/research/campaigns/{id}` → 200 | 404

`CampaignView` — the poll target (SC-007).

## POST `/api/research/campaigns/{id}/cancel` → 200 | 404 | 409

Sets `cancel_requested`; the engine halts at the next stage boundary with
verdict `cancelled`. `409 not_running` when the campaign already halted.

## CampaignView

```jsonc
{
  "id": "…", "seq": 7,
  "starting_config_name": "default",
  "budget": 6,
  "trials_used": 3,                  // candidates tried so far (ledger rows written)
  "status": "running",               // running | halted | failed
  "verdict": null,                   // ready_for_lockbox | stop_tuning | budget_exhausted | cancelled | failed
  "verdict_detail": null,            // {candidate, reason, failed_stage…}
  "thresholds": {"base_alpha": 0.05},
  "cycles": [ CycleEntry, … ],       // data-model.md shape, verbatim
  "created_at": "…", "updated_at": "…"
}
```

## Invariants (tested)

- No endpoint in this router can mutate the lockbox ledger; a contract test
  runs a full campaign against the stub storage and asserts the lockbox
  table writes are zero (SC-003).
- `GET` responses are pure reads of the persisted row — the poll never
  triggers computation.
- Verdict+status flip is atomic (single update) and happens exactly once.
