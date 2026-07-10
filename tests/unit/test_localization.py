from types import SimpleNamespace
from typing import Any, cast

import pytest
from fastapi import Request
from sqlalchemy import func
from sqlalchemy.dialects import postgresql
from sqlalchemy.sql import Select

from docent.data_models.chat import SystemMessage, UserMessage
from docent_core._llm_util.data_models.llm_output import LLMOutput
from docent_core._llm_util.localization import (
    SupportedLocale,
    get_job_response_locale,
    get_response_locale,
    localize_messages,
    normalize_locale,
    response_locale_context,
)
from docent_core._llm_util.prod_llms import (
    LLMManager,
    MessagesInput,
    get_llm_completions_async,
)
from docent_core._llm_util.providers.preferences import ModelOption
from docent_core.docent.ai_tools.rubric.refine import (
    DIRECT_SEARCH_WELCOME_MESSAGE,
    DIRECT_SEARCH_WELCOME_MESSAGE_ZH_CN,
    GUIDED_SEARCH_WELCOME_MESSAGE,
    GUIDED_SEARCH_WELCOME_MESSAGE_ZH_CN,
    get_refinement_welcome_message,
)
from docent_core.docent.db.chart_sql import generate_chart_query
from docent_core.docent.db.contexts import ViewContext
from docent_core.docent.db.schemas.auth_models import User
from docent_core.docent.server.dependencies.user import (
    get_default_view_ctx,
    get_user_anonymous_ok,
)
from docent_core.docent.services.charts import CountRunDimension, JudgeOutputDimension
from docent_core.docent.services.hodoscope import HodoscopeService
from docent_core.docent.services.rubric import RubricService


@pytest.mark.unit
def test_normalize_locale_supports_chinese_and_falls_back_to_english():
    assert normalize_locale("zh_CN") == "zh-CN"
    assert normalize_locale("zh-Hans") == "zh-CN"
    assert normalize_locale("en-US") == "en"
    assert normalize_locale("fr") == "en"
    assert normalize_locale(None) == "en"


@pytest.mark.unit
def test_localize_messages_copies_input_and_merges_one_instruction():
    original_system = SystemMessage(content="Base system prompt")
    original = [original_system, UserMessage(content="Hello")]

    localized = localize_messages(original, "zh-CN")

    assert original_system.content == "Base system prompt"
    assert localized[0] is not original_system
    assert localized[0].text.startswith("Base system prompt")
    assert localized[0].text.count("<docent_response_language>") == 1
    assert "简体中文" in localized[0].text
    assert "JSON 键" in localized[0].text

    relocalized = localize_messages(localized, "en")
    all_system_text = "\n".join(message.text for message in relocalized if message.role == "system")
    assert all_system_text.count("<docent_response_language>") == 1
    assert "user-facing natural-language prose in English" in all_system_text
    assert "所有面向用户的自然语言内容" not in all_system_text


@pytest.mark.unit
def test_localize_messages_inserts_system_message_when_missing():
    original = [UserMessage(content="Hello")]

    localized = localize_messages(original, "zh-CN")

    assert len(original) == 1
    assert localized[0].role == "system"
    assert localized[0].text.count("<docent_response_language>") == 1
    assert localized[1].role == "user"


@pytest.mark.unit
def test_job_locale_precedes_user_preference_and_context_restores():
    user = SimpleNamespace(preferred_locale="zh-CN")

    assert get_job_response_locale({}, user) == "zh-CN"
    assert get_job_response_locale({"locale": "en"}, user) == "en"
    assert get_response_locale() == "en"

    with response_locale_context("zh-CN"):
        assert get_response_locale() == "zh-CN"

    assert get_response_locale() == "en"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_get_llm_completions_explicit_locale_overrides_context(
    monkeypatch: pytest.MonkeyPatch,
):
    seen_locales: list[SupportedLocale] = []

    async def fake_get_completions(
        self: LLMManager, inputs: list[MessagesInput], **kwargs: object
    ) -> list[LLMOutput]:
        seen_locales.append(cast(SupportedLocale, kwargs["response_locale"]))
        return []

    monkeypatch.setattr(LLMManager, "get_completions", fake_get_completions)

    with response_locale_context("zh-CN"):
        await get_llm_completions_async(
            [[{"role": "user", "content": "Hello"}]],
            [ModelOption(provider="test", model_name="test")],
            response_locale="en",
        )
        await get_llm_completions_async(
            [[{"role": "user", "content": "Hello"}]],
            [ModelOption(provider="test", model_name="test")],
        )

    assert seen_locales == ["en", "zh-CN"]


@pytest.mark.unit
def test_refinement_welcome_messages_follow_response_locale():
    assert get_refinement_welcome_message(is_guided=True, locale="en") == (
        GUIDED_SEARCH_WELCOME_MESSAGE
    )
    assert get_refinement_welcome_message(is_guided=False, locale="en") == (
        DIRECT_SEARCH_WELCOME_MESSAGE
    )
    assert get_refinement_welcome_message(is_guided=True, locale="zh-CN") == (
        GUIDED_SEARCH_WELCOME_MESSAGE_ZH_CN
    )
    assert get_refinement_welcome_message(is_guided=False, locale="zh-CN") == (
        DIRECT_SEARCH_WELCOME_MESSAGE_ZH_CN
    )

    with response_locale_context("zh-CN"):
        assert get_refinement_welcome_message(is_guided=True) == (
            GUIDED_SEARCH_WELCOME_MESSAGE_ZH_CN
        )


@pytest.mark.unit
@pytest.mark.asyncio
async def test_request_view_context_uses_authenticated_user_locale():
    class FakeMonoService:
        async def get_default_view_ctx(self, collection_id: str, user: User) -> ViewContext:
            return ViewContext(
                collection_id=collection_id,
                view_id="view-1",
                user=user,
                base_filter=None,
            )

    user = User(
        id="user-1",
        email="user@example.com",
        organization_ids=[],
        preferred_locale="zh-CN",
    )
    dependency = get_default_view_ctx(
        collection_id="collection-1",
        mono_svc=FakeMonoService(),  # type: ignore[arg-type]
        user=user,
    )

    ctx = await anext(dependency)
    try:
        assert ctx.collection_id == "collection-1"
        assert ctx.user == user
        assert get_response_locale() == "zh-CN"
    finally:
        await dependency.aclose()

    assert get_response_locale() == "en"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_authenticated_request_dependency_sets_and_restores_locale():
    user = User(
        id="user-1",
        email="user@example.com",
        organization_ids=[],
        preferred_locale="zh-CN",
    )
    request = Request({"type": "http", "headers": []})
    request.state.user = user
    dependency = get_user_anonymous_ok(
        request=request,
        mono_svc=cast(Any, None),
    )

    assert await anext(dependency) == user
    try:
        assert get_response_locale() == "zh-CN"
    finally:
        await dependency.aclose()

    assert get_response_locale() == "en"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_rubric_artifact_queries_are_scoped_to_response_locale():
    class EmptyScalarResult:
        def all(self) -> list[Any]:
            return []

    class EmptyResult:
        def scalars(self) -> EmptyScalarResult:
            return EmptyScalarResult()

    class CapturingSession:
        statements: list[Select[Any]]

        def __init__(self) -> None:
            self.statements = []

        async def execute(self, statement: Select[Any]) -> EmptyResult:
            self.statements.append(statement)
            return EmptyResult()

    session = CapturingSession()
    service = RubricService(
        cast(Any, session),
        cast(Any, None),
        cast(Any, None),
    )

    with response_locale_context("zh-CN"):
        assert await service.get_rubric_results("rubric-1", version=1) == []
        assert await service.get_centroids("rubric-1", rubric_version=1) == []

    compiled_queries = [
        str(
            statement.compile(
                dialect=postgresql.dialect(),
                compile_kwargs={"literal_binds": True},
            )
        )
        for statement in session.statements
    ]
    assert any("judge_results.locale = 'zh-CN'" in query for query in compiled_queries)
    assert any("rubric_centroids.locale = 'zh-CN'" in query for query in compiled_queries)


@pytest.mark.unit
def test_chart_judge_subqueries_are_scoped_to_response_locale():
    judge_dimension = JudgeOutputDimension(
        judge_id="rubric-1",
        judge_name="Quality",
        judge_version=1,
        name="Score",
        json_path="score",
    )
    count_measure = CountRunDimension(
        key="COUNT(ar.id)",
        expression=func.count(),
        name="Count runs",
        short_name="Runs",
    )

    query = generate_chart_query(
        dimensions=[judge_dimension],
        measure=count_measure,
        runs_filter=None,
        collection_id="collection-1",
        locale="zh-CN",
    )
    compiled = str(
        query.compile(
            dialect=postgresql.dialect(),
            compile_kwargs={"literal_binds": True},
        )
    )

    assert "judge_results.locale = 'zh-CN'" in compiled


@pytest.mark.unit
@pytest.mark.asyncio
async def test_hodoscope_analysis_list_is_scoped_to_user_locale():
    class EmptyMappingResult:
        def all(self) -> list[Any]:
            return []

    class EmptyResult:
        def mappings(self) -> EmptyMappingResult:
            return EmptyMappingResult()

    class CapturingSession:
        statement: Select[Any] | None = None

        async def execute(self, statement: Select[Any]) -> EmptyResult:
            self.statement = statement
            return EmptyResult()

    session = CapturingSession()
    service = HodoscopeService(cast(Any, session))
    user = User(
        id="user-1",
        email="user@example.com",
        organization_ids=[],
        preferred_locale="zh-CN",
    )
    ctx = ViewContext(
        collection_id="collection-1",
        view_id="view-1",
        user=user,
        base_filter=None,
    )

    assert await service.list_analyses(ctx) == []
    assert session.statement is not None
    compiled = str(
        session.statement.compile(
            dialect=postgresql.dialect(),
            compile_kwargs={"literal_binds": True},
        )
    )
    assert "hodoscope_analyses.config_json" in compiled
    assert "'zh-CN'" in compiled
