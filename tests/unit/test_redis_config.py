import pytest

from docent_core._redis_config import get_redis_settings


def test_redis_settings_treat_blank_credentials_as_unset() -> None:
    settings = get_redis_settings(
        {
            "DOCENT_REDIS_HOST": "redis",
            "DOCENT_REDIS_PORT": "6379",
            "DOCENT_REDIS_USER": "",
            "DOCENT_REDIS_PASSWORD": "",
            "DOCENT_REDIS_TLS": "false",
        }
    )

    assert settings.host == "redis"
    assert settings.port == 6379
    assert settings.username is None
    assert settings.password is None
    assert settings.ssl is False


def test_redis_settings_support_password_only_authentication() -> None:
    settings = get_redis_settings(
        {
            "DOCENT_REDIS_HOST": "redis.example.test",
            "DOCENT_REDIS_PORT": "6380",
            "DOCENT_REDIS_PASSWORD": "secret",
            "DOCENT_REDIS_TLS": "true",
        }
    )

    assert settings.username is None
    assert settings.password == "secret"
    assert settings.ssl is True


@pytest.mark.parametrize(
    ("name", "value", "message"),
    [
        ("DOCENT_REDIS_PORT", "invalid", "must be an integer"),
        ("DOCENT_REDIS_PORT", "70000", "must be between 1 and 65535"),
        ("DOCENT_REDIS_TLS", "sometimes", "must be true or false"),
    ],
)
def test_redis_settings_reject_invalid_values(name: str, value: str, message: str) -> None:
    env = {
        "DOCENT_REDIS_HOST": "redis",
        "DOCENT_REDIS_PORT": "6379",
        "DOCENT_REDIS_TLS": "false",
        name: value,
    }

    with pytest.raises(ValueError, match=message):
        get_redis_settings(env)
