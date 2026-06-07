from __future__ import annotations

from collections import defaultdict
from dataclasses import asdict, dataclass
from typing import Any

from core.event_model import EventType, HermesEvent


@dataclass
class SessionTelemetry:
    llm_calls: int = 0
    tool_calls: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    llm_latency_ms: float = 0.0
    tool_latency_ms: float = 0.0
    error_count: int = 0

    def summary(self) -> dict[str, Any]:
        payload = asdict(self)
        payload["avg_llm_latency_ms"] = self.llm_latency_ms / self.llm_calls if self.llm_calls else 0.0
        payload["avg_tool_latency_ms"] = self.tool_latency_ms / self.tool_calls if self.tool_calls else 0.0
        return payload


class TelemetryService:
    def __init__(self) -> None:
        self._metrics: dict[str, SessionTelemetry] = defaultdict(SessionTelemetry)

    async def handle_event(self, event: HermesEvent) -> None:
        metrics = self._metrics[event.session_id]

        if event.event_type == EventType.LLM_END:
            usage = event.payload.get("usage", {})
            metrics.llm_calls += 1
            metrics.prompt_tokens += int(usage.get("prompt_tokens", 0) or 0)
            metrics.completion_tokens += int(usage.get("completion_tokens", 0) or 0)
            metrics.total_tokens += int(usage.get("total_tokens", 0) or 0)
            metrics.llm_latency_ms += float(event.payload.get("latency_ms", 0) or 0)

        elif event.event_type == EventType.TOOL_CALL_END:
            metrics.tool_calls += 1
            metrics.tool_latency_ms += float(event.payload.get("latency_ms", 0) or 0)
            if event.payload.get("is_error"):
                metrics.error_count += 1

        elif event.event_type == EventType.ERROR:
            metrics.error_count += 1

    def snapshot(self, session_id: str | None = None) -> dict[str, Any]:
        if session_id:
            return self._metrics[session_id].summary()
        return {key: value.summary() for key, value in self._metrics.items()}
