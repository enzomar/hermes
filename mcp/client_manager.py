from __future__ import annotations

from dataclasses import dataclass
import importlib
from time import perf_counter
from typing import Any
from uuid import uuid4

from config import MCPServerConfig
from core.event_bus import EventBus
from core.event_model import EventType
from mcp.inspector import MCPInspector
from mcp.sse_transport import SSETransport
from mcp.stdio_transport import StdioTransport
from mcp.tool_router import ToolRouter


def _normalize_tool(server_name: str, tool: Any) -> dict[str, Any]:
    tool_name = tool.get("name") or tool.get("toolName")
    description = tool.get("description") or ""
    input_schema = tool.get("inputSchema") or {"type": "object", "properties": {}}
    display_name = tool.get("title") or tool_name

    try:
        metadata_utils = importlib.import_module("mcp.shared.metadata_utils")
        display_name = metadata_utils.get_display_name(tool)
    except Exception:
        pass

    return {
        "server_name": server_name,
        "tool_name": tool_name,
        "display_name": display_name,
        "description": description,
        "input_schema": input_schema,
        "raw": tool,
    }


def _extract_text(result: dict[str, Any]) -> str:
    parts: list[str] = []
    for content in result.get("content", []):
        if isinstance(content, dict) and content.get("type") == "text":
            parts.append(str(content.get("text", "")))
    if parts:
        return "\n".join(part for part in parts if part)
    structured = result.get("structuredContent")
    if structured is not None:
        return str(structured)
    return str(result)


@dataclass
class ManagedServer:
    name: str
    transport_name: str
    client: Any
    connected: bool = False
    error: str | None = None
    server_info: dict[str, Any] | None = None


class MCPClientManager:
    def __init__(
        self,
        server_configs: dict[str, MCPServerConfig],
        bus: EventBus,
        router: ToolRouter,
        inspector: MCPInspector | None = None,
    ) -> None:
        self.server_configs = server_configs
        self.bus = bus
        self.router = router
        self.inspector = inspector
        self._servers: dict[str, ManagedServer] = {}
        self._server_tools: dict[str, list[dict[str, Any]]] = {}

    async def connect_all(self, session_id: str = "system") -> None:
        for server_name, config in self.server_configs.items():
            if not config.enabled:
                continue
            try:
                await self.connect_server(server_name, config, session_id=session_id)
            except Exception as exc:
                await self.bus.publish(
                    EventType.ERROR,
                    session_id,
                    {"source": "mcp.connect", "server_name": server_name, "message": str(exc)},
                )
        await self.refresh_tools(session_id=session_id)

    async def connect_server(self, server_name: str, config: MCPServerConfig, session_id: str = "system") -> None:
        await self.disconnect_server(server_name)

        await self.bus.publish(
            EventType.DEBUG,
            session_id,
            {"message": "mcp-connect-start", "server_name": server_name, "transport": config.transport},
        )

        if config.transport == "stdio":
            if not config.command:
                raise ValueError(f"STDIO server '{server_name}' requires a command")
            client = StdioTransport(
                command=config.command,
                args=config.args,
                env=config.env,
                cwd=config.cwd,
                timeout_seconds=config.timeout_seconds,
            )
        else:
            if not config.url:
                raise ValueError(f"SSE server '{server_name}' requires a url")
            client = SSETransport(
                url=config.url,
                headers=config.headers,
                timeout_seconds=config.timeout_seconds,
            )

        managed = ManagedServer(name=server_name, transport_name=config.transport, client=client)
        self._servers[server_name] = managed

        try:
            managed.server_info = await client.connect()
            managed.connected = True
            managed.error = None
            await self.bus.publish(
                EventType.DEBUG,
                session_id,
                {
                    "message": "mcp-connect-complete",
                    "server_name": server_name,
                    "transport": config.transport,
                    "server_info": managed.server_info,
                },
            )
        except Exception as exc:
            managed.connected = False
            managed.error = str(exc)
            await self.bus.publish(
                EventType.ERROR,
                session_id,
                {"source": "mcp.connect", "server_name": server_name, "message": str(exc)},
            )

    async def refresh_tools(self, session_id: str = "system") -> list[dict[str, Any]]:
        server_tools: dict[str, list[dict[str, Any]]] = {}

        for server_name, managed in self._servers.items():
            if not managed.connected:
                continue

            request_id = str(uuid4())
            request_json = {"jsonrpc": "2.0", "id": request_id, "method": "tools/list", "params": {}}
            await self.bus.publish(
                EventType.MCP_REQUEST,
                session_id,
                {"request_id": request_id, "server_name": server_name, "request_json": request_json},
            )

            started = perf_counter()
            try:
                tools = await managed.client.list_tools()
                latency_ms = (perf_counter() - started) * 1000
                server_tools[server_name] = [_normalize_tool(server_name, tool) for tool in tools]
                await self.bus.publish(
                    EventType.MCP_RESPONSE,
                    session_id,
                    {
                        "request_id": request_id,
                        "server_name": server_name,
                        "response_json": {"jsonrpc": "2.0", "id": request_id, "result": {"tools": tools}},
                        "latency_ms": latency_ms,
                        "is_error": False,
                    },
                )
            except Exception as exc:
                managed.error = str(exc)
                await self.bus.publish(
                    EventType.MCP_RESPONSE,
                    session_id,
                    {
                        "request_id": request_id,
                        "server_name": server_name,
                        "response_json": {
                            "jsonrpc": "2.0",
                            "id": request_id,
                            "error": {"message": str(exc)},
                        },
                        "latency_ms": (perf_counter() - started) * 1000,
                        "is_error": True,
                    },
                )
                await self.bus.publish(
                    EventType.ERROR,
                    session_id,
                    {"source": "mcp.tools.list", "server_name": server_name, "message": str(exc)},
                )
                server_tools[server_name] = []

        self._server_tools = server_tools
        routed = self.router.rebuild(server_tools)
        await self.bus.publish(
            EventType.DEBUG,
            session_id,
            {"message": "mcp-tools-refreshed", "tool_count": len(routed)},
        )
        return routed

    async def disconnect_server(self, server_name: str) -> None:
        managed = self._servers.pop(server_name, None)
        self._server_tools.pop(server_name, None)
        self.router.rebuild(self._server_tools)

        if managed is None:
            return

        try:
            await managed.client.close()
        except Exception:
            pass

    async def call_tool(
        self,
        session_id: str,
        tool_name: str,
        arguments: dict[str, Any],
        preferred_server: str | None = None,
        tool_call_id: str | None = None,
    ) -> dict[str, Any]:
        binding = self.router.resolve(tool_name, preferred_server=preferred_server)
        if binding is None:
            message = f"No MCP server provides tool '{tool_name}'"
            await self.bus.publish(EventType.ERROR, session_id, {"source": "mcp.router", "message": message})
            raise KeyError(message)

        server_name = binding["server_name"]
        managed = self._servers[server_name]
        request_id = str(uuid4())
        request_json = {
            "jsonrpc": "2.0",
            "id": request_id,
            "method": "tools/call",
            "params": {"name": binding["tool_name"], "arguments": arguments},
        }

        await self.bus.publish(
            EventType.TOOL_CALL_START,
            session_id,
            {
                "request_id": request_id,
                "server_name": server_name,
                "tool_name": binding["tool_name"],
                "qualified_name": binding["qualified_name"],
                "arguments": arguments,
            },
        )
        await self.bus.publish(
            EventType.MCP_REQUEST,
            session_id,
            {"request_id": request_id, "server_name": server_name, "request_json": request_json},
        )

        started = perf_counter()
        try:
            response_json = await managed.client.call_tool(binding["tool_name"], arguments)
            latency_ms = (perf_counter() - started) * 1000
            is_error = bool(response_json.get("isError"))
            await self.bus.publish(
                EventType.MCP_RESPONSE,
                session_id,
                {
                    "request_id": request_id,
                    "server_name": server_name,
                    "response_json": {"jsonrpc": "2.0", "id": request_id, "result": response_json},
                    "latency_ms": latency_ms,
                    "is_error": is_error,
                },
            )

            result = {
                "request_id": request_id,
                "server_name": server_name,
                "tool_name": binding["tool_name"],
                "qualified_name": binding["qualified_name"],
                "display_name": binding["display_name"],
                "arguments": arguments,
                "request_json": request_json,
                "response_json": {"jsonrpc": "2.0", "id": request_id, "result": response_json},
                "latency_ms": latency_ms,
                "is_error": is_error,
                "text": _extract_text(response_json),
                "structured_content": response_json.get("structuredContent"),
                "tool_message": {
                    "role": "tool",
                    "tool_call_id": tool_call_id or binding["qualified_name"],
                    "name": binding["qualified_name"],
                    "content": _extract_text(response_json),
                },
            }
            await self.bus.publish(EventType.TOOL_CALL_END, session_id, result)
            return result
        except Exception as exc:
            latency_ms = (perf_counter() - started) * 1000
            error_json = {
                "jsonrpc": "2.0",
                "id": request_id,
                "error": {"message": str(exc)},
            }
            await self.bus.publish(
                EventType.MCP_RESPONSE,
                session_id,
                {
                    "request_id": request_id,
                    "server_name": server_name,
                    "response_json": error_json,
                    "latency_ms": latency_ms,
                    "is_error": True,
                },
            )
            await self.bus.publish(
                EventType.ERROR,
                session_id,
                {
                    "source": "mcp.tools.call",
                    "server_name": server_name,
                    "tool_name": binding["tool_name"],
                    "message": str(exc),
                },
            )
            failure = {
                "request_id": request_id,
                "server_name": server_name,
                "tool_name": binding["tool_name"],
                "qualified_name": binding["qualified_name"],
                "display_name": binding["display_name"],
                "arguments": arguments,
                "request_json": request_json,
                "response_json": error_json,
                "latency_ms": latency_ms,
                "is_error": True,
                "text": str(exc),
                "structured_content": None,
                "tool_message": {
                    "role": "tool",
                    "tool_call_id": tool_call_id or binding["qualified_name"],
                    "name": binding["qualified_name"],
                    "content": str(exc),
                },
            }
            await self.bus.publish(EventType.TOOL_CALL_END, session_id, failure)
            return failure

    def list_tools(self) -> list[dict[str, Any]]:
        return self.router.list_tools()

    def list_tools_for_llm(self) -> list[dict[str, Any]]:
        return [
            {
                "type": "function",
                "function": {
                    "name": tool["qualified_name"],
                    "description": tool["description"],
                    "parameters": tool["input_schema"],
                },
            }
            for tool in self.router.list_tools()
        ]

    def server_status(self) -> list[dict[str, Any]]:
        tool_counts = {name: len(tools) for name, tools in self._server_tools.items()}
        return [
            {
                "name": managed.name,
                "transport": managed.transport_name,
                "connected": managed.connected,
                "error": managed.error,
                "tool_count": tool_counts.get(name, 0),
                "server_info": managed.server_info or {},
            }
            for name, managed in sorted(self._servers.items())
        ]

    async def close(self) -> None:
        for managed in self._servers.values():
            try:
                await managed.client.close()
            except Exception:
                pass