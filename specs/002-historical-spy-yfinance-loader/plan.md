# Implementation Plan: Historical SPY Loader — yfinance Downloader

**Branch**: `002-historical-spy-yfinance-loader` | **Date**: 2026-05-28 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-historical-spy-yfinance-loader/spec.md`

## Summary

Build a CLI that downloads real SPY 5-minute bars from Yahoo Finance via
`yfinance` and writes a CSV in the schema Feature 001's `load_bars()`
already expects. Adds a chunker for ranges that exceed yfinance's
~60-day intraday window, a fetch-manifest sidecar for provenance, and a
mocking layer so tests run offline.

Architecturally, the feature adds a small `data/downloader.py` module
(pure-function chunker + downloader class accepting an injectable
`download_fn`) and a `cli/download_spy_data.py` (argparse + Pydantic
`DownloadRequest`). The CLI is the only new entry point; no changes to
Feature 001 are required to consume the output. Per constitution
v1.1.0 principle IV, every implementation task is preceded by a
failing-test task. The only exempt file is the ≤5-line script wrapper
at `backend/scripts/download_spy_data.py`.

## Technical Context

**Language/Version**: Python 3.11+ (same as Feature 001).

**Primary Dependencies**: Pydantic v2, pandas, PyYAML (all from Feature
001); adds `yfinance>=0.2.40` (data source library). Test deps:
pytest, pytest-cov, `unittest.mock` (stdlib), the existing
freezegun. No new HTTP libraries — we mock at the
`yfinance.download` boundary, not the HTTP boundary.

**Storage**: Filesystem only. Output CSV at
`backend/data/raw/spy_{timeframe}_{start}_{end}.csv`; sidecar YAML at
`<csv>.fetch.yaml`. No database.

**Testing**: pytest with a new mark, `slow`, for the single integration
test that hits the real yfinance API. Default invocation
(`pytest -m "not slow"`) runs offline. A session-scope autouse fixture
patches `socket.socket` to fail any non-`slow` test that attempts a
network call (enforces SC-005). 100% line coverage required for
`data/downloader.py` and the chunker (SC-002).

**Target Platform**: macOS / Linux developer machines. Same as Feature
001.

**Project Type**: Extends Feature 001's web-application monorepo
backend. No frontend changes. Feature 001's `frontend/` placeholder
remains untouched.

**Performance Goals**: 30-day fetch in <60 seconds end-to-end on a
residential connection (SC-001). Most of that is network latency; the
chunker and writer overhead is negligible.

**Constraints**:
- No real network calls under default `pytest` invocation
  (constitution principle IV gated by test-first; SC-005 enforced by
  socket-blocker fixture).
- Byte-identical reproducibility when mocked (SC-004). Realized via
  deterministic mock DataFrames and fixed float-format strings.
- America/New_York is the only timezone written to the CSV (Feature
  001's loader contract).
- Symbol is hardcoded SPY (constitution principle I); no `--symbol`
  flag.

**Scale/Scope**: Single symbol. Up to ~750 days of 5m bars
(~58k rows) per fetch — comfortable in memory. ~3 new source modules,
~5 new test files.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Source of truth: `.specify/memory/constitution.md` (v1.1.0). For each
principle below, state which parts of this feature touch it and prove
non-violation. If a tension exists, defer the justification to the
**Complexity Tracking** table at the bottom of this plan.

| # | Principle | Touched? | How this plan complies |
|---|-----------|---------|------------------------|
| I | SPY-Only Instrument (NON-NEGOTIABLE) | yes | `DownloadRequest` has no symbol field; the downloader's `symbol` parameter is typed `Literal["SPY"]`. CLI exposes no `--symbol`, `--ticker`, or `--instrument` flag. Test `test_cli_help_does_not_list_symbol_flag` covers it. |
| II | Long-Only, Rule-Based v1 (NON-NEGOTIABLE) | not touched | This feature is data I/O — no strategy, no signal, no trade direction. |
| III | Risk Manager Has Absolute Veto (NON-NEGOTIABLE) | not touched | No order placement; no trade lifecycle. |
| IV | Test-First Everywhere (NON-NEGOTIABLE, v1.1.0) | yes | Every implementation task in `tasks.md` for `data/downloader.py`, `cli/download_spy_data.py`, and any helper module is preceded by a failing-test task. `backend/scripts/download_spy_data.py` is a 3-line wrapper (exempt per the principle's exempt list). |
| V | Paper-First, Live Trading Disabled by Default (NON-NEGOTIABLE) | not touched | No broker code; no order code. |
| VI | Educational UI: Every Concept Is Explained | not touched | No UI in this feature. |
| VII | Journal Everything | partial | The `<csv>.fetch.yaml` sidecar IS the journal for the data-acquisition event. FR-008 enumerates the fields. The downloader's data_source field (`yfinance` vs `mock`) makes test runs distinguishable from real runs. |

**Engineering standards check:**

- [x] Timezone is `America/New_York` for any time logic written to disk.
- [x] Tunable constants (the 60-day chunk window, the 730-day history
      limit, the 5-second retry backoff) live in the module's
      top-of-file constants block — adjustable without spec change.
- [x] Backend code is Python ≥3.11 / Pydantic v2 / pytest.

**Gate verdict: PASS.** No NON-NEGOTIABLE violation. No entry in
Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/002-historical-spy-yfinance-loader/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── cli-download.md
│   ├── csv-output-schema.md
│   └── fetch-manifest-schema.md
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (only new / modified files; reference Feature 001's plan.md for the unchanged tree)

```text
backend/
├── pyproject.toml                                # MODIFIED — adds yfinance>=0.2.40 to dependencies; adds [tool.pytest.ini_options.markers] entry for `slow`
├── scripts/
│   └── download_spy_data.py                      # NEW — 3-line wrapper (exempt from TDD per principle IV)
├── src/
│   └── intraday_trade_spy/
│       ├── data/
│       │   └── downloader.py                     # NEW — DownloadRequest, FetchResult, FetchManifest, Chunker, Downloader class
│       └── cli/
│           └── download_spy_data.py              # NEW — argparse → DownloadRequest → Downloader; stdout / exit codes
└── tests/
    ├── conftest.py                               # MODIFIED — adds session-scope socket-blocker autouse fixture; adds mock_yfinance_download fixture
    ├── test_chunker.py                           # NEW — iter_windows(start, end, max_days)
    ├── test_downloader.py                        # NEW — Downloader behavior under mocked yfinance: chunking, retry, NaN-volume drop, column normalization, manifest contents
    ├── test_download_cli.py                      # NEW — CLI surface: flag handling, exit codes, --help omits --symbol, --force, --no-progress
    ├── test_fetch_manifest.py                    # NEW — FetchManifest model validation + sha256 round-trip
    └── test_yfinance_integration.py              # NEW — single test marked @pytest.mark.slow that hits real yfinance and asserts Feature 001's load_bars() consumes the output
```

**Structure Decision**: Extension of Feature 001's monorepo. No new
top-level directories. `frontend/`, `docs/`, and Feature 001's other
backend modules are untouched.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

*(No entries — Constitution Check passed.)*

## Phase 0 — Research

See [research.md](./research.md) for the decisions on:

1. Mock-at-library-boundary vs mock-at-HTTP-boundary.
2. Chunker as a pure function (no yfinance dependency).
3. Date validation centralized in a Pydantic `DownloadRequest`.
4. Socket-blocker fixture for SC-005 enforcement.
5. `output_sha256` computed after write (not from in-memory bytes).
6. Determinism via fixed float-format strings.
7. `data_source` field distinguishes mock from live.
8. 429 retry policy (one retry, 5-second sleep, no backoff library).

## Phase 1 — Design & Contracts

- Data model: see [data-model.md](./data-model.md).
- CLI surface and on-disk formats: see [contracts/](./contracts/).
- Developer quickstart: see [quickstart.md](./quickstart.md).

## Phase 2 — Tasks

Generated separately by `/speckit-tasks`. Output lands at
`specs/002-historical-spy-yfinance-loader/tasks.md`.
