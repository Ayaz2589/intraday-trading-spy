from pathlib import Path

import pytest

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def sample_csv_path() -> Path:
    return FIXTURES / "spy_5m_sample.csv"


@pytest.fixture
def adversarial_future_leak_csv_path() -> Path:
    return FIXTURES / "adversarial_future_leak.csv"


@pytest.fixture
def default_config_path() -> Path:
    return Path(__file__).parent.parent / "config" / "config.yaml"
