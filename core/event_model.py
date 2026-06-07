from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, Field


class EventType(str, Enum):
    USER_MESSAGE = "user_message"
    LLM_TOKEN = "llm_token"
    LLM_START = "llm_start"
    LLM_END = "llm_end"
    TOOL_CALL_START = "tool_call_start"
    TOOL_CALL_END = "tool_call_end"
    MCP_REQUEST = "mcp_request"
    MCP_RESPONSE = "mcp_response"
    ERROR = "error"
    DEBUG = "debug"


class HermesEvent(BaseModel):
    event_id: str = Field(default_factory=lambda: str(uuid4()))
    event_type: EventType | str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    session_id: str
    sequence: int | None = None
    payload: dict[str, Any] = Field(default_factory=dict)

    def to_json(self) -> str:
        return self.model_dump_json()

    @property
    def event_name(self) -> str:
        if isinstance(self.event_type, EventType):
            return self.event_type.value
        return str(self.event_type)


def make_event(
    event_type: EventType | str,
    session_id: str,
    payload: dict[str, Any] | None = None,
) -> HermesEvent:
    return HermesEvent(event_type=event_type, session_id=session_id, payload=payload or {})