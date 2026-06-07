from __future__ import annotations

import re
from collections import defaultdict
from typing import Any


def _sanitize(name: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_]", "_", name)


class ToolRouter:
    def __init__(self) -> None:
        self._tools: list[dict[str, Any]] = []
        self._by_qualified: dict[str, dict[str, Any]] = {}
        self._by_raw: dict[str, list[dict[str, Any]]] = defaultdict(list)

    def rebuild(self, server_tools: dict[str, list[dict[str, Any]]]) -> list[dict[str, Any]]:
        self._tools = []
        self._by_qualified.clear()
        self._by_raw.clear()

        for server_name, tools in server_tools.items():
            for tool in tools:
                qualified_name = f"{_sanitize(server_name)}__{_sanitize(tool['tool_name'])}"
                binding = {**tool, "qualified_name": qualified_name}
                self._tools.append(binding)
                self._by_qualified[qualified_name] = binding
                self._by_raw[tool["tool_name"]].append(binding)

        self._tools.sort(key=lambda item: (item["server_name"], item["tool_name"]))
        return self._tools

    def list_tools(self) -> list[dict[str, Any]]:
        return list(self._tools)

    def resolve(self, tool_name: str, preferred_server: str | None = None) -> dict[str, Any] | None:
        if tool_name in self._by_qualified:
            return self._by_qualified[tool_name]

        candidates = self._by_raw.get(tool_name, [])
        if preferred_server:
            for binding in candidates:
                if binding["server_name"] == preferred_server:
                    return binding

        if len(candidates) == 1:
            return candidates[0]
        return None
