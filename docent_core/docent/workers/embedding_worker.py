import asyncio

import anyio

from docent._log_util import get_logger
from docent_core._server._broker.redis_client import publish_collection_update
from docent_core.docent.db.contexts import ViewContext
from docent_core.docent.db.schemas.tables import SQLAJob
from docent_core.docent.services.monoservice import MonoService

logger = get_logger(__name__)


async def compute_embeddings(ctx: ViewContext, job: SQLAJob):
    logger.info(f"Starting compute_embeddings: ctx={ctx}, job_id={job.id}")

    mono_svc = await MonoService.init()

    # Wait for any running embedding jobs
    while (
        res := await mono_svc.get_oldest_active_embedding_job(ctx.collection_id)
    ) is not None and res.id != job.id:
        logger.info(
            f"Job {job.id} waiting for existing embedding job to complete for collection_id {ctx.collection_id}"
        )
        await asyncio.sleep(5)

    should_index = job.job_json["should_index"]

    # Track completion states
    embedding_completed = False
    indexing_completed = False

    async def _progress_callback(progress: int):
        """Callback for embedding computation progress"""
        progress_data = {
            "indexing_phase": "pending" if should_index else "not_required",
            "embedding_progress": progress,
            "indexing_progress": 0,
        }

        # Send via websocket instead of Redis stream
        await publish_collection_update(
            ctx.collection_id,
            {"action": "embedding_progress", "payload": progress_data},
        )

    async def _poll_indexing_status():
        nonlocal embedding_completed, indexing_completed

        """Poll and report indexing progress after embeddings complete"""
        # Wait for embeddings to complete before starting to poll
        while not embedding_completed:
            await asyncio.sleep(1)

        # Now start polling for indexing progress
        while not indexing_completed:
            await asyncio.sleep(1)

            phase, percent = await mono_svc.get_indexing_progress(ctx.collection_id)
            if phase is None:
                continue

            progress_data = {
                "indexing_phase": phase,
                "embedding_progress": 100,
                "indexing_progress": percent or 0,
            }

            # Send via websocket instead of Redis stream
            await publish_collection_update(
                ctx.collection_id,
                {"action": "embedding_progress", "payload": progress_data},
            )

            # If indexing is complete (100%), we can stop polling
            if percent is not None and percent >= 100:
                indexing_completed = True
                break

    async def _run():
        """Main embedding computation logic"""
        nonlocal embedding_completed, indexing_completed

        async with mono_svc.advisory_lock(ctx.collection_id, action_id="compute_embeddings"):
            embedding_status = await mono_svc.compute_embeddings(ctx, _progress_callback)
            if not embedding_status:
                raise RuntimeError("Embedding generation produced no result")

            embedding_completed = True
            logger.info(f"Embeddings computation completed for job {job.id}")

            if not should_index:
                indexing_completed = True
                return

            await publish_collection_update(
                ctx.collection_id,
                {
                    "action": "embedding_progress",
                    "payload": {
                        "indexing_phase": "starting",
                        "embedding_progress": 100,
                        "indexing_progress": 0,
                    },
                },
            )

            await mono_svc.compute_ivfflat_index(ctx)
            indexing_completed = True
            logger.info(f"Indexing completed for job {job.id}")

    async with anyio.create_task_group() as tg:
        tg.start_soon(_run)
        if should_index:
            tg.start_soon(_poll_indexing_status)

    await publish_collection_update(
        ctx.collection_id,
        {"action": "embedding_complete", "payload": {}},
    )
