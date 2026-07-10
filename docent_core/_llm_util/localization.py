from __future__ import annotations

import re
from collections.abc import Iterator, Mapping, Sequence
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Any, cast

from docent.data_models.chat.content import Content, ContentText
from docent.data_models.chat.message import ChatMessage, SystemMessage
from docent_core.localization import DEFAULT_LOCALE, SupportedLocale, normalize_locale

_RESPONSE_LOCALE: ContextVar[SupportedLocale] = ContextVar(
    "docent_response_locale", default=DEFAULT_LOCALE
)

_LANGUAGE_BLOCK_START = "<docent_response_language>"
_LANGUAGE_BLOCK_END = "</docent_response_language>"
_LANGUAGE_BLOCK_PATTERN = re.compile(
    rf"\s*{re.escape(_LANGUAGE_BLOCK_START)}.*?{re.escape(_LANGUAGE_BLOCK_END)}\s*",
    re.DOTALL,
)

_LANGUAGE_INSTRUCTIONS: dict[SupportedLocale, str] = {
    "en": (
        "Write all user-facing natural-language prose in English. Preserve every "
        "machine-readable token exactly as specified, including XML or HTML tags, JSON keys, "
        "enum values, citation syntax, tool and function names, schema field names, fixed "
        "labels, and required output markers. Do not translate quoted source transcript text "
        "unless the task explicitly asks you to summarize or translate it."
    ),
    "zh-CN": (
        "所有面向用户的自然语言内容都必须使用简体中文（zh-CN）。必须原样保留所有机器可读标记，"
        "包括 XML 或 HTML 标签、JSON 键、枚举值、引用语法、工具名、函数名、Schema 字段名、"
        "固定标签和规定的输出标记。除非任务明确要求总结或翻译，否则不要翻译逐字引用的源对话文本。"
    ),
}


def get_user_preferred_locale(user: object | None) -> SupportedLocale:
    """Read a user's locale without requiring every caller to know the user schema."""
    return normalize_locale(getattr(user, "preferred_locale", None))


def get_job_response_locale(
    job_json: Mapping[str, Any], user: object | None = None
) -> SupportedLocale:
    """Resolve job locale from persisted provenance, then the queued user context."""
    if "locale" in job_json and job_json["locale"] is not None:
        return normalize_locale(job_json["locale"])
    return get_user_preferred_locale(user)


def get_response_locale() -> SupportedLocale:
    return _RESPONSE_LOCALE.get()


@contextmanager
def response_locale_context(locale: object | None) -> Iterator[SupportedLocale]:
    """Set a task-local response locale and restore the previous value afterwards."""
    normalized = normalize_locale(locale)
    token = _RESPONSE_LOCALE.set(normalized)
    try:
        yield normalized
    finally:
        _RESPONSE_LOCALE.reset(token)


def get_response_language_instruction(locale: object | None = None) -> str:
    normalized = normalize_locale(locale) if locale is not None else get_response_locale()
    return (
        f"{_LANGUAGE_BLOCK_START}\n"
        f"{_LANGUAGE_INSTRUCTIONS[normalized]}\n"
        f"{_LANGUAGE_BLOCK_END}"
    )


def _remove_language_block(text: str) -> str:
    return _LANGUAGE_BLOCK_PATTERN.sub("\n\n", text).strip()


def _without_language_block(message: SystemMessage) -> SystemMessage:
    if isinstance(message.content, str):
        return message.model_copy(update={"content": _remove_language_block(message.content)})

    cleaned_content: list[Content] = []
    for content in message.content:
        if isinstance(content, ContentText):
            cleaned_content.append(
                content.model_copy(update={"text": _remove_language_block(content.text)})
            )
        else:
            cleaned_content.append(content.model_copy(deep=True))
    return message.model_copy(update={"content": cleaned_content})


def _append_language_block(message: SystemMessage, instruction: str) -> SystemMessage:
    if isinstance(message.content, str):
        content = message.content.strip()
        merged_content = f"{content}\n\n{instruction}" if content else instruction
        return message.model_copy(update={"content": merged_content})

    return message.model_copy(update={"content": [*message.content, ContentText(text=instruction)]})


def localize_messages(
    messages: Sequence[ChatMessage], locale: object | None = None
) -> list[ChatMessage]:
    """Copy messages and merge exactly one response-language instruction.

    The last system message is used because the Anthropic and Google adapters treat the last
    system message as authoritative. The input sequence and its message objects are never mutated.
    """
    localized = [message.model_copy(deep=True) for message in messages]
    system_indices = [
        index for index, message in enumerate(localized) if isinstance(message, SystemMessage)
    ]

    for index in system_indices:
        localized[index] = _without_language_block(cast(SystemMessage, localized[index]))

    instruction = get_response_language_instruction(locale)
    if system_indices:
        target_index = system_indices[-1]
        localized[target_index] = _append_language_block(
            cast(SystemMessage, localized[target_index]), instruction
        )
    else:
        localized.insert(0, SystemMessage(content=instruction))

    return localized
