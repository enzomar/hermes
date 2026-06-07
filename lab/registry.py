"""MCPVersionRegistry — versioned MCP server registrations and tool description variants."""

from __future__ import annotations

import asyncio
from typing import Any
from uuid import uuid4

from config import MCPServerConfig
from lab.models import MCPVersionRegistration, ToolDescriptionVariant
from lab.store import LabStore
from mcp.client_manager import MCPClientManager


class MCPVersionRegistry:
    def __init__(self, lab_store: LabStore, mcp_manager: MCPClientManager) -> None:
        self._store = lab_store
        self._mcp_manager = mcp_manager

    async def register(
        self,
        name: str,
        version_tag: str,
        transport: str,
        connection_config: dict[str, Any],
    ) -> MCPVersionRegistration:
        # Validate required fields per transport
        if transport == "stdio":
            if not connection_config.get("command"):
                raise ValueError("STDIO transport requires 'command' in connection_config")
        elif transport == "sse":
            if not connection_config.get("url"):
                raise ValueError("SSE transport requires 'url' in connection_config")
        elif transport == "mock":
            # Mock transport: schema_snapshot comes from fixture entries; allow empty connection_config
            pass
        else:
            raise ValueError(f"Unsupported transport type: {transport!r}")

        # Validate uniqueness
        existing = await asyncio.to_thread(self._store.list_mcp_versions)
        for ev in existing:
            if ev["name"] == name and ev["version_tag"] == version_tag:
                raise ValueError(
                    f"MCP version ({name!r}, {version_tag!r}) already registered. "
                    "Modifications require a new version_tag."
                )

        # Discover schema snapshot (skip for mock transport)
        schema_snapshot: dict[str, Any] = {}
        if transport != "mock":
            schema_snapshot = await self._discover_schema(name, transport, connection_config)

        reg = MCPVersionRegistration(
            mcp_version_id=str(uuid4()),
            name=name,
            version_tag=version_tag,
            transport=transport,  # type: ignore[arg-type]
            connection_config=connection_config,
            schema_snapshot=schema_snapshot,
        )
        await asyncio.to_thread(self._store.register_mcp_version, reg)
        return reg

    async def register_tool_variant(
        self,
        mcp_version_id: str,
        tool_name: str,
        description: str,
        input_schema: dict[str, Any] | None = None,
    ) -> ToolDescriptionVariant:
        mcp_version = await asyncio.to_thread(self._store.get_mcp_version, mcp_version_id)
        if mcp_version is None:
            raise KeyError(f"MCP version {mcp_version_id!r} not found")

        # Validate tool_name exists in snapshot (skip check for mock transport)
        if mcp_version.transport != "mock":
            snapshot_tools = {
                t.get("name"): t
                for t in mcp_version.schema_snapshot.get("tools", [])
            }
            if tool_name not in snapshot_tools:
                raise ValueError(
                    f"Tool {tool_name!r} not found in snapshot for MCP version {mcp_version_id!r}. "
                    f"Available: {list(snapshot_tools.keys())}"
                )

        variant = ToolDescriptionVariant(
            variant_id=str(uuid4()),
            mcp_version_id=mcp_version_id,
            tool_name=tool_name,
            description=description,
            input_schema=input_schema,
        )
        await asyncio.to_thread(self._store.register_tool_variant, variant)
        return variant

    async def get_schema(self, mcp_version_id: str) -> dict[str, Any]:
        mcp_version = await asyncio.to_thread(self._store.get_mcp_version, mcp_version_id)
        if mcp_version is None:
            raise KeyError(f"MCP version {mcp_version_id!r} not found")
        return mcp_version.schema_snapshot

    async def list(self) -> list[dict[str, Any]]:
        versions = await asyncio.to_thread(self._store.list_mcp_versions)
        # Enrich with tool variants count
        for v in versions:
            variants = await asyncio.to_thread(
                self._store.list_tool_variants, v["mcp_version_id"]
            )
            v["tool_variant_count"] = len(variants)
        return versions

    async def list_tool_variants(self, mcp_version_id: str) -> list[dict[str, Any]]:
        variants = await asyncio.to_thread(self._store.list_tool_variants, mcp_version_id)
        return [v.model_dump(mode="json") for v in variants]

    async def delete(self, mcp_version_id: str) -> None:
        refs = await asyncio.to_thread(
            self._store.experiments_referencing_mcp_version, mcp_version_id
        )
        if refs:
            ids = ", ".join(refs[:5])
            raise ValueError(
                f"Cannot delete MCP version {mcp_version_id!r}: "
                f"referenced by experiments: {ids}"
            )
        await asyncio.to_thread(self._store.delete_mcp_version, mcp_version_id)

    # ─── Internal ─────────────────────────────────────────────────────────────

    async def _discover_schema(
        self,
        server_name: str,
        transport: str,
        connection_config: dict[str, Any],
    ) -> dict[str, Any]:
        """Transiently connect to the server and capture its tool schema."""
        transient_name = f"__lab_registry_probe_{server_name}"
        server_config = MCPServerConfig(
            transport=transport,  # type: ignore[arg-type]
            command=connection_config.get("command"),
            args=list(connection_config.get("args", [])),
            cwd=connection_config.get("cwd"),
            env=dict(connection_config.get("env", {})),
            url=connection_config.get("url"),
            headers=dict(connection_config.get("headers", {})),
            timeout_seconds=float(connection_config.get("timeout_seconds", 30.0)),
        )
        try:
            await self._mcp_manager.connect_server(transient_name, server_config, session_id="system")
            managed = self._mcp_manager._servers.get(transient_name)
            if managed is None or not managed.connected:
                err = managed.error if managed else "connection failed"
                raise RuntimeError(f"Could not connect to MCP server for schema discovery: {err}")

            raw_tools = await managed.client.list_tools()
            return {"tools": raw_tools}
        finally:
            await self._mcp_manager.disconnect_server(transient_name)
