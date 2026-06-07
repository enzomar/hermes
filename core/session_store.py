from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from replay.event_store import EventStore

logger = logging.getLogger(__name__)


class SessionStore:
    def __init__(self, event_store: EventStore):
        self.event_store = event_store

    async def create_session(
        self,
        title: str | None = None,
        parent_session_id: str | None = None,
        resume_from_event_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        session_id = str(uuid4())
        created_at = datetime.now(timezone.utc).isoformat()
        session_title = title or f"Session {created_at[11:19]}"
        await asyncio.to_thread(
            self.event_store.create_session,
            session_id,
            session_title,
            created_at,
            parent_session_id,
            resume_from_event_id,
            metadata or {},
        )
        return await self.get_session(session_id)

    async def ensure_system_session(self) -> dict[str, Any]:
        existing = await self.get_session("system")
        if existing:
            return existing
        await asyncio.to_thread(
            self.event_store.create_session,
            "system",
            "System",
            datetime.now(timezone.utc).isoformat(),
            None,
            None,
            {"kind": "system"},
        )
        return await self.get_session("system")

    async def get_session(self, session_id: str) -> dict[str, Any] | None:
        return await asyncio.to_thread(self.event_store.get_session, session_id)

    async def list_sessions(self) -> list[dict[str, Any]]:
        return await asyncio.to_thread(self.event_store.list_sessions)

    async def rename_session(self, session_id: str, title: str) -> dict[str, Any] | None:
        await asyncio.to_thread(self.event_store.update_session_title, session_id, title)
        return await self.get_session(session_id)

    async def delete_session(self, session_id: str) -> None:
        await asyncio.to_thread(self.event_store.delete_session, session_id)

    async def validate_session(self, session_id: str) -> tuple[bool, str | None]:
        """
        Validate a session exists and is not corrupted.

        Returns:
            tuple[bool, str | None]: (is_valid, error_message)
        """
        try:
            session = await self.get_session(session_id)
            if session is None:
                return False, "Session not found"

            # Check for required fields
            required_fields = ["session_id", "title", "created_at"]
            for field in required_fields:
                if field not in session:
                    return False, f"Missing required field: {field}"

            return True, None

        except Exception as e:
            logger.error(f"Session validation failed for {session_id}: {e}", exc_info=True)
            return False, str(e)

    async def recover_or_create_session(self, session_id: str) -> dict[str, Any]:
        """
        Attempt to recover a session, or create a new one if recovery fails.

        Args:
            session_id: ID of session to recover

        Returns:
            dict: Recovered session or new session
        """
        is_valid, error = await self.validate_session(session_id)

        if is_valid:
            logger.info(f"Session {session_id} is valid")
            return await self.get_session(session_id)  # type: ignore

        logger.warning(f"Session {session_id} validation failed: {error}. Creating recovery session.")

        # Create a new session as fallback
        recovery_session = await self.create_session(
            title="Recovered Session",
            metadata={"recovered_from": session_id, "recovery_reason": error},
        )

        return recovery_session

    async def cleanup_corrupted_sessions(self) -> list[str]:
        """
        Find and log corrupted sessions.

        Returns:
            list[str]: List of corrupted session IDs
        """
        corrupted = []
        sessions = await self.list_sessions()

        for session in sessions:
            session_id = session.get("session_id")
            if not session_id:
                continue

            is_valid, error = await self.validate_session(session_id)
            if not is_valid:
                corrupted.append(session_id)
                logger.error(f"Corrupted session detected: {session_id} - {error}")

        return corrupted
