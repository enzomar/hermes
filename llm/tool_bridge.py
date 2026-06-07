from __future__ import annotations

import asyncio
import json
from typing import Any

from core.event_model import EventType, HermesEvent
from mcp.client_manager import MCPClientManager
from replay.event_store import EventStore


def _safe_load_json(raw_arguments: str | dict[str, Any] | None) -> dict[str, Any]:
    if raw_arguments is None:
        return {}
    if isinstance(raw_arguments, dict):
        return raw_arguments
    try:
        return json.loads(raw_arguments)
    except json.JSONDecodeError:
        return {"input": raw_arguments}


def _build_user_content(payload: dict[str, Any]) -> str:
    content = str(payload.get("content") or "").strip()
    attachments = payload.get("attachments") or []
    if not attachments:
        return content

    rendered_attachments: list[str] = []
    for attachment in attachments:
        if not isinstance(attachment, dict):
            continue
        name = str(attachment.get("name") or "attachment")
        mime_type = str(attachment.get("mime_type") or attachment.get("mimeType") or "text/plain")
        size_bytes = int(attachment.get("size_bytes") or attachment.get("size") or 0)
        truncated = bool(attachment.get("truncated"))
        attachment_content = str(attachment.get("content") or "").strip()
        lines = [
            f"Attachment: {name}",
            f"Type: {mime_type}",
            f"Size: {size_bytes} bytes",
        ]
        if truncated:
            lines.append("Note: attachment content was truncated before sending.")
        if attachment_content:
            lines.extend(["", attachment_content])
        rendered_attachments.append("\n".join(lines))

    attachment_block = "Attached context:\n\n" + "\n\n---\n\n".join(rendered_attachments)
    return "\n\n".join(part for part in [content, attachment_block] if part).strip()


def build_messages_from_events(events: list[HermesEvent], system_prompt: str) -> list[dict[str, Any]]:
    messages: list[dict[str, Any]] = [{"role": "system", "content": system_prompt}]
    for event in events:
        if event.event_type == EventType.USER_MESSAGE:
            messages.append({"role": "user", "content": _build_user_content(event.payload)})
        elif event.event_type == EventType.LLM_END:
            assistant_message = event.payload.get("assistant_message")
            if assistant_message:
                messages.append(assistant_message)
        elif event.event_type == EventType.TOOL_CALL_END:
            tool_message = event.payload.get("tool_message")
            if tool_message:
                messages.append(tool_message)
    return messages


class ToolBridge:
    def __init__(self, store: EventStore, mcp_manager: MCPClientManager) -> None:
        self.store = store
        self.mcp_manager = mcp_manager

    async def build_messages(self, session_id: str, system_prompt: str) -> list[dict[str, Any]]:
        events = await asyncio.to_thread(self.store.list_events, session_id)
        return build_messages_from_events(events, system_prompt)

    def llm_tools(self) -> list[dict[str, Any]]:
        return self.mcp_manager.list_tools_for_llm()

    async def execute_tool_calls(self, session_id: str, assistant_message: dict[str, Any]) -> list[dict[str, Any]]:
        tool_messages: list[dict[str, Any]] = []

        for tool_call in assistant_message.get("tool_calls", []):
            function = tool_call.get("function") or {}
            tool_name = function.get("name", "")
            arguments = _safe_load_json(function.get("arguments"))
            result = await self.mcp_manager.call_tool(
                session_id,
                tool_name,
                arguments,
                tool_call_id=tool_call.get("id") or tool_name,
            )
            tool_messages.append(result["tool_message"])

        return tool_messages
