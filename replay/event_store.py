from __future__ import annotations

import sqlite3
from pathlib import Path
from threading import Lock
from typing import Any

import orjson

from core.event_model import HermesEvent


class EventStore:
    def __init__(self, db_path: str | Path):
        self.db_path = str(db_path)
        self._lock = Lock()
        self._conn = sqlite3.connect(self.db_path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._setup()

    def _setup(self) -> None:
        with self._conn:
            self._conn.execute("PRAGMA journal_mode=WAL")
            self._conn.execute("PRAGMA foreign_keys=ON")
            self._conn.execute(
                """
                CREATE TABLE IF NOT EXISTS sessions (
                    session_id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    parent_session_id TEXT,
                    resume_from_event_id TEXT,
                    metadata BLOB NOT NULL DEFAULT '{}'
                )
                """
            )
            self._conn.execute(
                """
                CREATE TABLE IF NOT EXISTS events (
                    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
                    event_id TEXT NOT NULL UNIQUE,
                    event_type TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    session_id TEXT NOT NULL,
                    payload BLOB NOT NULL,
                    FOREIGN KEY (session_id) REFERENCES sessions(session_id)
                )
                """
            )
            self._conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_events_session_sequence ON events(session_id, sequence)"
            )
            self._conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_events_event_id ON events(event_id)"
            )

    def close(self) -> None:
        self._conn.close()

    def create_session(
        self,
        session_id: str,
        title: str,
        created_at: str,
        parent_session_id: str | None = None,
        resume_from_event_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        with self._lock, self._conn:
            self._conn.execute(
                """
                INSERT OR REPLACE INTO sessions (
                    session_id, title, created_at, parent_session_id, resume_from_event_id, metadata
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    session_id,
                    title,
                    created_at,
                    parent_session_id,
                    resume_from_event_id,
                    self._encode_json(metadata or {}),
                ),
            )

    def get_session(self, session_id: str) -> dict[str, Any] | None:
        row = self._conn.execute(
            """
            SELECT
                s.*,
                COALESCE(MAX(e.timestamp), s.created_at) AS updated_at,
                COUNT(e.event_id) AS event_count
            FROM sessions s
            LEFT JOIN events e ON e.session_id = s.session_id
            WHERE s.session_id = ?
            GROUP BY s.session_id
            """,
            (session_id,),
        ).fetchone()
        if not row:
            return None
        return self._session_row_to_dict(row)

    def list_sessions(self) -> list[dict[str, Any]]:
        rows = self._conn.execute(
            """
            SELECT
                s.*,
                COALESCE(MAX(e.timestamp), s.created_at) AS updated_at,
                COUNT(e.event_id) AS event_count
            FROM sessions s
            LEFT JOIN events e ON e.session_id = s.session_id
            GROUP BY s.session_id
            ORDER BY updated_at DESC, s.created_at DESC
            """
        ).fetchall()
        return [self._session_row_to_dict(row) for row in rows]

    def update_session_title(self, session_id: str, title: str) -> None:
        with self._lock, self._conn:
            self._conn.execute(
                "UPDATE sessions SET title = ? WHERE session_id = ?",
                (title, session_id),
            )

    def delete_session(self, session_id: str) -> None:
        with self._lock, self._conn:
            self._conn.execute("DELETE FROM events WHERE session_id = ?", (session_id,))
            self._conn.execute("DELETE FROM sessions WHERE session_id = ?", (session_id,))

    def append(self, event: HermesEvent) -> HermesEvent:
        with self._lock, self._conn:
            cursor = self._conn.execute(
                """
                INSERT INTO events (event_id, event_type, timestamp, session_id, payload)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    event.event_id,
                    event.event_name,
                    event.timestamp.isoformat(),
                    event.session_id,
                    self._encode_json(event.payload),
                ),
            )
            event.sequence = cursor.lastrowid
        return event

    def get_event(self, event_id: str) -> HermesEvent | None:
        row = self._conn.execute(
            "SELECT sequence, event_id, event_type, timestamp, session_id, payload FROM events WHERE event_id = ?",
            (event_id,),
        ).fetchone()
        if not row:
            return None
        return self._event_row_to_model(row)

    def list_events(self, session_id: str, until_event_id: str | None = None) -> list[HermesEvent]:
        params: list[Any] = [session_id]
        query = (
            "SELECT sequence, event_id, event_type, timestamp, session_id, payload "
            "FROM events WHERE session_id = ?"
        )
        if until_event_id:
            cutoff = self._conn.execute(
                "SELECT sequence FROM events WHERE event_id = ? AND session_id = ?",
                (until_event_id, session_id),
            ).fetchone()
            if cutoff:
                query += " AND sequence <= ?"
                params.append(cutoff["sequence"])
        query += " ORDER BY sequence ASC"
        rows = self._conn.execute(query, tuple(params)).fetchall()
        return [self._event_row_to_model(row) for row in rows]

    def _session_row_to_dict(self, row: sqlite3.Row) -> dict[str, Any]:
        return {
            "session_id": row["session_id"],
            "title": row["title"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"] if "updated_at" in row.keys() else row["created_at"],
            "event_count": row["event_count"] if "event_count" in row.keys() else 0,
            "parent_session_id": row["parent_session_id"],
            "resume_from_event_id": row["resume_from_event_id"],
            "metadata": self._decode_json(row["metadata"]),
        }

    def _event_row_to_model(self, row: sqlite3.Row) -> HermesEvent:
        return HermesEvent.model_validate(
            {
                "sequence": row["sequence"],
                "event_id": row["event_id"],
                "event_type": row["event_type"],
                "timestamp": row["timestamp"],
                "session_id": row["session_id"],
                "payload": self._decode_json(row["payload"]),
            }
        )

    @staticmethod
    def _encode_json(payload: dict[str, Any]) -> bytes:
        return orjson.dumps(payload)

    @staticmethod
    def _decode_json(payload: bytes | str) -> dict[str, Any]:
        if isinstance(payload, str):
            payload = payload.encode("utf-8")
        return orjson.loads(payload)
