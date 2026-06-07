from __future__ import annotations

import asyncio
import inspect
from collections.abc import AsyncIterator, Awaitable, Callable
from typing import Any

from core.event_model import EventType, HermesEvent, make_event
from replay.event_store import EventStore

Subscriber = Callable[[HermesEvent], Awaitable[None] | None]


class EventBus:
    def __init__(self, store: EventStore):
        self.store = store
        self._subscribers: list[Subscriber] = []
        self._queues: set[asyncio.Queue[HermesEvent]] = set()
        self._lock = asyncio.Lock()

    def subscribe(self, subscriber: Subscriber) -> Callable[[], None]:
        self._subscribers.append(subscriber)

        def unsubscribe() -> None:
            if subscriber in self._subscribers:
                self._subscribers.remove(subscriber)

        return unsubscribe

    async def publish(
        self,
        event_type: EventType | str,
        session_id: str,
        payload: dict[str, Any] | None = None,
    ) -> HermesEvent:
        return await self.publish_event(make_event(event_type, session_id, payload))

    async def publish_event(self, event: HermesEvent) -> HermesEvent:
        async with self._lock:
            stored = await asyncio.to_thread(self.store.append, event)
            self._fan_out(stored)
            await self._notify_subscribers(stored)
            return stored

    def stream(self, maxsize: int = 256) -> AsyncIterator[HermesEvent]:
        queue: asyncio.Queue[HermesEvent] = asyncio.Queue(maxsize=maxsize)
        self._queues.add(queue)

        async def iterator() -> AsyncIterator[HermesEvent]:
            try:
                while True:
                    yield await queue.get()
            finally:
                self._queues.discard(queue)

        return iterator()

    def _fan_out(self, event: HermesEvent) -> None:
        for queue in list(self._queues):
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                _ = queue.get_nowait()
                queue.put_nowait(event)

    async def _notify_subscribers(self, event: HermesEvent) -> None:
        tasks: list[asyncio.Task[None]] = []
        for subscriber in list(self._subscribers):
            outcome = subscriber(event)
            if inspect.isawaitable(outcome):
                tasks.append(asyncio.create_task(outcome))
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
