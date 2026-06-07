"""Base protocol and types for LLM provider adapters."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol

from config import LLMConfig
from core.event_bus import EventBus


@dataclass
class CompletionResult:
    """Standardized output from any provider adapter."""

    assistant_message: dict[str, Any]  # {role, content, tool_calls}
    usage: dict[str, int] = field(default_factory=lambda: {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0})
    latency_ms: float = 0.0
    finish_reason: str = "stop"


class ProviderAdapter(Protocol):
    """Interface that all LLM provider adapters must satisfy."""

    async def complete(
        self,
        messages: list[dict[str, Any]],
        config: LLMConfig,
        *,
        tools: list[dict[str, Any]] | None = None,
        session_id: str = "",
        call_id: str = "",
        bus: EventBus | None = None,
    ) -> CompletionResult:
        """Send messages and return a completion result."""
        ...

    async def test_connection(self, config: LLMConfig) -> dict[str, Any]:
        """Validate connectivity. Returns {model, provider, latency_ms, message}."""
        ...
