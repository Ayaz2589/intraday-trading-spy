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
