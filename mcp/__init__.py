from __future__ import annotations

from importlib.machinery import PathFinder
from pathlib import Path
import sys


def _extend_with_sdk_path() -> None:
    package_dir = Path(__file__).resolve().parent
    repo_root = package_dir.parent.resolve()
    search_path: list[str] = []

    for entry in sys.path:
        candidate = Path(entry or ".").resolve()
        if candidate != repo_root:
            search_path.append(entry)

    spec = PathFinder.find_spec("mcp", search_path)
    if spec and spec.submodule_search_locations:
        for location in spec.submodule_search_locations:
            if location not in __path__:
                __path__.append(location)


_extend_with_sdk_path()

from .client_manager import MCPClientManager
from .inspector import MCPInspector
from .tool_router import ToolRouter

__all__ = ["MCPClientManager", "MCPInspector", "ToolRouter"]
