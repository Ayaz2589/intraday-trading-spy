# Test Inventory — Feature 007 retirement of pre-feature static-server tests

**Generated**: 2026-05-31 (T032a)

Per SC-007: "every existing Feature 003 test that exercised the pre-feature UI either still passes against the migrated UI OR is explicitly retired with a documented replacement, with zero tests left in an 'unknown state.'"

## Retired (deleted in T032b)

| File | What it tested | Why retired | Replacement |
|---|---|---|---|
| `frontend/src/api/client.test.ts` (old) | Feature 003's `fetchRuns`/`fetchJournal` against `localhost:8000` static server | The static-server API is no longer used by the UI (FR-017). The `fetchRuns`/`fetchJournal` functions are deleted. | `frontend/src/api/client.test.ts` (new — to be added in T020) — tests the FastAPI-fetch wrapper with Authorization headers + 401 refresh-retry |
| `frontend/src/api/types.test.ts` (old) | Pre-feature type-shape tests (`RunSummaryView`, `JournalRowView`, `BarView` etc.) | Those types are gone; the new types live in `frontend/src/api/types.ts` and match Feature 006's contracts. | TypeScript's structural typing + the contract-shaped tests in `frontend/src/api/*.test.ts` cover this |

## Kept (still passing against new code)

The following Feature 003/004 tests cover components that are still in the UI; they were ported transparently when the imports updated:

| File | Notes |
|---|---|
| `frontend/src/components/*.test.tsx` | Most Feature 003/004 component tests (chart, journal table, summary, etc.) still target the same components. They were already passing pre-feature; they continue to pass post-feature. |

## Deleted source files

These legacy source files no longer have callers and are removed in T032b:

- `frontend/src/api/client.ts` (legacy) — overwritten by the new typed FastAPI wrapper.
- `frontend/src/api/types.ts` (legacy) — overwritten by the new types matching Feature 006's contracts.

## Notes

The migration is additive at the directory level: new files (auth/, hooks/, lib/active-runs-tracker.ts, etc.) live alongside Feature 003/004 code. Pre-feature components used by the new routes are kept and reused.

## Deferred from the Feature 007 implementation phase

The following tasks were intentionally deferred from this milestone and remain outstanding in `tasks.md`. They are NOT blockers for SC-001 / SC-005 / SC-008, but should be closed before tagging the feature complete:

| Task | What | Why deferred |
|---|---|---|
| T079–T086 | Per-component unit tests for `RunsList`, `RunRow`, `RunDetail`, `TradesTable`, `SignalsTable`, `JournalTable`, `StartBacktestDialog`, `RunSummaryCards` | Structural coverage delivered via the F007 HelpTooltip coverage test + RunRow status/failure tests. Per-component tests are nice-to-have for regression isolation but the integration behavior is exercised by the live MFA runbook + quickstart. |
| T087 | run-lifecycle msw integration test | Requires `msw` server harness for the runs router. Time-boxed out of this milestone. |
| T088 | background-polling integration test | Same as T087; depends on T106. |
| T106 | `useBackgroundPolling()` mount on `_authenticated.tsx` | The tracker is in place (`lib/active-runs-tracker.ts`) but its polling-side-effect hook is not yet mounted across routes. Manual workaround: leave the runs tab open. |
| T127 / T127a | Data-source picker shows finished data-download jobs in `StartBacktestDialog` | Needs a backend `listDataDownloads` endpoint that doesn't exist yet (Feature 008 territory). Deferred. |
| T131 | `/speckit-analyze` final gate | Manual reviewer task. |
| T132 | Live quickstart end-to-end sign-off | Manual reviewer task; quickstart.md covers the steps. |
