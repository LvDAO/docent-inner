import asyncio
from copy import deepcopy
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from sqlalchemy.dialects import postgresql

from docent.data_models import AgentRun, Transcript
from docent.data_models.chat import AssistantMessage, ToolMessage, UserMessage
from docent_core._llm_util.data_models.llm_output import LLMCompletion, LLMOutput
from docent_core._llm_util.providers import openai as openai_provider
from docent_core.docent.db.schemas.tables import JobStatus
from docent_core.docent.services import hodoscope_pipeline
from docent_core.docent.services.hodoscope import (
    HODOSCOPE_CONTEXT_EXCERPT_MAX_CHARS,
    HodoscopeAnalysisConfig,
    HodoscopeService,
    build_hodoscope_metadata_tag_overlay,
    build_hodoscope_projection_view,
    build_hodoscope_rubric_tag_overlay,
    build_hodoscope_trajectory_paths,
    expand_hodoscope_projection_view,
    merge_hodoscope_tag_overlay,
)
from docent_core.docent.services.hodoscope_pipeline import (
    build_hodoscope_outputs,
    embed_hodoscope_summaries,
    extract_hodoscope_actions,
    sample_hodoscope_actions,
    summarize_hodoscope_actions,
)
from docent_core.docent.workers import hodoscope_worker

EMBEDDING_ENV_VARS = [
    "DOCENT_EMBEDDING_BASE_URL",
    "DOCENT_EMBEDDING_API_KEY",
    "DOCENT_EMBEDDING_MODEL",
    "DOCENT_EMBEDDING_DIMENSIONS",
    "DOCENT_EMBEDDING_DIM",
    "DOCENT_HODOSCOPE_EMBEDDING_MODEL",
    "DOCENT_HODOSCOPE_EMBEDDING_DIMENSIONS",
    "DOCENT_HODOSCOPE_EMBEDDING_DIM",
    "DOCENT_HODOSCOPE_EMBEDDING_BASE_URL",
    "DOCENT_HODOSCOPE_EMBEDDING_API_KEY",
    "DOCENT_LLM_PROVIDER",
    "DOCENT_LLM_BASE_URL",
    "DOCENT_LLM_API_KEY",
    "OPENAI_BASE_URL",
    "OPENAI_API_KEY",
    "OPENAI_ADMIN_KEY",
]


def _transcript(
    transcript_id: str, messages: list, created_at: datetime | None = None
) -> Transcript:
    return Transcript(id=transcript_id, messages=messages, created_at=created_at)


def _clear_embedding_env(monkeypatch: pytest.MonkeyPatch):
    for env_var in EMBEDDING_ENV_VARS:
        monkeypatch.delenv(env_var, raising=False)


def _full_projection_fixture() -> dict:
    return {
        "version": 1,
        "created_at": "2026-07-09T09:09:25+00:00",
        "group_by": "metadata.model",
        "projection_method": "tsne",
        "requested_projection_method": "tsne",
        "groups": [
            {"name": "model-a", "count": 1},
            {"name": "model-b", "count": 1},
        ],
        "internal_debug": "not public",
        "points": [
            {
                "id": "run-a:t-a:0:0",
                "trajectory_id": "run-a",
                "turn_id": 3,
                "agent_run_id": "run-a",
                "transcript_id": "t-a",
                "transcript_idx": 0,
                "action_unit_idx": 0,
                "first_block_idx": 1,
                "summary": "Inspect logs for a failure",
                "action_text": "raw action text that must stay private",
                "task_context": "  " + "context " * 80 + "  ",
                "metadata": {
                    "success": True,
                    "task_name": "terminal-bench/task-a",
                    "large_private_value": "private" * 100,
                },
                "group": "model-a",
                "embedding": "encoded-full-embedding",
                "x": -1.25,
                "y": 4.5,
                "fps_rank": 0,
            },
            {
                "id": "run-b:t-b:1:2",
                "trajectory_id": "run-b",
                "turn_id": 9,
                "agent_run_id": "run-b",
                "transcript_id": "t-b",
                "transcript_idx": 1,
                "action_unit_idx": 2,
                "first_block_idx": None,
                "summary": "Waited too long for a command",
                "action_text": "fallback\ncontext from the raw action",
                "task_context": "",
                "metadata": {
                    "exception_type": "AgentTimeoutError",
                    "terminal_outcome": "reward_with_agent_timeout",
                    "task_id": {"org": "terminal-bench", "name": "task-b"},
                },
                "group": "model-b",
                "embedding": "another-full-embedding",
                "x": 8.75,
                "y": -2.0,
                "fps_rank": 1,
            },
        ],
    }


@pytest.mark.unit
def test_public_hodoscope_projection_is_compact_bounded_and_non_mutating():
    stored_projection = _full_projection_fixture()
    stored_projection["tag_catalog"] = [
        {
            "id": "stored-tag",
            "label": "Stored point tag",
            "source": "point_rubric",
            "scope": "point",
            "inherited": False,
        }
    ]
    stored_projection["points"][0]["tag_ids"] = ["stored-tag"]
    original_projection = deepcopy(stored_projection)

    public_projection = build_hodoscope_projection_view(stored_projection)

    assert stored_projection == original_projection
    assert public_projection["view_schema_version"] == "hodoscope_projection_view.v2"
    assert "internal_debug" not in public_projection
    assert public_projection["groups"] == stored_projection["groups"]
    assert sum(group["count"] for group in public_projection["groups"]) == len(
        public_projection["points"]
    )

    first_point, second_point = public_projection["points"]
    assert first_point["id"] == "run-a:t-a:0:0"
    assert first_point["trajectory_id"] == "run-a"
    assert first_point["turn_id"] == 3
    assert first_point["agent_run_id"] == "run-a"
    assert first_point["transcript_id"] == "t-a"
    assert first_point["transcript_idx"] == 0
    assert first_point["action_unit_idx"] == 0
    assert first_point["first_block_idx"] == 1
    assert first_point["summary"] == "Inspect logs for a failure"
    assert first_point["x"] == -1.25
    assert first_point["y"] == 4.5
    assert first_point["fps_rank"] == 0
    assert first_point["group"] == "model-a"
    assert first_point["tag_ids"] == ["stored-tag"]
    assert second_point["tag_ids"] == []
    assert public_projection["tag_catalog"][0]["count"] == 1
    assert first_point["outcome"] == "passed"
    assert first_point["task_id"] == "terminal-bench/task-a"
    assert len(first_point["context_excerpt"]) == HODOSCOPE_CONTEXT_EXCERPT_MAX_CHARS
    assert first_point["context_excerpt"].endswith("…")

    assert second_point["outcome"] == "timeout"
    assert second_point["exception_type"] == "AgentTimeoutError"
    assert second_point["task_id"] == "terminal-bench/task-b"
    assert second_point["context_excerpt"] == "fallback context from the raw action"

    public_point_fields = set(first_point) | set(second_point)
    assert public_point_fields.isdisjoint({"embedding", "action_text", "task_context", "metadata"})
    assert public_projection["trajectory_paths"] == [
        {
            "trajectory_id": "run-a",
            "agent_run_id": "run-a",
            "point_ids": ["run-a:t-a:0:0"],
            "projected_point_count": 1,
            "total_action_count": None,
            "complete": None,
            "path_scope": "projected_points",
        },
        {
            "trajectory_id": "run-b",
            "agent_run_id": "run-b",
            "point_ids": ["run-b:t-b:1:2"],
            "projected_point_count": 1,
            "total_action_count": None,
            "complete": None,
            "path_scope": "projected_points",
        },
    ]
    assert build_hodoscope_projection_view(public_projection) == public_projection


@pytest.mark.unit
@pytest.mark.asyncio
async def test_hodoscope_service_keeps_legacy_full_projection_and_artifact_available():
    stored_projection = _full_projection_fixture()
    full_artifact = {
        "summaries": [
            {
                "embedding": "full-artifact-embedding",
                "action_text": "full artifact action text",
                "metadata": {"private": "still stored"},
            }
        ]
    }
    session = SimpleNamespace(
        execute=AsyncMock(
            side_effect=[
                SimpleNamespace(one_or_none=lambda: (stored_projection, full_artifact, {})),
                SimpleNamespace(one_or_none=lambda: (stored_projection, {})),
                SimpleNamespace(scalar_one_or_none=lambda: full_artifact),
            ]
        )
    )
    service = HodoscopeService(session=session)  # type: ignore[arg-type]
    ctx = SimpleNamespace(collection_id="collection-id")

    stored_projection_response = await service.get_projection(ctx, "analysis-id")  # type: ignore[arg-type]
    public_projection = await service.get_projection(  # type: ignore[arg-type]
        ctx, "analysis-id", compact=True
    )
    returned_artifact = await service.get_artifact(ctx, "analysis-id")  # type: ignore[arg-type]

    assert public_projection is not None
    assert stored_projection_response is stored_projection
    assert stored_projection_response["points"][0]["embedding"] == "encoded-full-embedding"
    assert "embedding" not in public_projection["points"][0]
    assert stored_projection["points"][0]["embedding"] == "encoded-full-embedding"
    assert stored_projection["points"][0]["action_text"] == "raw action text that must stay private"
    assert returned_artifact is full_artifact
    assert returned_artifact["summaries"][0]["embedding"] == "full-artifact-embedding"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_hodoscope_analysis_list_explicit_locale_overrides_user_preference():
    session = SimpleNamespace(
        execute=AsyncMock(
            return_value=SimpleNamespace(
                mappings=lambda: SimpleNamespace(all=lambda: []),
            )
        )
    )
    service = HodoscopeService(session=session)  # type: ignore[arg-type]
    ctx = SimpleNamespace(
        collection_id="collection-id",
        user=SimpleNamespace(preferred_locale="en"),
    )

    assert await service.list_analyses(ctx, locale="zh-CN") == []  # type: ignore[arg-type]

    statement = session.execute.await_args.args[0]
    assert any(
        getattr(criterion.right, "value", None) == "zh-CN"
        for criterion in statement._where_criteria
    )


@pytest.mark.unit
@pytest.mark.asyncio
async def test_active_hodoscope_analysis_requires_active_job():
    session = SimpleNamespace(
        execute=AsyncMock(return_value=SimpleNamespace(scalar_one_or_none=lambda: None))
    )
    service = HodoscopeService(session=session)  # type: ignore[arg-type]
    ctx = SimpleNamespace(collection_id="collection-id")

    assert await service.get_active_analysis(ctx, "zh-CN") is None  # type: ignore[arg-type]

    statement = session.execute.await_args.args[0]
    compiled = str(
        statement.compile(
            dialect=postgresql.dialect(),
            compile_kwargs={"literal_binds": True},
        )
    )
    assert "jobs.status IN ('PENDING', 'RUNNING')" in compiled


@pytest.mark.unit
@pytest.mark.asyncio
async def test_hodoscope_service_adds_metadata_and_latest_rubric_tags_at_read_time():
    stored_projection = _full_projection_fixture()
    rubric_row = {
        "agent_run_id": "run-a",
        "rubric_id": "rubric-1",
        "rubric_version": 4,
        "rubric_text": "Investigates recovery behavior",
        "centroid_id": "centroid-1",
        "centroid": "Retries after failure",
        "output": {"label": "match"},
    }
    session = SimpleNamespace(
        execute=AsyncMock(
            side_effect=[
                SimpleNamespace(one_or_none=lambda: (stored_projection, {"locale": "zh-CN"})),
                SimpleNamespace(all=lambda: [("run-a", {"custom_tag": "needs-review"})]),
                SimpleNamespace(mappings=lambda: SimpleNamespace(all=lambda: [rubric_row])),
            ]
        )
    )
    service = HodoscopeService(session=session)  # type: ignore[arg-type]
    ctx = SimpleNamespace(collection_id="collection-id")

    projection = await service.get_projection(  # type: ignore[arg-type]
        ctx,
        "analysis-id",
        compact=True,
        tag_by="metadata.custom_tag",
        include_rubric_tags=True,
    )

    assert projection is not None
    assert session.execute.await_count == 3
    assert len(projection["points"][0]["tag_ids"]) == 2
    assert projection["points"][1]["tag_ids"] == []
    assert {tag["source"] for tag in projection["tag_catalog"]} == {
        "metadata",
        "rubric_cluster",
    }
    assert {tag["count"] for tag in projection["tag_catalog"]} == {1}

    rubric_statement = session.execute.await_args_list[2].args[0]
    locale_predicates = {
        criterion.left.table.name: criterion.right.value
        for criterion in rubric_statement._where_criteria
        if getattr(criterion.left, "name", None) == "locale"
    }
    assert locale_predicates == {
        "judge_results": "zh-CN",
        "rubric_centroids": "zh-CN",
    }


@pytest.mark.unit
@pytest.mark.asyncio
async def test_hodoscope_rubric_tags_default_legacy_analysis_locale_to_english():
    stored_projection = _full_projection_fixture()
    session = SimpleNamespace(
        execute=AsyncMock(
            side_effect=[
                SimpleNamespace(one_or_none=lambda: (stored_projection, {})),
                SimpleNamespace(mappings=lambda: SimpleNamespace(all=lambda: [])),
            ]
        )
    )
    service = HodoscopeService(session=session)  # type: ignore[arg-type]
    ctx = SimpleNamespace(collection_id="collection-id")

    projection = await service.get_projection(  # type: ignore[arg-type]
        ctx,
        "analysis-id",
        compact=True,
        include_rubric_tags=True,
    )

    assert projection is not None
    rubric_statement = session.execute.await_args_list[1].args[0]
    locale_predicates = {
        criterion.left.table.name: criterion.right.value
        for criterion in rubric_statement._where_criteria
        if getattr(criterion.left, "name", None) == "locale"
    }
    assert locale_predicates == {
        "judge_results": "en",
        "rubric_centroids": "en",
    }


@pytest.mark.unit
def test_compact_stored_projection_expands_to_legacy_full_shape():
    full_projection = _full_projection_fixture()
    compact_projection = build_hodoscope_projection_view(full_projection)
    artifact = {
        "summaries": [
            {
                key: deepcopy(point[key])
                for key in ("action_text", "task_context", "metadata", "embedding")
            }
            for point in full_projection["points"]
        ]
    }

    expanded = expand_hodoscope_projection_view(compact_projection, artifact)

    assert "view_schema_version" not in expanded
    for expanded_point, full_point in zip(
        expanded["points"], full_projection["points"], strict=True
    ):
        for key in ("action_text", "task_context", "metadata", "embedding"):
            assert expanded_point[key] == full_point[key]


@pytest.mark.unit
def test_public_hodoscope_projection_reads_docent_scores_metadata():
    stored_projection = _full_projection_fixture()
    stored_projection["points"][0]["metadata"] = {"scores": {"passed": True, "reward": 1.0}}

    public_projection = build_hodoscope_projection_view(stored_projection)

    assert public_projection["points"][0]["outcome"] == "passed"


@pytest.mark.unit
def test_hodoscope_legacy_trajectory_path_uses_transcript_and_action_order():
    points = [
        {
            "id": "run:t-2:1:0",
            "agent_run_id": "run",
            "trajectory_id": "run",
            "transcript_idx": 1,
            "action_unit_idx": 0,
        },
        {
            "id": "run:t-1:0:2",
            "agent_run_id": "run",
            "trajectory_id": "run",
            "transcript_idx": 0,
            "action_unit_idx": 2,
        },
        {
            "id": "run:t-1:0:1",
            "agent_run_id": "run",
            "trajectory_id": "run",
            "transcript_idx": 0,
            "action_unit_idx": 1,
        },
    ]

    paths = build_hodoscope_trajectory_paths(points)

    assert paths == [
        {
            "trajectory_id": "run",
            "agent_run_id": "run",
            "point_ids": ["run:t-1:0:1", "run:t-1:0:2", "run:t-2:1:0"],
            "projected_point_count": 3,
            "total_action_count": None,
            "complete": None,
            "path_scope": "projected_points",
        }
    ]


@pytest.mark.unit
def test_metadata_tags_are_bounded_deterministic_and_merge_with_stored_tags():
    metadata_by_run = {
        "run-b": {"custom": {"tags": ["beta", "alpha", "alpha"]}},
        "run-a": {"metadata.custom.tags": ["alpha", {"kind": "failure", "detail": "x" * 300}]},
    }
    catalog, tag_ids_by_run = build_hodoscope_metadata_tag_overlay(
        metadata_by_run, "metadata.custom.tags"
    )
    projection = {
        "tag_catalog": [
            {
                "id": "stored",
                "label": "Stored",
                "source": "point_rubric",
                "scope": "point",
                "inherited": False,
            }
        ],
        "points": [
            {"id": "a", "agent_run_id": "run-a", "tag_ids": ["stored"]},
            {"id": "b", "agent_run_id": "run-b", "tag_ids": []},
        ],
    }

    merged = merge_hodoscope_tag_overlay(projection, catalog, tag_ids_by_run)
    repeated = merge_hodoscope_tag_overlay(merged, catalog, tag_ids_by_run)

    assert merged == repeated
    assert projection["points"][0]["tag_ids"] == ["stored"]
    assert all(definition["scope"] == "trajectory" for definition in catalog)
    assert all(definition["inherited"] is True for definition in catalog)
    assert all(definition["source_label"] == "metadata.custom.tags" for definition in catalog)
    assert len(tag_ids_by_run["run-a"]) == 2
    assert len(tag_ids_by_run["run-b"]) == 2
    counts = {definition["id"]: definition["count"] for definition in merged["tag_catalog"]}
    assert counts["stored"] == 1
    assert sorted(counts[tag_id] for tag_id in set(tag_ids_by_run["run-a"])) == [1, 2]


@pytest.mark.unit
def test_rubric_cluster_rows_become_neutral_trajectory_tags():
    rows = [
        {
            "agent_run_id": "run-a",
            "rubric_id": "rubric-1",
            "rubric_version": 2,
            "rubric_text": "Checks recovery behavior\nMore detail",
            "centroid_id": "centroid-1",
            "centroid": "Retries after a failed command",
            "output": {"label": True, "explanation": "..."},
        },
        {
            "agent_run_id": "run-b",
            "rubric_id": "rubric-1",
            "rubric_version": 2,
            "rubric_text": "Checks recovery behavior\nMore detail",
            "centroid_id": "centroid-1",
            "centroid": "Retries after a failed command",
            "output": {"label": True, "explanation": "..."},
        },
    ]

    catalog, tag_ids_by_run = build_hodoscope_rubric_tag_overlay(rows)

    assert len(catalog) == 1
    assert tag_ids_by_run["run-a"] == tag_ids_by_run["run-b"]
    assert catalog[0]["source"] == "rubric_cluster"
    assert catalog[0]["scope"] == "trajectory"
    assert catalog[0]["inherited"] is True
    assert catalog[0]["rubric_id"] == "rubric-1"
    assert catalog[0]["rubric_version"] == 2
    assert catalog[0]["centroid_id"] == "centroid-1"
    assert catalog[0]["result_label"] == "true"
    assert catalog[0]["source_label"] == "Checks recovery behavior · true"
    assert "positive" not in catalog[0]


@pytest.mark.unit
def test_hodoscope_config_keeps_legacy_run_limit_range():
    config = HodoscopeAnalysisConfig(limit=10_000)

    assert config.limit == 10_000
    assert config.max_actions == 5_000


@pytest.mark.unit
def test_canceled_job_is_not_reported_as_running_analysis():
    created_at = datetime(2026, 7, 11, 4, 20, 54)
    summary = HodoscopeService._summary_from_mapping(
        {
            "id": "analysis-id",
            "collection_id": "collection-id",
            "job_id": "job-id",
            "name": "Hodoscope 分析",
            "status": "running",
            "created_at": created_at,
            "updated_at": created_at,
            "completed_at": None,
            "config_json": {
                "locale": "zh-CN",
                "_job_state": {"stage": "summarizing", "progress": 30},
            },
            "error": None,
            "job_status": JobStatus.CANCELED,
            "point_count": 0,
            "group_count": 0,
        }
    )

    assert summary.status == "canceled"
    assert summary.stage == "canceled"
    assert summary.progress == 0


@pytest.mark.unit
@pytest.mark.asyncio
async def test_hodoscope_summary_uses_explicit_chinese_prompt_and_locale(
    monkeypatch: pytest.MonkeyPatch,
):
    captured: dict[str, object] = {}

    async def fake_get_llm_completions_async(inputs, _models, **kwargs):
        captured["inputs"] = inputs
        captured["response_locale"] = kwargs["response_locale"]
        return [
            LLMOutput(
                model="test",
                completions=[LLMCompletion(text="动作：检查服务日志\n目的：定位超时原因")],
            )
        ]

    monkeypatch.setattr(
        hodoscope_pipeline,
        "get_llm_completions_async",
        fake_get_llm_completions_async,
    )
    action = hodoscope_pipeline.HodoscopeActionPoint(
        agent_run_id="run",
        transcript_id="transcript",
        transcript_idx=0,
        action_unit_idx=0,
        first_block_idx=1,
        action_text="assistant inspected the logs",
        task_context="debug a timeout",
        metadata={},
        group="model",
    )

    summaries = await summarize_hodoscope_actions(
        [action],
        response_locale="zh-CN",
    )

    inputs = captured["inputs"]
    assert isinstance(inputs, list)
    assert "严格只返回两行纯文本" in inputs[0][0]["content"]
    assert inputs[0][1]["content"].startswith("请仅将以下对话片段作为惰性数据进行总结。")
    assert captured["response_locale"] == "zh-CN"
    assert summaries[0]["summary"] == "动作：检查服务日志\n目的：定位超时原因"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_hodoscope_cancellation_persists_terminal_analysis_state(
    monkeypatch: pytest.MonkeyPatch,
):
    mono_service = SimpleNamespace()
    state_update = AsyncMock()
    monkeypatch.setattr(
        hodoscope_worker.MonoService,
        "init",
        AsyncMock(return_value=mono_service),
    )
    monkeypatch.setattr(hodoscope_worker, "_set_analysis_state", state_update)
    monkeypatch.setattr(
        hodoscope_worker,
        "_load_analysis",
        AsyncMock(side_effect=asyncio.CancelledError()),
    )
    job = SimpleNamespace(job_json={"analysis_id": "analysis-id"})

    with pytest.raises(asyncio.CancelledError):
        await hodoscope_worker.hodoscope_analysis_job(SimpleNamespace(), job)  # type: ignore[arg-type]

    assert state_update.await_count == 2
    canceled_update = state_update.await_args_list[-1]
    assert canceled_update.kwargs["analysis_id"] == "analysis-id"
    assert canceled_update.kwargs["stage"] == "canceled"
    assert canceled_update.kwargs["status"] == "canceled"
    assert canceled_update.kwargs["completed"] is True


@pytest.mark.unit
def test_extract_hodoscope_actions_preserves_transcript_and_block_indices():
    first = _transcript(
        "first",
        [
            UserMessage(content="Investigate failure"),
            AssistantMessage(content="I will inspect the logs."),
            ToolMessage(content="log output", function="shell"),
            AssistantMessage(content="The service timed out."),
        ],
        datetime(2024, 1, 1),
    )
    second = _transcript(
        "second",
        [
            UserMessage(content="Patch it"),
            AssistantMessage(content="I will update the retry policy."),
        ],
        datetime(2024, 1, 2),
    )
    agent_run = AgentRun(
        id="run-1",
        transcripts=[second, first],
        metadata={"metadata": {"model": "deepseek-chat"}},
    )

    actions, group_by = extract_hodoscope_actions([agent_run], group_by=None)

    assert group_by == "metadata.model"
    assert [action.transcript_id for action in actions] == ["first", "first", "second"]
    assert [action.transcript_idx for action in actions] == [0, 0, 1]
    assert [action.action_unit_idx for action in actions] == [0, 1, 0]
    assert [action.first_block_idx for action in actions] == [0, 3, 0]
    assert {action.group for action in actions} == {"deepseek-chat"}
    assert "T0B1" in actions[0].action_text
    assert "T0B3" in actions[1].action_text
    assert "T1B1" in actions[2].action_text


@pytest.mark.unit
def test_extract_hodoscope_actions_uses_unknown_group_when_missing():
    agent_run = AgentRun(
        id="run-unknown",
        transcripts=[
            _transcript(
                "transcript",
                [
                    UserMessage(content="Start"),
                    AssistantMessage(content="I will answer."),
                ],
            )
        ],
        metadata={"task": "no model metadata"},
    )

    actions, group_by = extract_hodoscope_actions([agent_run], group_by=None)

    assert group_by == "unknown"
    assert len(actions) == 1
    assert actions[0].group == "unknown"


@pytest.mark.unit
def test_extract_hodoscope_actions_resolves_flat_metadata_field_names():
    agent_run = AgentRun(
        id="run-flat",
        transcripts=[
            _transcript(
                "transcript",
                [
                    UserMessage(content="Start"),
                    AssistantMessage(content="I will answer."),
                ],
            )
        ],
        metadata={"metadata.model": "flat-model"},
    )

    actions, group_by = extract_hodoscope_actions([agent_run], group_by="metadata.model")

    assert group_by == "metadata.model"
    assert len(actions) == 1
    assert actions[0].group == "flat-model"


@pytest.mark.unit
def test_sample_hodoscope_actions_is_bounded_deterministic_and_ordered():
    actions = [
        hodoscope_pipeline.HodoscopeActionPoint(
            agent_run_id=f"run-{index}",
            transcript_id=f"transcript-{index}",
            transcript_idx=0,
            action_unit_idx=0,
            first_block_idx=0,
            action_text=f"action {index}",
            task_context="",
            metadata={},
            group="group",
        )
        for index in range(30)
    ]

    sampled = sample_hodoscope_actions(actions, max_actions=10, seed=42)
    repeated = sample_hodoscope_actions(actions, max_actions=10, seed=42)

    assert len(sampled) == 10
    assert [action.agent_run_id for action in sampled] == [
        action.agent_run_id for action in repeated
    ]
    assert [actions.index(action) for action in sampled] == sorted(
        actions.index(action) for action in sampled
    )


@pytest.mark.unit
def test_sample_hodoscope_actions_preserves_small_groups_and_rotates_runs():
    actions = [
        hodoscope_pipeline.HodoscopeActionPoint(
            agent_run_id=f"large-run-{index % 2}",
            transcript_id=f"large-{index}",
            transcript_idx=0,
            action_unit_idx=index,
            first_block_idx=index,
            action_text=f"large action {index}",
            task_context="",
            metadata={},
            group="large",
        )
        for index in range(28)
    ]
    actions.extend(
        [
            hodoscope_pipeline.HodoscopeActionPoint(
                agent_run_id="small-run",
                transcript_id="small",
                transcript_idx=0,
                action_unit_idx=0,
                first_block_idx=0,
                action_text="small action",
                task_context="",
                metadata={},
                group="small",
            ),
            hodoscope_pipeline.HodoscopeActionPoint(
                agent_run_id="tiny-run",
                transcript_id="tiny",
                transcript_idx=0,
                action_unit_idx=0,
                first_block_idx=0,
                action_text="tiny action",
                task_context="",
                metadata={},
                group="tiny",
            ),
        ]
    )

    sampled = sample_hodoscope_actions(actions, max_actions=10, seed=7)

    assert {action.group for action in sampled} == {"large", "small", "tiny"}
    assert {action.agent_run_id for action in sampled if action.group == "large"} == {
        "large-run-0",
        "large-run-1",
    }


@pytest.mark.unit
def test_build_hodoscope_outputs_keeps_artifact_full_and_projection_compact(
    monkeypatch: pytest.MonkeyPatch,
):
    _clear_embedding_env(monkeypatch)
    summaries = [
        {
            "point_id": "run-a:t-a:0:0",
            "trajectory_id": "run-a",
            "turn_id": 0,
            "agent_run_id": "run-a",
            "transcript_id": "t-a",
            "transcript_idx": 0,
            "action_unit_idx": 0,
            "first_block_idx": 1,
            "summary": "Inspect logs\nFor diagnosing the timeout.",
            "action_text": "assistant looked at logs",
            "task_context": "debug timeout",
            "metadata": {"model": "a"},
            "group": "a",
            "embedding": [0.0, 1.0, 0.0],
        },
        {
            "point_id": "run-b:t-b:0:0",
            "trajectory_id": "run-b",
            "turn_id": 0,
            "agent_run_id": "run-b",
            "transcript_id": "t-b",
            "transcript_idx": 0,
            "action_unit_idx": 0,
            "first_block_idx": 1,
            "summary": "Patch retry policy\nFor making calls recover.",
            "action_text": "assistant patched retries",
            "task_context": "fix timeout",
            "metadata": {"model": "b"},
            "group": "b",
            "embedding": [1.0, 0.0, 0.0],
        },
    ]

    artifact, projection = build_hodoscope_outputs(
        summaries,
        HodoscopeAnalysisConfig(projection_method="tsne"),
        group_by="model",
        source="docent:test",
        total_action_counts={"run-a": 1, "run-b": 3},
    )

    assert artifact["source"] == "docent:test"
    assert artifact["embedding_model"] == "text-embedding-3-small"
    assert len(artifact["summaries"]) == 2
    assert all(summary["embedding"] for summary in artifact["summaries"])
    assert artifact["trajectory_manifest"] == [
        {"trajectory_id": "run-a", "agent_run_id": "run-a", "total_action_count": 1},
        {"trajectory_id": "run-b", "agent_run_id": "run-b", "total_action_count": 3},
    ]

    assert projection["requested_projection_method"] == "tsne"
    assert projection["projection_method"] == "pca"
    assert projection["group_by"] == "model"
    assert projection["groups"] == [{"name": "a", "count": 1}, {"name": "b", "count": 1}]
    assert len(projection["points"]) == 2
    assert projection["points"][0]["agent_run_id"] == "run-a"
    assert projection["points"][0]["first_block_idx"] == 1
    assert projection["points"][0]["context_excerpt"] == "debug timeout"
    assert set(projection["points"][0]).isdisjoint(
        {"embedding", "action_text", "task_context", "metadata"}
    )
    assert isinstance(projection["points"][0]["x"], float)
    assert isinstance(projection["points"][0]["fps_rank"], int)
    assert projection["trajectory_paths"] == [
        {
            "trajectory_id": "run-a",
            "agent_run_id": "run-a",
            "point_ids": ["run-a:t-a:0:0"],
            "projected_point_count": 1,
            "total_action_count": 1,
            "complete": True,
            "path_scope": "projected_points",
        },
        {
            "trajectory_id": "run-b",
            "agent_run_id": "run-b",
            "point_ids": ["run-b:t-b:0:0"],
            "projected_point_count": 1,
            "total_action_count": 3,
            "complete": False,
            "path_scope": "projected_points",
        },
    ]


@pytest.mark.unit
def test_build_hodoscope_outputs_handles_empty_inputs():
    artifact, projection = build_hodoscope_outputs(
        [],
        HodoscopeAnalysisConfig(),
        group_by="unknown",
        source="docent:empty",
    )

    assert artifact["summaries"] == []
    assert projection["points"] == []
    assert projection["groups"] == []


@pytest.mark.unit
def test_hodoscope_embedding_config_uses_local_embedding_env(
    monkeypatch: pytest.MonkeyPatch,
):
    _clear_embedding_env(monkeypatch)
    monkeypatch.setenv("DOCENT_EMBEDDING_MODEL", "local-bge-m3")
    monkeypatch.setenv("DOCENT_EMBEDDING_DIMENSIONS", "auto")

    config = HodoscopeAnalysisConfig()

    assert config.embedding_model == "local-bge-m3"
    assert config.embedding_dimensionality is None


@pytest.mark.unit
def test_hodoscope_embedding_config_allows_hodoscope_specific_override(
    monkeypatch: pytest.MonkeyPatch,
):
    _clear_embedding_env(monkeypatch)
    monkeypatch.setenv("DOCENT_EMBEDDING_MODEL", "global-embedding-model")
    monkeypatch.setenv("DOCENT_EMBEDDING_DIMENSIONS", "512")
    monkeypatch.setenv("DOCENT_HODOSCOPE_EMBEDDING_MODEL", "hodoscope-embedding-model")
    monkeypatch.setenv("DOCENT_HODOSCOPE_EMBEDDING_DIMENSIONS", "384")

    config = HodoscopeAnalysisConfig()

    assert config.embedding_model == "hodoscope-embedding-model"
    assert config.embedding_dimensionality == 384


@pytest.mark.unit
def test_openai_compatible_embedding_client_reuses_custom_llm_config(
    monkeypatch: pytest.MonkeyPatch,
):
    _clear_embedding_env(monkeypatch)
    monkeypatch.setenv("DOCENT_LLM_PROVIDER", "custom")
    monkeypatch.setenv("DOCENT_LLM_BASE_URL", "http://localhost:8000/v1")
    monkeypatch.setenv("DOCENT_LLM_API_KEY", "test-key")

    client = openai_provider.get_openai_compatible_embedding_client_async()

    assert openai_provider.get_openai_compatible_embedding_config_error() is None
    assert str(client.base_url).rstrip("/") == "http://localhost:8000/v1"
    assert client.api_key == "test-key"


@pytest.mark.unit
def test_openai_compatible_embedding_client_accepts_call_overrides(
    monkeypatch: pytest.MonkeyPatch,
):
    _clear_embedding_env(monkeypatch)

    client = openai_provider.get_openai_compatible_embedding_client_async(
        api_key="override-key",
        base_url="http://localhost:8001/v1",
    )

    assert (
        openai_provider.get_openai_compatible_embedding_config_error(
            api_key="override-key",
            base_url="http://localhost:8001/v1",
        )
        is None
    )
    assert str(client.base_url).rstrip("/") == "http://localhost:8001/v1"
    assert client.api_key == "override-key"


@pytest.mark.unit
def test_openai_compatible_embedding_config_reports_missing_key(
    monkeypatch: pytest.MonkeyPatch,
):
    _clear_embedding_env(monkeypatch)

    error = openai_provider.get_openai_compatible_embedding_config_error()

    assert error is not None
    assert "DOCENT_EMBEDDING_API_KEY" in error


@pytest.mark.unit
@pytest.mark.asyncio
async def test_chunked_embedding_helper_sends_text_chunks_to_compatible_endpoint(
    monkeypatch: pytest.MonkeyPatch,
):
    _clear_embedding_env(monkeypatch)
    seen_batches = []

    async def fake_one_batch(client, batch, model_name, dimensions):
        seen_batches.append(batch)
        return [[0.1, 0.2, 0.3] for _ in batch]

    monkeypatch.setattr(
        openai_provider,
        "get_openai_compatible_embedding_client_async",
        lambda api_key=None, base_url=None: {
            "api_key": api_key,
            "base_url": base_url,
        },
    )
    monkeypatch.setattr(
        openai_provider,
        "_get_openai_embeddings_async_one_batch",
        fake_one_batch,
    )

    embeddings, chunk_to_doc = await openai_provider.get_chunked_openai_embeddings_async(
        ["hello local embedding server"],
        model_name="local-embedding-model",
        dimensions=None,
    )

    assert embeddings == [[0.1, 0.2, 0.3]]
    assert chunk_to_doc == [0]
    assert seen_batches
    assert all(isinstance(item, str) for batch in seen_batches for item in batch)


@pytest.mark.unit
@pytest.mark.asyncio
async def test_embed_hodoscope_summaries_passes_configured_model_and_dimensions(
    monkeypatch: pytest.MonkeyPatch,
):
    _clear_embedding_env(monkeypatch)
    calls = {}

    async def fake_embeddings(
        texts,
        model_name,
        dimensions,
        max_concurrency,
        callback,
        api_key=None,
        base_url=None,
    ):
        calls["texts"] = texts
        calls["model_name"] = model_name
        calls["dimensions"] = dimensions
        calls["max_concurrency"] = max_concurrency
        calls["api_key"] = api_key
        calls["base_url"] = base_url
        if callback is not None:
            await callback(100)
        return [[0.4, 0.5, 0.6]], [0]

    progress = []

    async def progress_callback(value: int):
        progress.append(value)

    monkeypatch.setattr(
        hodoscope_pipeline,
        "get_openai_compatible_embedding_config_error",
        lambda api_key=None, base_url=None: None,
    )
    monkeypatch.setattr(
        hodoscope_pipeline,
        "get_chunked_openai_embeddings_async",
        fake_embeddings,
    )

    embedded = await embed_hodoscope_summaries(
        [
            {
                "point_id": "run:t:0:0",
                "summary": "Action: inspected logs\nFor: diagnosing a failure",
            }
        ],
        progress_callback=progress_callback,
        model_name="local-embedding-model",
        dimensions=None,
    )

    assert calls == {
        "texts": ["Action: inspected logs\nFor: diagnosing a failure"],
        "model_name": "local-embedding-model",
        "dimensions": None,
        "max_concurrency": 25,
        "api_key": None,
        "base_url": None,
    }
    assert progress == [100]
    assert embedded[0]["embedding"] == [0.4, 0.5, 0.6]


@pytest.mark.unit
@pytest.mark.asyncio
async def test_embed_hodoscope_summaries_uses_hodoscope_endpoint_overrides(
    monkeypatch: pytest.MonkeyPatch,
):
    _clear_embedding_env(monkeypatch)
    monkeypatch.setenv("DOCENT_HODOSCOPE_EMBEDDING_BASE_URL", "http://localhost:8002/v1")
    monkeypatch.setenv("DOCENT_HODOSCOPE_EMBEDDING_API_KEY", "hodo-key")
    calls = {}

    async def fake_embeddings(
        texts,
        model_name,
        dimensions,
        max_concurrency,
        callback,
        api_key=None,
        base_url=None,
    ):
        calls["api_key"] = api_key
        calls["base_url"] = base_url
        return [[0.7, 0.8, 0.9]], [0]

    monkeypatch.setattr(
        hodoscope_pipeline,
        "get_openai_compatible_embedding_config_error",
        lambda api_key=None, base_url=None: None,
    )
    monkeypatch.setattr(
        hodoscope_pipeline,
        "get_chunked_openai_embeddings_async",
        fake_embeddings,
    )

    embedded = await embed_hodoscope_summaries(
        [{"point_id": "run:t:0:0", "summary": "Action: listed files"}],
        model_name="hodoscope-model",
        dimensions=1024,
    )

    assert calls == {
        "api_key": "hodo-key",
        "base_url": "http://localhost:8002/v1",
    }
    assert embedded[0]["embedding"] == [0.7, 0.8, 0.9]
