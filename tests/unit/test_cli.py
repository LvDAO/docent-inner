from typer.testing import CliRunner

from docent_core.cli import _get_web_environment, app


def test_web_environment_defaults_to_same_origin(monkeypatch):
    monkeypatch.setenv("NEXT_PUBLIC_INTERNAL_API_HOST", "http://legacy-backend:8888")

    env = _get_web_environment("http://localhost:8889", None, same_origin=True)

    assert env["NEXT_PUBLIC_API_HOST"] == ""
    assert env["DOCENT_INTERNAL_API_HOST"] == "http://localhost:8889"
    assert "NEXT_PUBLIC_INTERNAL_API_HOST" not in env


def test_web_environment_preserves_explicit_cross_origin():
    env = _get_web_environment(
        "https://api.example.com",
        "http://backend:8888",
        same_origin=False,
    )

    assert env["NEXT_PUBLIC_API_HOST"] == "https://api.example.com"
    assert env["DOCENT_INTERNAL_API_HOST"] == "http://backend:8888"


def test_worker_count_must_be_positive():
    result = CliRunner().invoke(app, ["worker", "--workers", "0"])

    assert result.exit_code == 2
    assert "Invalid value" in result.output
