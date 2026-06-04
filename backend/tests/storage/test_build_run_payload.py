"""T004 (Feature 014, FR-001/004/013) — in-memory payload builder + parity.

`build_run_payload()` maps a BacktestResult directly to a PushRunPayload,
skipping the run-dir round trip. The refactor is parity-locked: for the same
engine result, the in-memory payload must equal the file-based
`gather_run_outputs()` payload (modulo the per-row uuid4 ids).
"""

import json
from uuid import UUID, uuid4

import pytest

from intraday_trade_spy.storage.push import (
    build_run_payload,
    gather_run_outputs,
    write_run_outputs,
)

USER_ID = UUID("11111111-1111-1111-1111-111111111111")
CONFIG_ID = UUID("22222222-2222-2222-2222-222222222222")
STRATEGY_ID = UUID("33333333-3333-3333-3333-333333333333")
STUDY_ID = UUID("44444444-4444-4444-4444-444444444444")


def _build(result, run_id, **tags):
    return build_run_payload(
        result,
        user_id=USER_ID,
        config_id=CONFIG_ID,
        strategy_id=STRATEGY_ID,
        run_id=run_id,
        **tags,
    )


def test_run_row_maps_engine_result(engine_result):
    run_id = uuid4()
    payload = _build(engine_result, run_id)
    fp = engine_result.run.data_fingerprint

    row = payload.run
    assert row.id == run_id
    assert row.user_id == USER_ID
    assert row.config_id == CONFIG_ID
    assert row.strategy_id == STRATEGY_ID
    assert row.status == "finished"
    assert row.range_start == fp.earliest_timestamp.date()
    assert row.range_end == fp.latest_timestamp.date()
    assert row.bar_count == fp.bar_count
    assert row.data_fingerprint == fp.sha256
    assert row.app_version == engine_result.run.code_version
    # Standalone by default: no study tags.
    assert row.study_id is None and row.segment is None and row.window_index is None


def test_study_tags_are_applied(engine_result):
    payload = _build(
        engine_result, uuid4(), study_id=STUDY_ID, segment="validation", window_index=3
    )
    assert payload.run.study_id == STUDY_ID
    assert payload.run.segment == "validation"
    assert payload.run.window_index == 3


def test_write_run_outputs_serializes_summary_with_trades(engine_result, tmp_path):
    """Regression (found by 014's parity work): the API task's inline summary
    write used model_dump() WITHOUT mode="json", crashing on the Feature 010
    equity-curve Timestamps for ANY run with trades — every API-started
    backtest with trades failed at persist. The shared writer is the fix:
    one writer for CLI + API, mode="json" always."""
    assert engine_result.summary.total_trades > 0, "fixture must produce trades"

    run_dir = write_run_outputs(engine_result, tmp_path)

    assert (run_dir / "journal.csv").exists()
    assert (run_dir / "run.yaml").exists()
    data = json.loads((run_dir / "summary.json").read_text())
    assert data["total_trades"] == engine_result.summary.total_trades
    assert len(data["equity_curve"]) > 1  # the part that used to crash


def test_parity_with_gather_run_outputs(engine_result, tmp_path):
    """The constitution-IV lock on the refactor: in-memory build ≡ file round
    trip (via the real production writer) for the same engine result. Row ids
    (and the signal→trade links) are uuid4-per-call, so they are normalized
    out before comparison."""
    run_dir = write_run_outputs(engine_result, tmp_path)

    run_id = uuid4()
    via_files = gather_run_outputs(
        run_dir, user_id=USER_ID, config_id=CONFIG_ID,
        strategy_id=STRATEGY_ID, run_uuid=run_id,
    )
    via_memory = _build(engine_result, run_id)

    # created_at / status_updated_at are wall-clock default_factory metadata
    # (DB defaults in practice) — not payload semantics; everything else must
    # match exactly.
    mem_run = via_memory.run.model_dump(mode="json", exclude={"created_at", "status_updated_at"})
    file_run = via_files.run.model_dump(mode="json", exclude={"created_at", "status_updated_at"})
    assert mem_run == file_run

    def _strip(rows):
        out = []
        for r in rows:
            d = r.model_dump(mode="json")
            d.pop("id", None)          # uuid4 per call
            d.pop("trade_id", None)    # links the per-call trade uuid
            d.pop("created_at", None)  # wall-clock default_factory metadata
            out.append(d)
        return out

    assert _strip(via_memory.trades) == _strip(via_files.trades)
    assert _strip(via_memory.signals) == _strip(via_files.signals)
    assert _strip(via_memory.journal_events) == _strip(via_files.journal_events)


def test_executed_signals_link_their_trade(engine_result):
    payload = _build(engine_result, uuid4())
    if not payload.trades:
        pytest.skip("fixture produced no trades — parity covered elsewhere")
    trade_ids = {t.id for t in payload.trades}
    executed = [s for s in payload.signals if s.executed]
    assert executed, "expected at least one executed signal alongside trades"
    assert all(s.trade_id in trade_ids for s in executed)
