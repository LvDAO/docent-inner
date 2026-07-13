import os
from pathlib import Path

import pytest

from docent_core._env_util.env import load_dotenv


def test_load_dotenv_allows_missing_file_for_os_environ(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("ENV_RESOLUTION_STRATEGY", "os_environ")
    monkeypatch.setattr(Path, "exists", lambda _path: False)

    assert load_dotenv() is os.environ


def test_load_dotenv_requires_file_for_default_strategy(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("ENV_RESOLUTION_STRATEGY", raising=False)
    monkeypatch.setattr(Path, "exists", lambda _path: False)

    with pytest.raises(FileNotFoundError, match="No \\.env file found"):
        load_dotenv()


def test_load_dotenv_conflict_error_redacts_values(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    env_path = tmp_path / ".env"
    env_path.write_text("DOCENT_TEST_SECRET=dotenv-secret\n", encoding="utf-8")
    monkeypatch.delenv("ENV_RESOLUTION_STRATEGY", raising=False)
    monkeypatch.setenv("DOCENT_TEST_SECRET", "process-secret")

    with pytest.raises(ValueError) as exc_info:
        load_dotenv(env_path)

    message = str(exc_info.value)
    assert "DOCENT_TEST_SECRET" in message
    assert "dotenv-secret" not in message
    assert "process-secret" not in message
