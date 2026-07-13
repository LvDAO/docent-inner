from collections.abc import Mapping

from arq.connections import RedisSettings

from docent_core._env_util import ENV


def _optional_value(env: Mapping[str, str], name: str) -> str | None:
    value = env.get(name)
    if value is None:
        return None
    value = value.strip()
    return value or None


def get_redis_settings(env: Mapping[str, str] = ENV) -> RedisSettings:
    """Build one validated Redis configuration for both API and worker clients."""
    host = _optional_value(env, "DOCENT_REDIS_HOST")
    raw_port = _optional_value(env, "DOCENT_REDIS_PORT")
    if host is None or raw_port is None:
        raise ValueError("DOCENT_REDIS_HOST and DOCENT_REDIS_PORT must be set")

    try:
        port = int(raw_port)
    except ValueError as exc:
        raise ValueError("DOCENT_REDIS_PORT must be an integer") from exc
    if not 1 <= port <= 65535:
        raise ValueError("DOCENT_REDIS_PORT must be between 1 and 65535")

    raw_tls = (_optional_value(env, "DOCENT_REDIS_TLS") or "false").lower()
    if raw_tls in {"1", "true", "yes", "on"}:
        use_tls = True
    elif raw_tls in {"0", "false", "no", "off"}:
        use_tls = False
    else:
        raise ValueError("DOCENT_REDIS_TLS must be true or false")

    return RedisSettings(
        host=host,
        port=port,
        username=_optional_value(env, "DOCENT_REDIS_USER"),
        password=_optional_value(env, "DOCENT_REDIS_PASSWORD"),
        ssl=use_tls,
    )
