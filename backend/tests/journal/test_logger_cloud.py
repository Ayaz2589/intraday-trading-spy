"""JournalLogger cloud-sink tests (T040)."""

from __future__ import annotations

from unittest import mock
from uuid import uuid4

import pytest


def test_log_cloud_event_appends_locally_without_client():
    from intraday_trade_spy.journal.logger import JournalLogger

    logger = JournalLogger()
    user_id = uuid4()
    logger.log_cloud_event(
        kind="cloud_push_success",
        user_id=user_id,
        message="ok",
    )
    events = logger.cloud_events()
    assert len(events) == 1
    assert events[0]["kind"] == "cloud_push_success"
    assert events[0]["user_id"] == str(user_id)
    assert events[0]["severity"] == "info"


def test_log_cloud_failure_uses_warning_severity():
    from intraday_trade_spy.journal.logger import JournalLogger

    logger = JournalLogger()
    user_id = uuid4()
    logger.log_cloud_event(
        kind="cloud_push_failure",
        user_id=user_id,
        message="boom",
    )
    events = logger.cloud_events()
    assert events[0]["severity"] == "warning"


def test_log_cloud_event_writes_to_supabase_when_client_provided():
    from intraday_trade_spy.journal.logger import JournalLogger

    fake_client = mock.MagicMock()
    fake_client._client = mock.MagicMock()
    fake_table = mock.MagicMock()
    fake_client._client.table.return_value = fake_table
    fake_table.insert.return_value = fake_table
    fake_table.execute.return_value = mock.MagicMock(data=[])

    logger = JournalLogger(supabase_client=fake_client)
    user_id = uuid4()
    logger.log_cloud_event(
        kind="cloud_push_success",
        user_id=user_id,
        run_id=uuid4(),
        message="ok",
    )
    fake_client._client.table.assert_called_with("journal_events")
    fake_table.insert.assert_called_once()


def test_log_cloud_event_swallows_supabase_failures():
    """A cloud-side failure when recording the cloud event must not raise —
    the local record is what matters when we're already in a failure path."""
    from intraday_trade_spy.journal.logger import JournalLogger

    fake_client = mock.MagicMock()
    fake_client._client.table.side_effect = Exception("network down")

    logger = JournalLogger(supabase_client=fake_client)
    # Must not raise
    logger.log_cloud_event(
        kind="cloud_push_failure",
        user_id=uuid4(),
        message="local record",
    )
    assert len(logger.cloud_events()) == 1
