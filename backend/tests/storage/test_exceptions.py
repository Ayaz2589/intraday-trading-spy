"""Tests for storage exceptions (T029)."""

from __future__ import annotations

import pytest


def test_cloud_push_error_is_exception():
    from intraday_trade_spy.storage.exceptions import CloudPushError

    err = CloudPushError("network down")
    assert isinstance(err, Exception)
    assert "network down" in str(err)


def test_auth_error_subclasses_cloud_push_error():
    from intraday_trade_spy.storage.exceptions import AuthError, CloudPushError

    err = AuthError("missing service-role key")
    assert isinstance(err, CloudPushError)


def test_schema_error_subclasses_cloud_push_error():
    from intraday_trade_spy.storage.exceptions import SchemaError, CloudPushError

    err = SchemaError("CHECK constraint failed")
    assert isinstance(err, CloudPushError)


def test_partial_push_error_subclasses_cloud_push_error():
    from intraday_trade_spy.storage.exceptions import PartialPushError, CloudPushError

    err = PartialPushError("run row landed but trades did not")
    assert isinstance(err, CloudPushError)


def test_auth_error_lists_missing_env_vars_in_message():
    from intraday_trade_spy.storage.exceptions import AuthError

    err = AuthError.missing_env_vars(["SUPABASE_URL", "SUPABASE_USER_ID"])
    assert "SUPABASE_URL" in str(err)
    assert "SUPABASE_USER_ID" in str(err)
