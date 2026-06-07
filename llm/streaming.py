from __future__ import annotations

from typing import Any


def coerce_chunk(value: Any) -> Any:
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json", exclude_none=True)
    if isinstance(value, dict):
        return {key: coerce_chunk(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [coerce_chunk(item) for item in value]
    return value


class StreamAccumulator:
    def __init__(self) -> None:
        self._text_parts: list[str] = []
        self._tool_calls: dict[int, dict[str, Any]] = {}
        self.usage: dict[str, Any] = {}
        self.finish_reason: str | None = None

    def ingest(self, chunk: Any) -> list[str]:
        payload = coerce_chunk(chunk)
        emitted: list[str] = []

        if payload.get("usage"):
            self.usage = payload["usage"]

        for choice in payload.get("choices", []):
            delta = choice.get("delta") or choice.get("message") or {}
            content = delta.get("content")
            if isinstance(content, str) and content:
                self._text_parts.append(content)
                emitted.append(content)

            for tool_call in delta.get("tool_calls", []) or []:
                index = int(tool_call.get("index", len(self._tool_calls)))
                buffer = self._tool_calls.setdefault(
                    index,
                    {"id": "", "type": "function", "function": {"name": "", "arguments": ""}},
                )
                if tool_call.get("id"):
                    buffer["id"] = tool_call["id"]
                function = tool_call.get("function") or {}
                if function.get("name"):
                    if buffer["function"]["name"] and buffer["function"]["name"] != function["name"]:
                        buffer["function"]["name"] += function["name"]
                    else:
                        buffer["function"]["name"] = function["name"]
                if function.get("arguments"):
                    buffer["function"]["arguments"] += function["arguments"]

            if choice.get("finish_reason"):
                self.finish_reason = choice["finish_reason"]

        return emitted

    def assistant_message(self) -> dict[str, Any]:
        message = {"role": "assistant", "content": "".join(self._text_parts)}
        if self._tool_calls:
            tool_calls = []
            for index in sorted(self._tool_calls):
                tool_call = self._tool_calls[index]
                tool_call["function"]["arguments"] = tool_call["function"]["arguments"] or "{}"
                tool_calls.append(tool_call)
            message["tool_calls"] = tool_calls
        return message
