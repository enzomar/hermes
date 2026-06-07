from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
	from .engine import ReplayEngine
	from .event_store import EventStore

__all__ = ["ReplayEngine", "EventStore"]


def __getattr__(name: str) -> Any:
	if name == "ReplayEngine":
		from .engine import ReplayEngine

		return ReplayEngine
	if name == "EventStore":
		from .event_store import EventStore

		return EventStore
	raise AttributeError(f"module 'replay' has no attribute {name!r}")
