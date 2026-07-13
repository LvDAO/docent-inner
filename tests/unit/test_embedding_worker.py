from contextlib import asynccontextmanager

import anyio
import pytest

from docent_core.docent.db.contexts import ViewContext
from docent_core.docent.db.schemas.tables import SQLAJob
from docent_core.docent.workers import embedding_worker


class _FailedEmbeddingService:
    def __init__(self) -> None:
        self.index_called = False

    async def get_oldest_active_embedding_job(self, _collection_id: str):
        return None

    @asynccontextmanager
    async def advisory_lock(self, _collection_id: str, action_id: str):
        assert action_id == "compute_embeddings"
        yield

    async def compute_embeddings(self, _ctx: ViewContext, _progress_callback):
        return False

    async def compute_ivfflat_index(self, _ctx: ViewContext) -> None:
        self.index_called = True

    async def get_indexing_progress(self, _collection_id: str):
        return None, None

    async def set_job_status(self, *_args, **_kwargs) -> None:
        raise AssertionError("embedding worker must not own generic job status")


@pytest.mark.asyncio
async def test_failed_embedding_stops_index_polling_and_raises(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = _FailedEmbeddingService()
    published_actions: list[str] = []

    async def init_service():
        return service

    async def capture_update(_collection_id: str, message: dict) -> None:
        published_actions.append(message["action"])

    monkeypatch.setattr(embedding_worker.MonoService, "init", init_service)
    monkeypatch.setattr(embedding_worker, "publish_collection_update", capture_update)

    ctx = ViewContext(collection_id="collection", view_id="view", user=None, base_filter=None)
    job = SQLAJob(id="job", type="compute_embeddings", job_json={"should_index": True})

    with anyio.fail_after(0.5):
        with pytest.raises(BaseException) as exc_info:
            await embedding_worker.compute_embeddings(ctx, job)

    assert "Embedding generation produced no result" in repr(exc_info.value)
    assert service.index_called is False
    assert "embedding_complete" not in published_actions
