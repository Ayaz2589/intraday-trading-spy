# Phase 0 Research: Historical SPY Loader — yfinance Downloader

Each decision below answers a "NEEDS CLARIFICATION" implicit in the
spec or technical context, with rationale and rejected alternatives.

---

## Decision 1 — Mock at the library boundary, not the HTTP boundary

**Decision**: Tests mock `yfinance.download` via
`unittest.mock.patch("yfinance.download")`. They do NOT mock HTTP.

**Rationale**:
- yfinance's HTTP layer is undocumented, frequently changed by Yahoo,
  and patched by yfinance maintainers on a rolling basis. Mocking
  HTTP couples our tests to that churn.
- yfinance's `download()` signature is the project's documented public
  API surface. Mocking there gives us a stable contract that survives
  upstream patches.
- The Downloader class accepts an optional `download_fn` parameter
  defaulting to `yfinance.download`. Tests inject a mock; production
  uses the real function. No `monkeypatch` needed at runtime.

**Alternatives considered**:
- *responses / httpx_mock*: HTTP-level mocking — too brittle for the
  reasons above.
- *vcrpy cassettes*: works, but cassettes go stale and committing them
  to git is awkward. Mock at the library boundary is simpler.

---

## Decision 2 — Chunker is a pure function

**Decision**: `iter_windows(start: date, end: date, max_days: int) -> list[tuple[date, date]]` lives in `data/downloader.py` and has zero
dependencies. It is fully unit-tested without any yfinance import.

**Rationale**:
- The chunker is the single most logic-heavy piece of the feature.
  Keeping it pure makes its tests trivial and fast.
- The downloader composes the chunker with `download_fn`, so the
  network-touching code path is one line wrapping the pure chunker.

**Alternatives considered**:
- *Chunker as a method on the Downloader class*: ties pure logic to a
  class with I/O; harder to test in isolation.

---

## Decision 3 — Date validation centralized in `DownloadRequest`

**Decision**: All validation (start ≤ end, no future dates, ≤730-day
range for 5m) lives in a single Pydantic v2 model,
`DownloadRequest`. The CLI parses argparse → strings →
`DownloadRequest`; if construction fails, the CLI prints the
ValidationError and exits with code 2.

**Rationale**:
- Single source of truth for date validation. The downloader, the
  CLI, and any future test can construct a `DownloadRequest` and
  trust the invariants.
- Pydantic v2's `model_validator` + `field_validator` is more
  expressive than argparse's `type=` callable.

**Alternatives considered**:
- *Validation in argparse via custom `type=` functions*: works but
  scatters logic; harder to test in isolation.
- *Validation inside the Downloader class*: tangles construction with
  business logic.

---

## Decision 4 — Socket-blocker autouse fixture for SC-005

**Decision**: `backend/tests/conftest.py` defines a session-scope
autouse fixture that monkey-patches `socket.socket` to raise
`RuntimeError("network access blocked in offline test")` unless the
current test is marked `slow`.

**Rationale**:
- SC-005 says "running `pytest -m 'not slow'` issues zero network
  calls." Without enforcement, this property is easy to violate
  silently (a future contributor adds a real call in a test).
  Patching `socket.socket` makes the violation impossible.
- Session scope + autouse means tests don't need to opt in
  individually.
- The `slow` marker is the opt-in. The fixture inspects
  `request.node.get_closest_marker("slow")` and skips the patch for
  those tests.

**Alternatives considered**:
- *Run the test suite under a network-namespace tool (e.g., `unshare
  -n`)*: portable issues across macOS / Linux; harder to onboard a
  developer.
- *Just trust developers not to add network calls*: violates Cunningham's
  Law (we'd find out via flaky CI).

---

## Decision 5 — `output_sha256` is computed after write

**Decision**: The downloader writes the CSV to disk, then reads the
bytes back, hashes them with SHA-256, and stores the digest in the
sidecar manifest. It does NOT hash the in-memory DataFrame's
representation.

**Rationale**:
- The on-disk CSV bytes are what the user inspects and shares. Hashing
  the in-memory DataFrame would produce a digest that doesn't match
  `sha256sum <csv>`.
- It's also robust to any platform-specific differences in line
  endings or encoding (those are encoded once in the file; the hash
  then matches that one canonical form).

**Alternatives considered**:
- *Hash the DataFrame's pickled representation*: opaque to users.
- *Skip the hash*: undermines provenance / reproducibility.

---

## Decision 6 — Determinism via fixed float-format strings

**Decision**: The CSV writer formats `open`, `high`, `low`, `close`
with `"{:.4f}"` and `volume` as integer. The mock yfinance fixture
returns a fixed DataFrame with values that survive that
round-trip.

**Rationale**:
- yfinance returns numpy float64 with non-trivial precision; without
  fixed formatting, identical inputs could produce
  non-byte-identical outputs across platforms (rare but real for
  edge-case floats).
- Same format strings as Feature 001's journal exporter, so Feature
  001's `load_bars()` parses the file with no surprises.

**Alternatives considered**:
- *Default pandas `to_csv` behavior*: precision-dependent on numpy's
  repr; not portable.
- *JSON output*: not the CSV contract Feature 001 expects.

---

## Decision 7 — `data_source` field in the manifest

**Decision**: The downloader accepts an optional `data_source: Literal["yfinance", "mock"]` parameter. In production, the CLI passes
`"yfinance"`. In tests, the conftest fixture injects `"mock"` along
with the mocked `download_fn`. This appears verbatim in the manifest.

**Rationale**:
- A user looking at a downloaded CSV needs to instantly know whether
  it's real Yahoo data or a fixture; the `data_source` field
  surfaces that without ambiguity.
- Coupling the `data_source` label to the mocked `download_fn`
  prevents a "real yfinance call that was labeled mock" bug.

**Alternatives considered**:
- *Infer from whether `download_fn` is the real function*: brittle;
  any wrapping decorator would break inference.

---

## Decision 8 — Retry on HTTP 429: one retry, 5-second sleep

**Decision**: The downloader catches any exception whose string
representation contains "429" (yfinance's HTTP exceptions vary by
version), sleeps 5 seconds via `time.sleep`, and retries the chunk
exactly once. If the retry also raises, the failure propagates.

**Rationale**:
- One retry handles transient Yahoo throttling without escalating
  into a long-running CLI that masks real issues.
- 5 seconds is empirically Yahoo's typical cool-down for residential
  IPs. No exponential-backoff library needed for a single retry.
- Tests can patch `time.sleep` to make the retry instant; tests for
  the retry path assert the patched sleep was called once with `5`.

**Alternatives considered**:
- *tenacity library*: powerful but overkill for one retry.
- *Indefinite exponential backoff*: hides real outages.

---

## Decision 9 — Constants live in module-top, not config.yaml

**Decision**: `MAX_CHUNK_DAYS = 60`, `MAX_5M_HISTORY_DAYS = 730`,
`RETRY_BACKOFF_SECONDS = 5`, and `RETRY_MAX_ATTEMPTS = 2` live at the
top of `data/downloader.py` as module constants. They are NOT
duplicated into `backend/config/config.yaml`.

**Rationale**:
- These are yfinance-specific tunables, not strategy / risk
  parameters. Constitution principle III's "no hardcoded magic
  numbers" rule applies to limits / thresholds / session times that
  affect trading behavior — these don't.
- Keeping them at the top of the module makes them visible to any
  reader of `downloader.py`; future tuning is a one-line change.

**Alternatives considered**:
- *Put them in config.yaml*: pollutes the trading config with
  data-source plumbing.

---

## Decision 10 — Sidecar manifest is YAML, not JSON

**Decision**: The fetch manifest is written as YAML at
`<csv>.fetch.yaml`. Same library (PyYAML), same writer options as
Feature 001's `run.yaml`.

**Rationale**:
- Consistency with Feature 001's `run.yaml`. Users learn one format.
- YAML is more diffable and human-editable than JSON, which matters
  for a provenance artifact someone might paste into a notebook.

**Alternatives considered**:
- *JSON*: easier programmatic parsing, but harder to read in a
  terminal.
- *TOML*: third format in the project; not worth the cognitive load.
