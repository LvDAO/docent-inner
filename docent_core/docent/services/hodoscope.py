import hashlib
import json
import math
from collections.abc import Mapping, Sequence
from copy import deepcopy
from datetime import UTC, datetime
from typing import Any, Literal, cast
from uuid import uuid4

from pydantic import BaseModel, Field
from sqlalchemy import Select, and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from docent_core._env_util import ENV
from docent_core._llm_util.providers.openai import (
    DEFAULT_EMBEDDING_DIMENSIONS,
    DEFAULT_EMBEDDING_MODEL,
)
from docent_core._server._broker.redis_client import cancel_job, enqueue_job
from docent_core._worker.constants import WorkerFunction
from docent_core.docent.ai_tools.rubric.rubric import ResultType
from docent_core.docent.db.contexts import ViewContext
from docent_core.docent.db.schemas.rubric import (
    SQLAJudgeResult,
    SQLAJudgeResultCentroid,
    SQLARubric,
    SQLARubricCentroid,
)
from docent_core.docent.db.schemas.tables import (
    JobStatus,
    SQLAAgentRun,
    SQLAHodoscopeAnalysis,
    SQLAJob,
)

HodoscopeAnalysisStatus = Literal["pending", "running", "complete", "error", "canceled"]
HodoscopeProjectionMethod = Literal["pca", "tsne", "umap", "trimap", "pacmap"]

HODOSCOPE_EMBEDDING_MODEL = DEFAULT_EMBEDDING_MODEL
HODOSCOPE_EMBEDDING_DIM = DEFAULT_EMBEDDING_DIMENSIONS
HODOSCOPE_CONTEXT_EXCERPT_MAX_CHARS = 320
HODOSCOPE_MAX_LOADED_RUNS = 500
HODOSCOPE_TAG_LABEL_MAX_CHARS = 240
HODOSCOPE_TAG_STRING_MAX_CHARS = 160
HODOSCOPE_TAG_LIST_MAX_ITEMS = 16
HODOSCOPE_TAG_OBJECT_MAX_KEYS = 8
HODOSCOPE_TAG_MAX_DEPTH = 2

_HODOSCOPE_PROJECTION_TOP_LEVEL_FIELDS = (
    "version",
    "created_at",
    "group_by",
    "projection_method",
    "requested_projection_method",
    "groups",
    "tag_catalog",
    "trajectory_paths",
)
_HODOSCOPE_PROJECTION_POINT_FIELDS = (
    "id",
    "trajectory_id",
    "turn_id",
    "agent_run_id",
    "transcript_id",
    "transcript_idx",
    "action_unit_idx",
    "first_block_idx",
    "summary",
    "group",
    "x",
    "y",
    "fps_rank",
    "tag_ids",
)


def _env_value(name: str) -> str | None:
    value = ENV.get(name)
    if value is None:
        return None
    value = value.strip()
    return value or None


def _env_int_or_none(*names: str) -> int | None:
    for name in names:
        raw_value = _env_value(name)
        if raw_value is None:
            continue
        if raw_value.lower() in {"none", "null", "auto"}:
            return None
        try:
            return int(raw_value)
        except ValueError as exc:
            raise ValueError(f"{name} must be an integer, none, null, or auto") from exc
    return None


def get_hodoscope_embedding_model() -> str:
    return (
        _env_value("DOCENT_HODOSCOPE_EMBEDDING_MODEL")
        or _env_value("DOCENT_EMBEDDING_MODEL")
        or HODOSCOPE_EMBEDDING_MODEL
    )


def get_hodoscope_embedding_base_url() -> str | None:
    return _env_value("DOCENT_HODOSCOPE_EMBEDDING_BASE_URL")


def get_hodoscope_embedding_api_key() -> str | None:
    return _env_value("DOCENT_HODOSCOPE_EMBEDDING_API_KEY")


def get_hodoscope_embedding_dimensionality() -> int | None:
    configured = _env_int_or_none(
        "DOCENT_HODOSCOPE_EMBEDDING_DIMENSIONS",
        "DOCENT_HODOSCOPE_EMBEDDING_DIM",
        "DOCENT_EMBEDDING_DIMENSIONS",
        "DOCENT_EMBEDDING_DIM",
    )
    if configured is not None:
        return configured
    if any(
        _env_value(name) is not None
        for name in (
            "DOCENT_HODOSCOPE_EMBEDDING_DIMENSIONS",
            "DOCENT_HODOSCOPE_EMBEDDING_DIM",
            "DOCENT_EMBEDDING_DIMENSIONS",
            "DOCENT_EMBEDDING_DIM",
        )
    ):
        return None

    if get_hodoscope_embedding_model().startswith("text-embedding-3-"):
        return HODOSCOPE_EMBEDDING_DIM
    return None


def _bounded_compact_text(value: object, max_chars: int) -> str | None:
    if not isinstance(value, str):
        return None

    compact = " ".join(value.split())
    if not compact:
        return None
    if len(compact) <= max_chars:
        return compact
    return f"{compact[: max_chars - 1].rstrip()}…"


def _metadata_sources(metadata: object) -> list[dict[str, Any]]:
    if not isinstance(metadata, dict):
        return []

    root = cast(dict[str, Any], metadata)
    sources = [root]
    for key in ("metadata", "agent_run_metadata"):
        nested = root.get(key)
        if isinstance(nested, dict):
            sources.append(cast(dict[str, Any], nested))
    for source in list(sources):
        scores = source.get("scores")
        if isinstance(scores, dict):
            sources.append(cast(dict[str, Any], scores))
    return sources


def _metadata_value(metadata: object, key: str) -> object | None:
    for source in _metadata_sources(metadata):
        for candidate in (key, f"metadata.{key}"):
            value = source.get(candidate)
            if value is not None:
                return cast(object, value)
    return None


def _compact_scalar(value: object, max_chars: int) -> str | None:
    if isinstance(value, str):
        return _bounded_compact_text(value, max_chars)
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int | float):
        return _bounded_compact_text(str(value), max_chars)
    return None


def _compact_task_id(metadata: object) -> str | None:
    for key in ("task_id", "task_name", "task_slug"):
        value = _metadata_value(metadata, key)
        compact = _compact_scalar(value, 256)
        if compact is not None:
            return compact

        if isinstance(value, dict):
            task_id = cast(dict[str, Any], value)
            org = _compact_scalar(task_id.get("org"), 96)
            name = _compact_scalar(task_id.get("name"), 160)
            if org and name:
                return _bounded_compact_text(f"{org}/{name}", 256)
            if name:
                return name
    return None


def _compact_outcome(metadata: object, exception_type: str | None) -> str | None:
    terminal_outcome = _compact_scalar(_metadata_value(metadata, "terminal_outcome"), 64)
    normalized_exception = (exception_type or "").lower()
    normalized_terminal = (terminal_outcome or "").lower()

    if "timeout" in normalized_exception or "timeout" in normalized_terminal:
        return "timeout"
    if exception_type is not None or any(
        marker in normalized_terminal for marker in ("exception", "error")
    ):
        return "exception"

    for key in ("passed", "success"):
        success = _metadata_value(metadata, key)
        if isinstance(success, bool):
            return "passed" if success else "failed"

    reward = _metadata_value(metadata, "reward")
    if isinstance(reward, int | float) and not isinstance(reward, bool):
        if reward == 1:
            return "passed"
        if reward == 0:
            return "failed"

    return terminal_outcome


def _point_trajectory_id(point: Mapping[str, Any]) -> str | None:
    for key in ("agent_run_id", "trajectory_id"):
        value = point.get(key)
        if isinstance(value, str) and value:
            return value
    return None


def _point_order_key(point: Mapping[str, Any]) -> tuple[int, int, str]:
    transcript_idx = point.get("transcript_idx")
    action_unit_idx = point.get("action_unit_idx")
    point_id = point.get("id")
    return (
        transcript_idx if isinstance(transcript_idx, int) else 2**31 - 1,
        action_unit_idx if isinstance(action_unit_idx, int) else 2**31 - 1,
        point_id if isinstance(point_id, str) else "",
    )


def build_hodoscope_trajectory_paths(
    points: object,
    *,
    existing_paths: object = None,
    total_action_counts: Mapping[str, int] | None = None,
) -> list[dict[str, Any]]:
    """Build ordered trajectory paths while preserving persisted coverage metadata."""

    points_by_trajectory: dict[str, list[dict[str, Any]]] = {}
    agent_run_ids: dict[str, str] = {}
    trajectory_order: list[str] = []
    if isinstance(points, list):
        for point_raw in cast(list[object], points):
            if not isinstance(point_raw, dict):
                continue
            point = cast(dict[str, Any], point_raw)
            trajectory_id = _point_trajectory_id(point)
            if trajectory_id is None:
                continue
            if trajectory_id not in points_by_trajectory:
                trajectory_order.append(trajectory_id)
                points_by_trajectory[trajectory_id] = []
            points_by_trajectory[trajectory_id].append(point)
            agent_run_id = point.get("agent_run_id")
            if isinstance(agent_run_id, str) and agent_run_id:
                agent_run_ids[trajectory_id] = agent_run_id

    persisted_paths: dict[str, dict[str, Any]] = {}
    if isinstance(existing_paths, list):
        for path_raw in cast(list[object], existing_paths):
            if not isinstance(path_raw, dict):
                continue
            path = cast(dict[str, Any], path_raw)
            trajectory_id = path.get("trajectory_id")
            if not isinstance(trajectory_id, str) or not trajectory_id:
                continue
            persisted_paths[trajectory_id] = path
            if trajectory_id not in trajectory_order:
                trajectory_order.append(trajectory_id)

    if total_action_counts is not None:
        for trajectory_id in total_action_counts:
            if trajectory_id not in trajectory_order:
                trajectory_order.append(trajectory_id)

    paths: list[dict[str, Any]] = []
    for trajectory_id in trajectory_order:
        trajectory_points = sorted(
            points_by_trajectory.get(trajectory_id, []), key=_point_order_key
        )
        point_ids = [
            point_id
            for point in trajectory_points
            if isinstance((point_id := point.get("id")), str) and point_id
        ]
        projected_point_count = len(point_ids)

        persisted = persisted_paths.get(trajectory_id, {})
        total_action_count: int | None = None
        if total_action_counts is not None:
            total = total_action_counts.get(trajectory_id)
            if isinstance(total, int) and not isinstance(total, bool) and total >= 0:
                total_action_count = total
        if total_action_count is None:
            total = persisted.get("total_action_count")
            if isinstance(total, int) and not isinstance(total, bool) and total >= 0:
                total_action_count = total

        complete: bool | None
        if total_action_count is not None:
            complete = projected_point_count == total_action_count
        else:
            persisted_complete = persisted.get("complete")
            complete = persisted_complete if isinstance(persisted_complete, bool) else None

        persisted_agent_run_id = persisted.get("agent_run_id")
        agent_run_id = agent_run_ids.get(trajectory_id)
        if agent_run_id is None and isinstance(persisted_agent_run_id, str):
            agent_run_id = persisted_agent_run_id
        paths.append(
            {
                "trajectory_id": trajectory_id,
                "agent_run_id": agent_run_id or trajectory_id,
                "point_ids": point_ids,
                "projected_point_count": projected_point_count,
                "total_action_count": total_action_count,
                "complete": complete,
                "path_scope": "projected_points",
            }
        )
    return paths


def _bounded_tag_value(value: object, depth: int = 0) -> object | None:
    if isinstance(value, str):
        return _bounded_compact_text(value, HODOSCOPE_TAG_STRING_MAX_CHARS)
    if isinstance(value, bool) or isinstance(value, int):
        return value
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if isinstance(value, dict):
        value_mapping = cast(dict[object, object], value)
        if depth >= HODOSCOPE_TAG_MAX_DEPTH:
            serialized = json.dumps(
                value_mapping, sort_keys=True, separators=(",", ":"), default=str
            )
            return _bounded_compact_text(serialized, HODOSCOPE_TAG_STRING_MAX_CHARS)
        bounded: dict[str, object] = {}
        input_keys = sorted(value_mapping, key=lambda key: str(key))[:HODOSCOPE_TAG_OBJECT_MAX_KEYS]
        for input_key in input_keys:
            output_key = str(input_key)
            bounded_value = _bounded_tag_value(value_mapping[input_key], depth + 1)
            if bounded_value is not None:
                bounded[_bounded_compact_text(output_key, 64) or output_key[:64]] = bounded_value
        return bounded
    if isinstance(value, list):
        value_items = cast(list[object], value)
        bounded_values = [
            bounded_item
            for item in value_items[:HODOSCOPE_TAG_LIST_MAX_ITEMS]
            if (bounded_item := _bounded_tag_value(item, depth + 1)) is not None
        ]
        return bounded_values
    return None


def _canonical_tag_value(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _tag_value_label(value: object) -> str:
    if isinstance(value, str):
        label = value
    elif isinstance(value, bool):
        label = "true" if value else "false"
    else:
        label = _canonical_tag_value(value)
    return _bounded_compact_text(label, HODOSCOPE_TAG_LABEL_MAX_CHARS) or "(empty)"


def _metadata_tag_values(metadata: Mapping[str, object], tag_by: str) -> list[object]:
    candidates = [tag_by]
    if tag_by.startswith("metadata."):
        candidates.append(tag_by.removeprefix("metadata."))

    raw_value: object | None = None
    for candidate in candidates:
        if candidate in metadata:
            raw_value = metadata[candidate]
        else:
            current: object = cast(object, metadata)
            found = True
            for part in candidate.split("."):
                if isinstance(current, dict) and part in current:
                    current_mapping = cast(dict[str, object], current)
                    current = current_mapping[part]
                else:
                    found = False
                    break
            if found:
                raw_value = cast(object, current)
        if raw_value is not None:
            break

    if raw_value is None:
        return []
    raw_values: list[object]
    if isinstance(raw_value, list):
        raw_values = cast(list[object], raw_value)
    else:
        raw_values = [raw_value]
    values = [
        bounded
        for value in raw_values[:HODOSCOPE_TAG_LIST_MAX_ITEMS]
        if (bounded := _bounded_tag_value(value)) is not None
    ]
    return sorted(values, key=_canonical_tag_value)


def build_hodoscope_metadata_tag_overlay(
    metadata_by_agent_run: Mapping[str, Mapping[str, object]], tag_by: str
) -> tuple[list[dict[str, Any]], dict[str, list[str]]]:
    """Convert one metadata field into bounded deterministic trajectory tags."""

    catalog_by_id: dict[str, dict[str, Any]] = {}
    tag_ids_by_trajectory: dict[str, list[str]] = {}
    for agent_run_id in sorted(metadata_by_agent_run):
        metadata = metadata_by_agent_run[agent_run_id]
        for value in _metadata_tag_values(metadata, tag_by):
            canonical = _canonical_tag_value({"field": tag_by, "value": value})
            tag_id = f"metadata:{hashlib.sha256(canonical.encode()).hexdigest()[:24]}"
            catalog_by_id.setdefault(
                tag_id,
                {
                    "id": tag_id,
                    "label": _tag_value_label(value),
                    "facet": tag_by,
                    "source_label": tag_by,
                    "source": "metadata",
                    "scope": "trajectory",
                    "inherited": True,
                    "field": tag_by,
                    "value": value,
                },
            )
            tag_ids_by_trajectory.setdefault(agent_run_id, []).append(tag_id)

    return list(catalog_by_id.values()), {
        trajectory_id: list(dict.fromkeys(tag_ids))
        for trajectory_id, tag_ids in tag_ids_by_trajectory.items()
    }


def _simple_result_label(output: object) -> object | None:
    if not isinstance(output, dict):
        return None
    output_mapping = cast(dict[str, object], output)
    label = output_mapping.get("label")
    if isinstance(label, str | bool | int | float):
        return _bounded_tag_value(label)
    return None


def _rubric_source_label(rubric_text: object, result_label: object | None) -> str:
    rubric_label = "Rubric"
    if isinstance(rubric_text, str):
        first_line = next((line.strip() for line in rubric_text.splitlines() if line.strip()), "")
        rubric_label = (
            _bounded_compact_text(first_line, HODOSCOPE_TAG_STRING_MAX_CHARS) or rubric_label
        )
    if result_label is not None:
        rubric_label = f"{rubric_label} · {_tag_value_label(result_label)}"
    return _bounded_compact_text(rubric_label, HODOSCOPE_TAG_LABEL_MAX_CHARS) or "Rubric"


def build_hodoscope_rubric_tag_overlay(
    rows: Sequence[Mapping[str, Any]],
) -> tuple[list[dict[str, Any]], dict[str, list[str]]]:
    """Map positive centroid assignments to neutral trajectory-level cluster tags."""

    catalog_by_id: dict[str, dict[str, Any]] = {}
    tag_ids_by_trajectory: dict[str, list[str]] = {}
    ordered_rows = sorted(
        rows,
        key=lambda row: (
            str(row.get("agent_run_id", "")),
            str(row.get("rubric_id", "")),
            int(row.get("rubric_version", 0)),
            str(row.get("centroid_id", "")),
            _canonical_tag_value(_simple_result_label(row.get("output"))),
        ),
    )
    for row in ordered_rows:
        agent_run_id = row.get("agent_run_id")
        rubric_id = row.get("rubric_id")
        rubric_version = row.get("rubric_version")
        centroid_id = row.get("centroid_id")
        if not isinstance(agent_run_id, str) or not agent_run_id:
            continue
        if not isinstance(rubric_id, str) or not rubric_id:
            continue
        if not isinstance(rubric_version, int) or isinstance(rubric_version, bool):
            continue
        if not isinstance(centroid_id, str) or not centroid_id:
            continue

        centroid = (
            _bounded_compact_text(row.get("centroid"), HODOSCOPE_TAG_LABEL_MAX_CHARS) or centroid_id
        )
        result_label_value = _simple_result_label(row.get("output"))
        identity = _canonical_tag_value(
            {
                "rubric_id": rubric_id,
                "rubric_version": rubric_version,
                "centroid_id": centroid_id,
                "result_label": result_label_value,
            }
        )
        tag_id = f"rubric_cluster:{hashlib.sha256(identity.encode()).hexdigest()[:24]}"
        definition: dict[str, Any] = {
            "id": tag_id,
            "label": centroid,
            "facet": f"rubric:{rubric_id}:v{rubric_version}",
            "source_label": _rubric_source_label(row.get("rubric_text"), result_label_value),
            "source": "rubric_cluster",
            "scope": "trajectory",
            "inherited": True,
            "rubric_id": rubric_id,
            "rubric_version": rubric_version,
            "centroid_id": centroid_id,
            "centroid": centroid,
            "result_type": ResultType.DIRECT_RESULT.value,
        }
        if result_label_value is not None:
            definition["result_label"] = _tag_value_label(result_label_value)
        catalog_by_id.setdefault(tag_id, definition)
        tag_ids_by_trajectory.setdefault(agent_run_id, []).append(tag_id)

    return list(catalog_by_id.values()), {
        trajectory_id: list(dict.fromkeys(tag_ids))
        for trajectory_id, tag_ids in tag_ids_by_trajectory.items()
    }


def _set_hodoscope_tag_counts(projection: dict[str, Any]) -> dict[str, Any]:
    counts: dict[str, int] = {}
    points = projection.get("points")
    if isinstance(points, list):
        for point_raw in cast(list[object], points):
            if not isinstance(point_raw, dict):
                continue
            point = cast(dict[str, object], point_raw)
            tag_ids = point.get("tag_ids")
            if not isinstance(tag_ids, list):
                continue
            tag_id_items = cast(list[object], tag_ids)
            for tag_id in set(tag_id for tag_id in tag_id_items if isinstance(tag_id, str)):
                counts[tag_id] = counts.get(tag_id, 0) + 1

    catalog = projection.get("tag_catalog")
    if isinstance(catalog, list):
        for definition_raw in cast(list[object], catalog):
            if not isinstance(definition_raw, dict):
                continue
            definition = cast(dict[str, object], definition_raw)
            tag_id = definition.get("id")
            definition["count"] = counts.get(tag_id, 0) if isinstance(tag_id, str) else 0
    return projection


def merge_hodoscope_tag_overlay(
    projection: dict[str, Any],
    tag_catalog: list[dict[str, Any]],
    tag_ids_by_trajectory: Mapping[str, list[str]],
) -> dict[str, Any]:
    """Merge read-time tags without mutating or replacing stored point tags."""

    merged = deepcopy(projection)
    existing_catalog_raw = merged.get("tag_catalog")
    existing_catalog = (
        cast(list[object], existing_catalog_raw) if isinstance(existing_catalog_raw, list) else []
    )
    catalog_by_id: dict[str, dict[str, Any]] = {}
    for definition_raw in [*existing_catalog, *tag_catalog]:
        if not isinstance(definition_raw, dict):
            continue
        definition = cast(dict[str, Any], definition_raw)
        tag_id = definition.get("id")
        if isinstance(tag_id, str) and tag_id:
            catalog_by_id.setdefault(tag_id, deepcopy(definition))
    merged["tag_catalog"] = list(catalog_by_id.values())

    points_raw = merged.get("points")
    if isinstance(points_raw, list):
        for point_raw in cast(list[object], points_raw):
            if not isinstance(point_raw, dict):
                continue
            point = cast(dict[str, Any], point_raw)
            existing_tag_ids = point.get("tag_ids")
            tag_ids = (
                [
                    tag_id
                    for tag_id in cast(list[object], existing_tag_ids)
                    if isinstance(tag_id, str)
                ]
                if isinstance(existing_tag_ids, list)
                else []
            )
            trajectory_id = _point_trajectory_id(point)
            if trajectory_id is not None:
                tag_ids.extend(tag_ids_by_trajectory.get(trajectory_id, []))
            point["tag_ids"] = list(dict.fromkeys(tag_ids))
    return _set_hodoscope_tag_counts(merged)


def build_hodoscope_rubric_tag_query(collection_id: str, agent_run_ids: list[str]) -> Select[Any]:
    """Build the read-only latest-rubric centroid overlay query."""

    latest_versions = (
        select(
            SQLARubric.id.label("rubric_id"),
            func.max(SQLARubric.version).label("rubric_version"),
        )
        .where(SQLARubric.collection_id == collection_id)
        .group_by(SQLARubric.id)
        .subquery()
    )
    return (
        select(
            SQLAJudgeResult.agent_run_id.label("agent_run_id"),
            SQLAJudgeResult.rubric_id.label("rubric_id"),
            SQLAJudgeResult.rubric_version.label("rubric_version"),
            SQLAJudgeResult.output.label("output"),
            SQLARubric.rubric_text.label("rubric_text"),
            SQLARubricCentroid.id.label("centroid_id"),
            SQLARubricCentroid.centroid.label("centroid"),
        )
        .select_from(SQLAJudgeResult)
        .join(SQLAAgentRun, SQLAAgentRun.id == SQLAJudgeResult.agent_run_id)
        .join(
            latest_versions,
            and_(
                latest_versions.c.rubric_id == SQLAJudgeResult.rubric_id,
                latest_versions.c.rubric_version == SQLAJudgeResult.rubric_version,
            ),
        )
        .join(
            SQLARubric,
            and_(
                SQLARubric.id == SQLAJudgeResult.rubric_id,
                SQLARubric.version == SQLAJudgeResult.rubric_version,
            ),
        )
        .join(
            SQLAJudgeResultCentroid,
            SQLAJudgeResultCentroid.judge_result_id == SQLAJudgeResult.id,
        )
        .join(
            SQLARubricCentroid,
            and_(
                SQLARubricCentroid.id == SQLAJudgeResultCentroid.centroid_id,
                SQLARubricCentroid.rubric_id == SQLAJudgeResult.rubric_id,
                SQLARubricCentroid.rubric_version == SQLAJudgeResult.rubric_version,
            ),
        )
        .where(
            SQLAAgentRun.collection_id == collection_id,
            SQLAAgentRun.id.in_(agent_run_ids),
            SQLARubricCentroid.collection_id == collection_id,
            SQLAJudgeResult.result_type == ResultType.DIRECT_RESULT,
            SQLARubricCentroid.result_type == ResultType.DIRECT_RESULT,
            SQLAJudgeResultCentroid.result_type == ResultType.DIRECT_RESULT,
            SQLAJudgeResultCentroid.decision.is_(True),
        )
        .order_by(
            SQLAJudgeResult.agent_run_id,
            SQLAJudgeResult.rubric_id,
            SQLARubricCentroid.id,
        )
    )


def build_hodoscope_projection_view(projection: dict[str, Any]) -> dict[str, Any]:
    """Build the compact public projection without mutating the stored projection."""

    view = {
        key: deepcopy(projection[key])
        for key in _HODOSCOPE_PROJECTION_TOP_LEVEL_FIELDS
        if key in projection
    }
    view["view_schema_version"] = "hodoscope_projection_view.v2"
    tag_catalog = projection.get("tag_catalog")
    view["tag_catalog"] = (
        deepcopy(cast(list[object], tag_catalog)) if isinstance(tag_catalog, list) else []
    )
    points_raw: object = projection.get("points", [])
    public_points: list[dict[str, Any]] = []

    if isinstance(points_raw, list):
        for point_raw in cast(list[object], points_raw):
            if not isinstance(point_raw, dict):
                continue

            point = cast(dict[str, Any], point_raw)
            public_point = {
                key: deepcopy(point.get(key)) for key in _HODOSCOPE_PROJECTION_POINT_FIELDS
            }
            tag_ids = point.get("tag_ids")
            public_point["tag_ids"] = (
                list(
                    dict.fromkeys(
                        tag_id for tag_id in cast(list[object], tag_ids) if isinstance(tag_id, str)
                    )
                )
                if isinstance(tag_ids, list)
                else []
            )
            context_excerpt = (
                _bounded_compact_text(
                    point.get("context_excerpt"), HODOSCOPE_CONTEXT_EXCERPT_MAX_CHARS
                )
                or _bounded_compact_text(
                    point.get("task_context"), HODOSCOPE_CONTEXT_EXCERPT_MAX_CHARS
                )
                or _bounded_compact_text(
                    point.get("action_text"), HODOSCOPE_CONTEXT_EXCERPT_MAX_CHARS
                )
            )
            public_point["context_excerpt"] = context_excerpt or ""

            metadata = point.get("metadata")
            exception_type = _compact_scalar(point.get("exception_type"), 128) or _compact_scalar(
                _metadata_value(metadata, "exception_type"), 128
            )
            outcome = _compact_scalar(point.get("outcome"), 64) or _compact_outcome(
                metadata, exception_type
            )
            task_id = _compact_scalar(point.get("task_id"), 256) or _compact_task_id(metadata)
            if outcome is not None:
                public_point["outcome"] = outcome
            if exception_type is not None:
                public_point["exception_type"] = exception_type
            if task_id is not None:
                public_point["task_id"] = task_id

            public_points.append(public_point)

    view["points"] = public_points
    view["trajectory_paths"] = build_hodoscope_trajectory_paths(
        public_points,
        existing_paths=projection.get("trajectory_paths"),
    )
    return _set_hodoscope_tag_counts(view)


def expand_hodoscope_projection_view(
    projection: dict[str, Any], artifact: dict[str, Any] | None
) -> dict[str, Any]:
    """Restore the legacy full projection shape from a compact stored projection."""

    points = projection.get("points")
    if not isinstance(points, list) or not points:
        full_projection = deepcopy(projection)
        full_projection.pop("view_schema_version", None)
        return full_projection
    if isinstance(points[0], dict) and "embedding" in points[0]:
        return projection

    summaries = artifact.get("summaries") if isinstance(artifact, dict) else None
    if not isinstance(summaries, list):
        full_projection = deepcopy(projection)
        full_projection.pop("view_schema_version", None)
        return full_projection

    point_rows = cast(list[object], points)
    summary_rows = cast(list[object], summaries)
    if len(summary_rows) != len(point_rows):
        full_projection = deepcopy(projection)
        full_projection.pop("view_schema_version", None)
        return full_projection

    full_projection = deepcopy(projection)
    full_projection.pop("view_schema_version", None)
    full_points = cast(list[object], full_projection["points"])
    for point_raw, summary_raw in zip(full_points, summary_rows, strict=True):
        if not isinstance(point_raw, dict) or not isinstance(summary_raw, dict):
            continue
        point = cast(dict[str, Any], point_raw)
        summary = cast(dict[str, Any], summary_raw)
        for key in ("action_text", "task_context", "metadata", "embedding"):
            if key in summary:
                point[key] = deepcopy(summary[key])
    return full_projection


class HodoscopeAnalysisConfig(BaseModel):
    name: str = "Hodoscope analysis"
    group_by: str | None = None
    limit: int = Field(default=500, ge=1, le=10_000)
    max_actions: int = Field(default=5_000, ge=500, le=5_000)
    seed: int = 42
    projection_method: HodoscopeProjectionMethod = "tsne"
    summary_model: str = "docent-provider-preferences"
    embedding_model: str = Field(default_factory=get_hodoscope_embedding_model)
    embedding_dimensionality: int | None = Field(
        default_factory=get_hodoscope_embedding_dimensionality
    )


class HodoscopeAnalysisSummary(BaseModel):
    id: str
    collection_id: str
    job_id: str | None
    name: str
    status: HodoscopeAnalysisStatus
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None
    config: dict[str, Any]
    error: str | None
    stage: str | None = None
    progress: int | None = None
    point_count: int = 0
    group_count: int = 0


class HodoscopeService:
    def __init__(self, session: AsyncSession):
        self.session = session

    @staticmethod
    def _now() -> datetime:
        return datetime.now(UTC).replace(tzinfo=None)

    @staticmethod
    def _summary_from_sqla(sq_analysis: SQLAHodoscopeAnalysis) -> HodoscopeAnalysisSummary:
        projection = sq_analysis.projection_json or {}
        points_raw: object = projection.get("points", [])
        groups_raw: object = projection.get("groups", [])
        job_state_raw: object = sq_analysis.config_json.get("_job_state", {})
        job_state = cast(dict[str, Any], job_state_raw) if isinstance(job_state_raw, dict) else {}
        stage_raw: object = job_state.get("stage")
        progress_raw: object = job_state.get("progress")
        return HodoscopeAnalysisSummary(
            id=sq_analysis.id,
            collection_id=sq_analysis.collection_id,
            job_id=sq_analysis.job_id,
            name=sq_analysis.name,
            status=sq_analysis.status,  # type: ignore[arg-type]
            created_at=sq_analysis.created_at,
            updated_at=sq_analysis.updated_at,
            completed_at=sq_analysis.completed_at,
            config={k: v for k, v in sq_analysis.config_json.items() if k != "_job_state"},
            error=sq_analysis.error,
            stage=stage_raw if isinstance(stage_raw, str) else None,
            progress=progress_raw if isinstance(progress_raw, int) else None,
            point_count=len(cast(list[object], points_raw)) if isinstance(points_raw, list) else 0,
            group_count=len(cast(list[object], groups_raw)) if isinstance(groups_raw, list) else 0,
        )

    @staticmethod
    def _summary_from_mapping(row: Mapping[Any, Any]) -> HodoscopeAnalysisSummary:
        config_json = cast(dict[str, Any], row["config_json"])
        job_state_raw: object = config_json.get("_job_state", {})
        job_state = cast(dict[str, Any], job_state_raw) if isinstance(job_state_raw, dict) else {}
        stage_raw: object = job_state.get("stage")
        progress_raw: object = job_state.get("progress")
        return HodoscopeAnalysisSummary(
            id=row["id"],
            collection_id=row["collection_id"],
            job_id=row["job_id"],
            name=row["name"],
            status=row["status"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            completed_at=row["completed_at"],
            config={k: v for k, v in config_json.items() if k != "_job_state"},
            error=row["error"],
            stage=stage_raw if isinstance(stage_raw, str) else None,
            progress=progress_raw if isinstance(progress_raw, int) else None,
            point_count=int(row["point_count"] or 0),
            group_count=int(row["group_count"] or 0),
        )

    @staticmethod
    def _summary_columns() -> tuple[Any, ...]:
        projection = SQLAHodoscopeAnalysis.projection_json
        return (
            SQLAHodoscopeAnalysis.id,
            SQLAHodoscopeAnalysis.collection_id,
            SQLAHodoscopeAnalysis.job_id,
            SQLAHodoscopeAnalysis.name,
            SQLAHodoscopeAnalysis.status,
            SQLAHodoscopeAnalysis.created_at,
            SQLAHodoscopeAnalysis.updated_at,
            SQLAHodoscopeAnalysis.completed_at,
            SQLAHodoscopeAnalysis.config_json,
            SQLAHodoscopeAnalysis.error,
            func.coalesce(func.jsonb_array_length(projection["points"]), 0).label("point_count"),
            func.coalesce(func.jsonb_array_length(projection["groups"]), 0).label("group_count"),
        )

    async def get_analysis(
        self, ctx: ViewContext, analysis_id: str
    ) -> SQLAHodoscopeAnalysis | None:
        result = await self.session.execute(
            select(SQLAHodoscopeAnalysis).where(
                SQLAHodoscopeAnalysis.collection_id == ctx.collection_id,
                SQLAHodoscopeAnalysis.id == analysis_id,
            )
        )
        return result.scalar_one_or_none()

    async def get_analysis_summary(
        self, ctx: ViewContext, analysis_id: str
    ) -> HodoscopeAnalysisSummary | None:
        result = await self.session.execute(
            select(*self._summary_columns()).where(
                SQLAHodoscopeAnalysis.collection_id == ctx.collection_id,
                SQLAHodoscopeAnalysis.id == analysis_id,
            )
        )
        row = result.mappings().one_or_none()
        return self._summary_from_mapping(row) if row else None

    async def list_analyses(self, ctx: ViewContext) -> list[HodoscopeAnalysisSummary]:
        result = await self.session.execute(
            select(*self._summary_columns())
            .where(SQLAHodoscopeAnalysis.collection_id == ctx.collection_id)
            .order_by(SQLAHodoscopeAnalysis.created_at.desc())
        )
        return [self._summary_from_mapping(row) for row in result.mappings().all()]

    async def get_active_analysis(self, ctx: ViewContext) -> SQLAHodoscopeAnalysis | None:
        result = await self.session.execute(
            select(SQLAHodoscopeAnalysis)
            .where(
                SQLAHodoscopeAnalysis.collection_id == ctx.collection_id,
                SQLAHodoscopeAnalysis.status.in_(["pending", "running"]),
            )
            .order_by(SQLAHodoscopeAnalysis.created_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def start_or_get_analysis(
        self, ctx: ViewContext, config: HodoscopeAnalysisConfig
    ) -> HodoscopeAnalysisSummary:
        sq_active = await self.get_active_analysis(ctx)
        if sq_active is not None:
            return self._summary_from_sqla(sq_active)

        analysis_id = str(uuid4())
        job_id = str(uuid4())
        now = self._now()
        config_json = config.model_dump()
        config_json["_job_state"] = {"stage": "pending", "progress": 0}
        sq_analysis = SQLAHodoscopeAnalysis(
            id=analysis_id,
            collection_id=ctx.collection_id,
            job_id=job_id,
            name=config.name,
            status="pending",
            created_at=now,
            updated_at=now,
            completed_at=None,
            config_json=config_json,
            artifact_json=None,
            projection_json=None,
            error=None,
        )
        sq_job = SQLAJob(
            id=job_id,
            type=WorkerFunction.HODOSCOPE_ANALYSIS.value,
            created_at=now,
            job_json={
                "collection_id": ctx.collection_id,
                "analysis_id": analysis_id,
                "stage": "pending",
                "progress": 0,
            },
            status=JobStatus.PENDING,
        )
        self.session.add(sq_job)
        await self.session.flush()
        self.session.add(sq_analysis)
        await self.session.commit()
        await enqueue_job(ctx, job_id)
        await self.session.refresh(sq_analysis)
        return self._summary_from_sqla(sq_analysis)

    async def _enrich_projection_tags(
        self,
        projection: dict[str, Any],
        *,
        collection_id: str,
        tag_by: str | None,
        include_rubric_tags: bool,
    ) -> dict[str, Any]:
        points = projection.get("points")
        point_rows = cast(list[object], points) if isinstance(points, list) else []
        agent_run_ids = list(
            dict.fromkeys(
                trajectory_id
                for point in point_rows
                if isinstance(point, dict)
                and (trajectory_id := _point_trajectory_id(cast(dict[str, Any], point))) is not None
            )
        )
        if not agent_run_ids:
            return projection

        enriched = projection
        if tag_by:
            metadata_result = await self.session.execute(
                select(SQLAAgentRun.id, SQLAAgentRun.metadata_json).where(
                    SQLAAgentRun.collection_id == collection_id,
                    SQLAAgentRun.id.in_(agent_run_ids),
                )
            )
            metadata_by_agent_run = {
                agent_run_id: cast(dict[str, Any], metadata or {})
                for agent_run_id, metadata in metadata_result.all()
            }
            tag_catalog, tag_ids_by_trajectory = build_hodoscope_metadata_tag_overlay(
                metadata_by_agent_run, tag_by
            )
            enriched = merge_hodoscope_tag_overlay(enriched, tag_catalog, tag_ids_by_trajectory)

        if include_rubric_tags:
            rubric_result = await self.session.execute(
                build_hodoscope_rubric_tag_query(collection_id, agent_run_ids)
            )
            rubric_rows = cast(Sequence[Mapping[str, Any]], rubric_result.mappings().all())
            tag_catalog, tag_ids_by_trajectory = build_hodoscope_rubric_tag_overlay(rubric_rows)
            enriched = merge_hodoscope_tag_overlay(enriched, tag_catalog, tag_ids_by_trajectory)
        return enriched

    @staticmethod
    def _merge_compact_annotations_into_full(
        full_projection: dict[str, Any], compact_projection: dict[str, Any]
    ) -> dict[str, Any]:
        merged = deepcopy(full_projection)
        compact_catalog = compact_projection.get("tag_catalog")
        compact_paths = compact_projection.get("trajectory_paths")
        merged["tag_catalog"] = (
            deepcopy(cast(list[object], compact_catalog))
            if isinstance(compact_catalog, list)
            else []
        )
        merged["trajectory_paths"] = (
            deepcopy(cast(list[object], compact_paths)) if isinstance(compact_paths, list) else []
        )
        compact_points = compact_projection.get("points")
        compact_point_rows = (
            cast(list[dict[str, Any]], compact_points) if isinstance(compact_points, list) else []
        )
        tag_ids_by_point_id = {
            point["id"]: deepcopy(point.get("tag_ids", []))
            for point in compact_point_rows
            if isinstance(point.get("id"), str)
        }
        full_points = merged.get("points")
        if isinstance(full_points, list):
            for point_raw in cast(list[object], full_points):
                if not isinstance(point_raw, dict):
                    continue
                point = cast(dict[str, Any], point_raw)
                point_id = point.get("id")
                if isinstance(point_id, str):
                    point["tag_ids"] = tag_ids_by_point_id.get(point_id, [])
        return merged

    async def get_projection(
        self,
        ctx: ViewContext,
        analysis_id: str,
        *,
        compact: bool = False,
        tag_by: str | None = None,
        include_rubric_tags: bool = False,
    ) -> dict[str, Any] | None:
        columns = [SQLAHodoscopeAnalysis.projection_json]
        if not compact:
            columns.append(SQLAHodoscopeAnalysis.artifact_json)
        result = await self.session.execute(
            select(*columns).where(
                SQLAHodoscopeAnalysis.collection_id == ctx.collection_id,
                SQLAHodoscopeAnalysis.id == analysis_id,
            )
        )
        row = result.one_or_none()
        if row is None or row[0] is None:
            return None
        projection = cast(dict[str, Any], row[0])
        if compact:
            compact_projection = build_hodoscope_projection_view(projection)
            return await self._enrich_projection_tags(
                compact_projection,
                collection_id=ctx.collection_id,
                tag_by=tag_by,
                include_rubric_tags=include_rubric_tags,
            )
        artifact = cast(dict[str, Any] | None, row[1])
        full_projection = expand_hodoscope_projection_view(projection, artifact)
        if not tag_by and not include_rubric_tags:
            return full_projection
        compact_projection = await self._enrich_projection_tags(
            build_hodoscope_projection_view(full_projection),
            collection_id=ctx.collection_id,
            tag_by=tag_by,
            include_rubric_tags=include_rubric_tags,
        )
        return self._merge_compact_annotations_into_full(full_projection, compact_projection)

    async def get_artifact(self, ctx: ViewContext, analysis_id: str) -> dict[str, Any] | None:
        result = await self.session.execute(
            select(SQLAHodoscopeAnalysis.artifact_json).where(
                SQLAHodoscopeAnalysis.collection_id == ctx.collection_id,
                SQLAHodoscopeAnalysis.id == analysis_id,
            )
        )
        return result.scalar_one_or_none()

    async def cancel_analysis(
        self, ctx: ViewContext, analysis_id: str
    ) -> HodoscopeAnalysisSummary | None:
        sq_analysis = await self.get_analysis(ctx, analysis_id)
        if sq_analysis is None:
            return None

        if sq_analysis.status in {"pending", "running"}:
            sq_analysis.status = "canceled"
            sq_analysis.completed_at = self._now()
            sq_analysis.updated_at = self._now()
            sq_analysis.error = "Canceled by user"
            config_json = dict(sq_analysis.config_json)
            config_json["_job_state"] = {"stage": "canceled", "progress": 0}
            sq_analysis.config_json = config_json
            await self.session.commit()
            if sq_analysis.job_id:
                await cancel_job(sq_analysis.job_id)

        await self.session.refresh(sq_analysis)
        return self._summary_from_sqla(sq_analysis)
