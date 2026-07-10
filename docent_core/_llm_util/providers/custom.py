# pyright: reportPrivateUsage=false

from typing import Any, Literal, cast

import backoff
from backoff.types import Details
from openai import AsyncOpenAI, BadRequestError, RateLimitError, omit

from docent._log_util import get_logger
from docent.data_models.chat import ChatMessage, ToolInfo
from docent_core._env_util import ENV
from docent_core._llm_util.data_models.exceptions import (
    CompletionTooLongException,
    NoResponseException,
)
from docent_core._llm_util.data_models.llm_output import (
    AsyncSingleLLMOutputStreamingCallback,
    LLMOutput,
    finalize_llm_output_partial,
)
from docent_core._llm_util.providers.common import async_timeout_ctx
from docent_core._llm_util.providers.openai import (
    _convert_openai_error,
    _is_retryable_error,
    _parse_chat_messages,
    _parse_tools,
    parse_openai_completion,
    update_llm_output,
)

logger = get_logger(__name__)


def _print_backoff_message(e: Details):
    logger.warning(
        f"Custom LLM provider backing off for {e['wait']:.2f}s due to {e['exception'].__class__.__name__}"  # type: ignore
    )


def _get_custom_base_url() -> str:
    base_url = ENV.get("DOCENT_LLM_BASE_URL")
    if not base_url:
        raise ValueError("DOCENT_LLM_BASE_URL is required when DOCENT_LLM_PROVIDER=custom")
    return base_url


@backoff.on_exception(
    backoff.expo,
    exception=(Exception,),
    giveup=lambda e: not _is_retryable_error(e),
    max_tries=5,
    factor=3.0,
    on_backoff=_print_backoff_message,
)
async def get_custom_chat_completion_streaming_async(
    client: AsyncOpenAI,
    streaming_callback: AsyncSingleLLMOutputStreamingCallback | None,
    messages: list[ChatMessage],
    model_name: str,
    tools: list[ToolInfo] | None = None,
    tool_choice: Literal["auto", "required"] | None = None,
    max_new_tokens: int = 32,
    temperature: float = 1.0,
    reasoning_effort: Literal["low", "medium", "high"] | None = None,
    logprobs: bool = False,
    top_logprobs: int | None = None,
    timeout: float = 30.0,
):
    _ = reasoning_effort
    input_messages = _parse_chat_messages(messages)
    input_tools = _parse_tools(tools) if tools else omit

    try:
        async with async_timeout_ctx(timeout):
            stream = cast(
                Any,
                await client.chat.completions.create(  # pyright: ignore[reportCallIssue]
                    model=model_name,
                    messages=input_messages,
                    tools=input_tools,
                    tool_choice=tool_choice or omit,
                    max_tokens=max_new_tokens,
                    temperature=temperature,
                    logprobs=logprobs,
                    top_logprobs=top_logprobs,
                    stream_options={"include_usage": True},
                    stream=True,
                ),
            )

            llm_output_partial = None
            async for chunk in stream:
                llm_output_partial = update_llm_output(llm_output_partial, chunk)
                if streaming_callback:
                    await streaming_callback(finalize_llm_output_partial(llm_output_partial))

            if llm_output_partial:
                return finalize_llm_output_partial(llm_output_partial)
            return LLMOutput(model=model_name, completions=[], errors=[NoResponseException()])
    except (RateLimitError, BadRequestError) as e:
        if e2 := _convert_openai_error(e):
            raise e2 from e
        raise


@backoff.on_exception(
    backoff.expo,
    exception=(Exception,),
    giveup=lambda e: not _is_retryable_error(e),
    max_tries=5,
    factor=3.0,
    on_backoff=_print_backoff_message,
)
async def get_custom_chat_completion_async(
    client: AsyncOpenAI,
    messages: list[ChatMessage],
    model_name: str,
    tools: list[ToolInfo] | None = None,
    tool_choice: Literal["auto", "none", "required"] | None = None,
    max_new_tokens: int = 32,
    temperature: float = 1.0,
    reasoning_effort: Literal["low", "medium", "high"] | None = None,
    logprobs: bool = False,
    top_logprobs: int | None = None,
    timeout: float = 5.0,
) -> LLMOutput:
    _ = reasoning_effort
    input_messages = _parse_chat_messages(messages)
    input_tools = _parse_tools(tools) if tools else omit

    try:
        async with async_timeout_ctx(timeout):  # type: ignore
            raw_output = await client.chat.completions.create(  # pyright: ignore[reportCallIssue]
                model=model_name,
                messages=input_messages,
                tools=input_tools,
                tool_choice=tool_choice or omit,
                max_tokens=max_new_tokens,
                temperature=temperature,
                logprobs=logprobs,
                top_logprobs=top_logprobs,
            )

            output = parse_openai_completion(raw_output, model_name)
            if output.first and output.first.finish_reason == "length" and output.first.no_text:
                raise CompletionTooLongException(
                    "Completion empty due to truncation. Consider increasing max_new_tokens."
                )
            for c in output.completions:
                if c.finish_reason == "length":
                    logger.warning(
                        "Completion truncated due to length; consider increasing max_new_tokens."
                    )

            return output
    except (RateLimitError, BadRequestError) as e:
        if e2 := _convert_openai_error(e):
            raise e2 from e
        raise


def get_custom_client_async(api_key: str | None = None) -> AsyncOpenAI:
    _ = ENV
    key = api_key or ENV.get("DOCENT_LLM_API_KEY") or "missing-custom-llm-api-key"
    return AsyncOpenAI(api_key=key, base_url=_get_custom_base_url())
