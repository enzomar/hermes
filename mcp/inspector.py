from __future__ import annotations

from collections import deque
from typing import Any

from core.event_model import EventType, HermesEvent


class MCPInspector:
    def __init__(self, max_entries: int = 1000) -> None:
        self._entries: deque[dict[str, Any]] = deque(maxlen=max_entries)

    async def handle_event(self, event: HermesEvent) -> None:
        if event.event_type not in {
            EventType.MCP_REQUEST,
            EventType.MCP_RESPONSE,
            EventType.TOOL_CALL_END,
            EventType.ERROR,
        }:
            return

        self._entries.append(
            {
                "event_id": event.event_id,
                "event_type": event.event_name,
                "timestamp": event.timestamp.isoformat(),
                "session_id": event.session_id,
                **event.payload,
            }
        )

    def snapshot(self, session_id: str | None = None, limit: int = 200) -> list[dict[str, Any]]:
        entries = list(self._entries)
        if session_id:
            entries = [entry for entry in entries if entry["session_id"] == session_id]
        return entries[-limit:]

    def replay_payload(self, event_id: str) -> dict[str, Any] | None:
        for entry in reversed(self._entries):
            if entry["event_id"] == event_id and entry["event_type"] == EventType.TOOL_CALL_END.value:
                return entry
        return None
