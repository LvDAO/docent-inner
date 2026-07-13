import pytest

from docent_core._db_service.db import get_pg_params, get_pg_pool_params


def test_database_pool_defaults_are_conservative(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DOCENT_PG_POOL_SIZE", raising=False)
    monkeypatch.delenv("DOCENT_PG_MAX_OVERFLOW", raising=False)

    pool = get_pg_pool_params()

    assert pool.size == 5
    assert pool.max_overflow == 5


def test_database_pool_settings_are_configurable(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DOCENT_PG_POOL_SIZE", "7")
    monkeypatch.setenv("DOCENT_PG_MAX_OVERFLOW", "0")

    pool = get_pg_pool_params()

    assert pool.size == 7
    assert pool.max_overflow == 0


@pytest.mark.parametrize(
    ("name", "value"),
    [
        ("DOCENT_PG_POOL_SIZE", "0"),
        ("DOCENT_PG_POOL_SIZE", "invalid"),
        ("DOCENT_PG_MAX_OVERFLOW", "-1"),
    ],
)
def test_database_pool_rejects_invalid_values(
    name: str,
    value: str,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(name, value)

    with pytest.raises(ValueError, match=name):
        get_pg_pool_params()


def test_database_port_is_validated(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DOCENT_PG_PORT", "invalid")

    with pytest.raises(ValueError, match="DOCENT_PG_PORT must be an integer"):
        get_pg_params()
