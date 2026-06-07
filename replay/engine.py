from __future__ import annotations

import asyncio
from typing import Any

from core.event_bus import EventBus
from core.event_model import EventType, HermesEvent, make_event
from core.session_store import SessionStore
from replay.event_store import EventStore


class ReplayEngine:
    def __init__(self, event_store: EventStore, session_store: SessionStore, event_bus: EventBus):
        self.event_store = event_store
        self.session_store = session_store
        self.event_bus = event_bus

    async def list_events(self, session_id: str) -> list[HermesEvent]:
        return await asyncio.to_thread(self.event_store.list_events, session_id)

    async def step_events(self, session_id: str, cursor: int = 0, step: int = 1) -> dict[str, Any]:
        events = await self.list_events(session_id)
        next_cursor = min(cursor + step, len(events))
        return {
            "events": [event.model_dump(mode="json") for event in events[cursor:next_cursor]],
            "cursor": next_cursor,
            "done": next_cursor >= len(events),
            "total": len(events),
        }

    async def branch_session(
        self,
        source_session_id: str,
        from_event_id: str,
        title: str | None = None,
    ) -> dict[str, Any]:
        branch = await self.session_store.create_session(
            title=title or f"Branch of {source_session_id}",
            parent_session_id=source_session_id,
            resume_from_event_id=from_event_id,
            metadata={"branch": True, "source_event_id": from_event_id},
        )
        source_events = await asyncio.to_thread(
            self.event_store.list_events,
            source_session_id,
            from_event_id,
        )
        for source_event in source_events:
            cloned = make_event(
                source_event.event_type,
                branch["session_id"],
                {
                    **source_event.payload,
                    "_replayed_from_event_id": source_event.event_id,
                    "_replayed_from_session_id": source_session_id,
                },
            )
            await asyncio.to_thread(self.event_store.append, cloned)

        await self.event_bus.publish(
            EventType.DEBUG,
            branch["session_id"],
            {
                "message": "Branch session created",
                "source_session_id": source_session_id,
                "from_event_id": from_event_id,
            },
        )
        return branch

    async def duplicate_session(
        self,
        source_session_id: str,
        title: str | None = None,
    ) -> dict[str, Any]:
        duplicate = await self.clone_session(
            source_session_id,
            title=title or f"Copy of {source_session_id}",
            parent_session_id=source_session_id,
            metadata={"duplicate": True, "source_session_id": source_session_id},
        )
        return duplicate

    async def clone_session(
        self,
        source_session_id: str,
        title: str,
        parent_session_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        duplicate = await self.session_store.create_session(
            title=title,
            parent_session_id=parent_session_id,
            metadata=metadata or {},
        )
        source_events = await asyncio.to_thread(self.event_store.list_events, source_session_id)
        for source_event in source_events:
            cloned = make_event(
                source_event.event_type,
                duplicate["session_id"],
                {
                    **source_event.payload,
                    "_duplicated_from_event_id": source_event.event_id,
                    "_duplicated_from_session_id": source_session_id,
                },
            )
            await asyncio.to_thread(self.event_store.append, cloned)
        return duplicate
