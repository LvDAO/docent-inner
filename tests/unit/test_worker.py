import pytest

from docent_core._worker import worker
from docent_core._worker.constants import JOB_TIMEOUT_SECONDS


@pytest.mark.unit
@pytest.mark.parametrize("command", ["cancel", b"cancel"])
def test_worker_decodes_cancel_command(command: str | bytes) -> None:
    assert worker._decode_redis_command(command) == "cancel"


@pytest.mark.unit
def test_worker_job_timeout_defaults_to_thirty_minutes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delitem(worker.ENV, "DOCENT_WORKER_JOB_TIMEOUT_SECONDS", raising=False)

    assert JOB_TIMEOUT_SECONDS == 30 * 60
    assert worker.get_worker_job_timeout_seconds() == 30 * 60


@pytest.mark.unit
def test_worker_job_timeout_accepts_positive_environment_override(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setitem(worker.ENV, "DOCENT_WORKER_JOB_TIMEOUT_SECONDS", "2400")

    assert worker.get_worker_job_timeout_seconds() == 2400


@pytest.mark.unit
@pytest.mark.parametrize("value", ["0", "-1", "not-an-integer"])
def test_worker_job_timeout_rejects_invalid_environment_values(
    monkeypatch: pytest.MonkeyPatch,
    value: str,
) -> None:
    monkeypatch.setitem(worker.ENV, "DOCENT_WORKER_JOB_TIMEOUT_SECONDS", value)

    with pytest.raises(ValueError, match="DOCENT_WORKER_JOB_TIMEOUT_SECONDS"):
        worker.get_worker_job_timeout_seconds()
