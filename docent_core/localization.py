"""Shared locale types and normalization for Docent."""

from typing import Literal

SupportedLocale = Literal["en", "zh-CN"]
DEFAULT_LOCALE: SupportedLocale = "en"


def normalize_locale(locale: object | None) -> SupportedLocale:
    """Normalize supported locale spellings, falling back safely to English."""
    if not isinstance(locale, str):
        return DEFAULT_LOCALE

    normalized = locale.strip().replace("_", "-").lower()
    if normalized == "zh" or normalized.startswith("zh-"):
        return "zh-CN"
    if normalized == "en" or normalized.startswith("en-"):
        return "en"
    return DEFAULT_LOCALE
