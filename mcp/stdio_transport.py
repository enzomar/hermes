from __future__ import annotations

import asyncio
import os
from contextlib import AsyncExitStack
from typing import Any

from mcp.client.session import ClientSession
from mcp.client.stdio import StdioServerParameters, stdio_client


def _coerce(value: Any) -> Any:
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json", exclude_none=True)
    if isinstance(value, dict):
        return {key: _coerce(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_coerce(item) for item in value]
    return value


class StdioTransport:
    def __init__(
        self,
        command: str,
        args: list[str] | None = None,
        env: dict[str, str] | None = None,
        cwd: str | None = None,
        timeout_seconds: float = 30.0,
    ) -> None:
        self.command = command
        self.args = args or []
        self.env = env or {}
        self.cwd = cwd
        self.timeout_seconds = timeout_seconds
        self._stack = AsyncExitStack()
        self.session: ClientSession | None = None
        self.server_info: dict[str, Any] = {}

    async def connect(self) -> dict[str, Any]:
        params_kwargs = {
            "command": self.command,
            "args": self.args,
            "env": {**os.environ, **self.env},
        }
        if self.cwd:
            params_kwargs["cwd"] = self.cwd

        try:
            server_params = StdioServerParameters(**params_kwargs)
        except TypeError:
            params_kwargs.pop("cwd", None)
            server_params = StdioServerParameters(**params_kwargs)

        read_stream, write_stream = await self._stack.enter_async_context(stdio_client(server_params))
        self.session = await self._stack.enter_async_context(ClientSession(read_stream, write_stream))
        initialize_result = await asyncio.wait_for(self.session.initialize(), timeout=self.timeout_seconds)
        self.server_info = _coerce(initialize_result)
        return self.server_info

    async def list_tools(self) -> list[dict[str, Any]]:
        if self.session is None:
            raise RuntimeError("STDIO MCP session is not connected")
        response = await asyncio.wait_for(self.session.list_tools(), timeout=self.timeout_seconds)
        payload = _coerce(response)
        return payload.get("tools", [])

    async def call_tool(self, tool_name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        if self.session is None:
            raise RuntimeError("STDIO MCP session is not connected")
        response = await asyncio.wait_for(
            self.session.call_tool(tool_name, arguments=arguments),
            timeout=self.timeout_seconds,
        )
        return _coerce(response)

    async def close(self) -> None:
        await self._stack.aclose()
