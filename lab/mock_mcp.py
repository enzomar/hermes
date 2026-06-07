"""MockMCPServer — deterministic in-process MCP server backed by a fixture file."""

from __future__ import annotations

import hashlib
import json
from typing import Any

from lab.models import MockFixture


class MockMCPServer:
    """In-process MCP server that returns pre-recorded responses from a fixture.

    Instantiate once per Run; call ``call_tool`` to simulate MCP tool calls.
    ``get_call_log`` returns the ordered record of every call received.
    """

    def __init__(self, fixture: MockFixture) -> None:
        self._fixture = fixture
        self._call_log: list[dict[str, Any]] = []
        # Build lookup: (tool_name, arg_hash) → response
        self._lookup: dict[tuple[str, str], dict[str, Any]] = {
            (e.tool_name, e.arg_hash): e.response
            for e in fixture.entries
        }

    # ─── Public API ───────────────────────────────────────────────────────────

    def call_tool(self, tool_name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        arg_hash = self._hash_args(arguments)
        key = (tool_name, arg_hash)
        matched = key in self._lookup
        response = self._lookup[key] if matched else self._fallback()

        self._call_log.append(
            {
                "tool_name": tool_name,
                "arguments": arguments,
                "arg_hash": arg_hash,
                "matched": matched,
            }
        )
        return response

    def get_call_log(self) -> list[dict[str, Any]]:
        return list(self._call_log)

    def list_tools(self) -> list[dict[str, Any]]:
        """Return a synthetic tool catalog derived from fixture entries."""
        seen: dict[str, dict[str, Any]] = {}
        for entry in self._fixture.entries:
            if entry.tool_name not in seen:
                seen[entry.tool_name] = {
                    "name": entry.tool_name,
                    "description": f"Mock tool: {entry.tool_name}",
                    "inputSchema": {"type": "object", "properties": {}},
                }
        return list(seen.values())

    @property
    def fixture(self) -> MockFixture:
        return self._fixture

    # ─── Internal helpers ─────────────────────────────────────────────────────

    @staticmethod
    def _hash_args(arguments: dict[str, Any]) -> str:
        """SHA-256 over canonical (sorted-key) JSON serialization."""
        canonical = json.dumps(arguments, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(canonical.encode()).hexdigest()

    def _fallback(self) -> dict[str, Any]:
        if self._fixture.fallback_mode == "empty":
            return {"content": []}
        # default: error
        return {
            "isError": True,
            "content": [
                {
                    "type": "text",
                    "text": "MockMCPServer: no fixture entry matched this tool call",
                }
            ],
        }

    # ─── Class-level fixture hashing helper (used by tooling) ─────────────────

    @classmethod
    def compute_arg_hash(cls, arguments: dict[str, Any]) -> str:
        return cls._hash_args(arguments)  # type: ignore[arg-type]
