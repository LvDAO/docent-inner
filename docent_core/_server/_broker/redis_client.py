import json
from typing import Any

import anyio
from arq import ArqRedis, create_pool
from fastapi.encoders import jsonable_encoder

from docent._log_util import get_logger
from docent_core._redis_config import get_redis_settings
from docent_core._worker.constants import WORKER_QUEUE_NAME
from docent_core.docent.db.contexts import ViewContext

logger = get_logger(__name__)


_redis_client: ArqRedis | None = None
_redis_lock = anyio.Lock()

STREAM_KEY_FORMAT = "stream_{job_id}"
STATE_KEY_FORMAT = "state_{job_id}"


async def get_redis_client() -> ArqRedis:
    global _redis_client

    async with _redis_lock:
        if _redis_client is None:
            redis_settings = get_redis_settings()
            _redis_client = await create_pool(redis_settings)

            protocol = "rediss" if redis_settings.ssl else "redis"
            logger.info(
                "Checking Redis connection to %s://%s:%s",
                protocol,
                redis_settings.host,
                redis_settings.port,
            )
            await verify_redis_connection(_redis_client)

        return _redis_client


async def verify_redis_connection(redis_client: ArqRedis) -> None:
    """
    Verify that the Redis connection is working by attempting to ping the server.

    Args:
        redis_client: The Redis client to test

    Raises:
        ConnectionError: If unable to connect to Redis
    """
    try:
        result = await redis_client.ping()  # type: ignore
        if result:
            logger.info("Successfully pinged Redis")
        else:
            raise ConnectionError("Redis ping returned False")
    except Exception as e:
        logger.error(f"Failed to connect to Redis: {e}")
        raise ConnectionError(f"Unable to connect to Redis: {e}") from e


async def publish_to_broker(collection_id: str | None, data: dict[str, Any]):
    """Publish a message to the broker for a specific collection.

    Args:
        collection_id: The ID of the collection to publish to
        data: The data to publish (will be converted to JSON)
    """
    redis_client = await get_redis_client()

    channel = f"collection:{collection_id}" if collection_id is not None else "general:general"
    logger.debug("Publishing to channel %s", channel)
    await redis_client.publish(channel, json.dumps(jsonable_encoder(data)))  # type: ignore


async def publish_collection_update(collection_id: str, payload: dict[str, Any]):
    """Publish a collection-wide update that all clients viewing this collection should receive.

    Use this for global changes like:
    - Adding/removing agent runs
    - Modifying collection metadata
    - Updating dimensions
    - Global filter changes

    Args:
        collection_id: The collection ID
        payload: The data to publish (will be converted to JSON)
    """
    redis_client = await get_redis_client()
    channel = f"collection:{collection_id}"
    await redis_client.publish(channel, json.dumps(jsonable_encoder(payload)))  # type: ignore


async def publish_view_update(collection_id: str, view_id: str, payload: dict[str, Any]):
    """Publish a view-specific update that only clients viewing this specific view should receive.

    Use this for view-local changes like:
    - View-specific filter updates
    - View title/description changes
    - View-scoped UI state

    Args:
        collection_id: The collection ID
        view_id: The view ID
        payload: The data to publish (will be converted to JSON)
    """
    redis_client = await get_redis_client()
    channel = f"collection:{collection_id}:view:{view_id}"
    await redis_client.publish(channel, json.dumps(jsonable_encoder(payload)))  # type: ignore


async def _enqueue_job(queue_name: str, func_name: str, *args: Any, **kwargs: Any) -> None:
    redis_client = await get_redis_client()
    j = await redis_client.enqueue_job(func_name, *args, _queue_name=queue_name, **kwargs)
    logger.debug("Enqueued job %s to %s with function %s", j, queue_name, func_name)


async def enqueue_job(view_ctx: ViewContext, job_id: str) -> None:
    """Enqueue a job to the worker."""
    await _enqueue_job(WORKER_QUEUE_NAME, "run_job", view_ctx, job_id)


async def cancel_job(job_id: str) -> None:
    """Cancel a job and wait for confirmation that the cancellation was processed."""
    redis_client = await get_redis_client()
    # Queue names
    command_queue = f"commands_{job_id}"
    response_queue = f"cancel_response_{job_id}"

    # Send the cancel command with the response ID
    await redis_client.rpush(command_queue, "cancel")  # type: ignore

    # Wait for confirmation from the worker
    try:
        # Wait up to T seconds for cancellation confirmation
        result = await redis_client.blpop(response_queue, timeout=10)  # type: ignore
        if result is None:
            raise TimeoutError(f"Timeout waiting for cancellation confirmation for job {job_id}")

        _queue_name, response = result  # type: ignore
        logger.info(f"Received cancellation confirmation for job {job_id}: {response}")

    except Exception as e:
        logger.error(f"Error waiting for cancellation confirmation for job {job_id}: {e}")

    finally:
        await redis_client.delete(response_queue)  # type: ignore
