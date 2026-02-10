"""In-memory SSE broker: broadcasts new articles to all connected clients."""

import asyncio
import logging

logger = logging.getLogger(__name__)

CLIENT_QUEUE_MAXSIZE = 64


class SSEBroker:
    """asyncio.Queue-based Pub/Sub broker."""

    def __init__(self) -> None:
        self._queues: set[asyncio.Queue[dict]] = set()

    def subscribe(self) -> asyncio.Queue[dict]:
        """Create and return a new client queue."""
        queue: asyncio.Queue[dict] = asyncio.Queue(maxsize=CLIENT_QUEUE_MAXSIZE)
        self._queues.add(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue[dict]) -> None:
        """Remove a client queue on disconnect."""
        self._queues.discard(queue)

    async def broadcast(self, event: dict) -> None:
        """Send event to all connected clients. Drop if queue is full."""
        for queue in list(self._queues):
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                logger.warning("SSE client queue full, dropping event")

    @property
    def client_count(self) -> int:
        return len(self._queues)


article_broker = SSEBroker()
