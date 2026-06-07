"""LabStore — SQLite persistence layer for all Hermes MCP Lab entities.

Shares the same sqlite3 connection and threading.Lock as EventStore so that
Lab DDL and writes participate in the same WAL journal without contention.
"""

from __future__ import annotations

import sqlite3
import threading
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

import orjson

from lab.models import (
    Dataset,
    EvaluationResult,
    LabModelConfig,
    MCPVersionRegistration,
    MockFixture,
    MockFixtureEntry,
    RunSpec,
    Task,
    TaskExpectedOutcome,
    ToolDescriptionVariant,
    TraceEvent,
    WorkflowConfig,
)


def _enc(obj: Any) -> bytes:
    return orjson.dumps(obj)


def _dec(raw: bytes | str) -> Any:
    if isinstance(raw, str):
        raw = raw.encode()
    return orjson.loads(raw)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class LabStore:
    def __init__(self, conn: sqlite3.Connection, lock: threading.Lock) -> None:
        self._conn = conn
        self._lock = lock

    # ─── DDL ──────────────────────────────────────────────────────────────────

    def migrate(self) -> None:
        with self._lock, self._conn:
            self._conn.executescript("""
                CREATE TABLE IF NOT EXISTS lab_datasets (
                    dataset_id   TEXT NOT NULL,
                    version      INTEGER NOT NULL,
                    name         TEXT NOT NULL,
                    description  TEXT NOT NULL DEFAULT '',
                    created_at   TEXT NOT NULL,
                    PRIMARY KEY (dataset_id, version)
                );

                CREATE TABLE IF NOT EXISTS lab_tasks (
                    task_id             TEXT PRIMARY KEY,
                    dataset_id          TEXT NOT NULL,
                    dataset_version     INTEGER NOT NULL,
                    prompt              TEXT NOT NULL,
                    expected_tool_calls BLOB NOT NULL DEFAULT '[]',
                    expected_assertions BLOB NOT NULL DEFAULT '[]',
                    tool_calls_ordered  INTEGER NOT NULL DEFAULT 0,
                    FOREIGN KEY (dataset_id, dataset_version)
                        REFERENCES lab_datasets(dataset_id, version)
                );

                CREATE TABLE IF NOT EXISTS lab_mcp_versions (
                    mcp_version_id      TEXT PRIMARY KEY,
                    name                TEXT NOT NULL,
                    version_tag         TEXT NOT NULL,
                    transport           TEXT NOT NULL,
                    connection_config   BLOB NOT NULL,
                    schema_snapshot     BLOB NOT NULL,
                    registered_at       TEXT NOT NULL,
                    UNIQUE (name, version_tag)
                );

                CREATE TABLE IF NOT EXISTS lab_tool_variants (
                    variant_id      TEXT PRIMARY KEY,
                    mcp_version_id  TEXT NOT NULL,
                    tool_name       TEXT NOT NULL,
                    description     TEXT NOT NULL,
                    input_schema    BLOB,
                    created_at      TEXT NOT NULL,
                    FOREIGN KEY (mcp_version_id) REFERENCES lab_mcp_versions(mcp_version_id)
                );

                CREATE TABLE IF NOT EXISTS lab_model_configs (
                    model_config_id TEXT PRIMARY KEY,
                    name            TEXT NOT NULL UNIQUE,
                    provider        TEXT NOT NULL,
                    model_id        TEXT NOT NULL,
                    temperature     REAL NOT NULL DEFAULT 0.0,
                    max_tokens      INTEGER NOT NULL DEFAULT 4096,
                    system_prompt   TEXT NOT NULL DEFAULT '',
                    api_key_env     TEXT,
                    api_base        TEXT,
                    created_at      TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS lab_workflow_configs (
                    workflow_config_id  TEXT PRIMARY KEY,
                    name                TEXT NOT NULL UNIQUE,
                    system_prompt       TEXT NOT NULL DEFAULT '',
                    max_turns           INTEGER NOT NULL DEFAULT 6,
                    timeout_seconds     REAL NOT NULL DEFAULT 120.0,
                    created_at          TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS lab_experiments (
                    experiment_id   TEXT PRIMARY KEY,
                    name            TEXT NOT NULL,
                    status          TEXT NOT NULL DEFAULT 'pending',
                    created_at      TEXT NOT NULL,
                    completed_at    TEXT
                );

                CREATE TABLE IF NOT EXISTS lab_experiment_variants (
                    experiment_id       TEXT NOT NULL,
                    variant_type        TEXT NOT NULL,
                    variant_id          TEXT NOT NULL,
                    FOREIGN KEY (experiment_id) REFERENCES lab_experiments(experiment_id)
                );

                CREATE TABLE IF NOT EXISTS lab_runs (
                    run_id              TEXT PRIMARY KEY,
                    experiment_id       TEXT NOT NULL,
                    task_id             TEXT NOT NULL,
                    model_config_id     TEXT NOT NULL,
                    mcp_version_id      TEXT NOT NULL,
                    tool_variant_id     TEXT,
                    workflow_config_id  TEXT NOT NULL,
                    status              TEXT NOT NULL DEFAULT 'pending',
                    started_at          TEXT,
                    completed_at        TEXT,
                    FOREIGN KEY (experiment_id) REFERENCES lab_experiments(experiment_id)
                );

                CREATE TABLE IF NOT EXISTS lab_trace_events (
                    run_id      TEXT NOT NULL,
                    seq         INTEGER NOT NULL,
                    event_type  TEXT NOT NULL,
                    ts          TEXT NOT NULL,
                    payload     BLOB NOT NULL,
                    PRIMARY KEY (run_id, seq),
                    FOREIGN KEY (run_id) REFERENCES lab_runs(run_id)
                );

                CREATE TABLE IF NOT EXISTS lab_trace_sealed (
                    run_id      TEXT PRIMARY KEY,
                    sealed_at   TEXT NOT NULL,
                    FOREIGN KEY (run_id) REFERENCES lab_runs(run_id)
                );

                CREATE TABLE IF NOT EXISTS lab_eval_results (
                    run_id              TEXT PRIMARY KEY,
                    experiment_id       TEXT NOT NULL,
                    classification      TEXT NOT NULL,
                    tool_call_accuracy  REAL NOT NULL,
                    latency_ms          REAL NOT NULL,
                    total_tokens        INTEGER NOT NULL,
                    estimated_cost_usd  REAL NOT NULL,
                    turn_count          INTEGER NOT NULL,
                    error_field         TEXT,
                    detail              BLOB NOT NULL DEFAULT '{}',
                    FOREIGN KEY (run_id) REFERENCES lab_runs(run_id),
                    FOREIGN KEY (experiment_id) REFERENCES lab_experiments(experiment_id)
                );

                CREATE TABLE IF NOT EXISTS lab_baselines (
                    baseline_id     TEXT PRIMARY KEY,
                    experiment_id   TEXT NOT NULL,
                    dataset_id      TEXT NOT NULL,
                    dataset_version INTEGER NOT NULL,
                    variant_key     TEXT NOT NULL,
                    set_at          TEXT NOT NULL,
                    UNIQUE (dataset_id, dataset_version, variant_key),
                    FOREIGN KEY (experiment_id) REFERENCES lab_experiments(experiment_id)
                );

                CREATE TABLE IF NOT EXISTS lab_regression_reports (
                    report_id       TEXT PRIMARY KEY,
                    experiment_id   TEXT NOT NULL,
                    baseline_id     TEXT NOT NULL,
                    generated_at    TEXT NOT NULL,
                    entries         BLOB NOT NULL,
                    FOREIGN KEY (experiment_id) REFERENCES lab_experiments(experiment_id)
                );

                CREATE TABLE IF NOT EXISTS lab_mock_fixtures (
                    fixture_id      TEXT PRIMARY KEY,
                    name            TEXT NOT NULL UNIQUE,
                    fallback_mode   TEXT NOT NULL DEFAULT 'error',
                    entries         BLOB NOT NULL,
                    created_at      TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_lab_runs_experiment
                    ON lab_runs(experiment_id);
                CREATE INDEX IF NOT EXISTS idx_lab_runs_status
                    ON lab_runs(status);
                CREATE INDEX IF NOT EXISTS idx_lab_trace_events_run
                    ON lab_trace_events(run_id, seq);
                CREATE INDEX IF NOT EXISTS idx_lab_eval_results_experiment
                    ON lab_eval_results(experiment_id);
            """)

    # ─── Datasets ─────────────────────────────────────────────────────────────

    def create_dataset(self, dataset: Dataset) -> None:
        with self._lock, self._conn:
            self._conn.execute(
                "INSERT INTO lab_datasets (dataset_id, version, name, description, created_at) "
                "VALUES (?, ?, ?, ?, ?)",
                (dataset.dataset_id, dataset.version, dataset.name, dataset.description,
                 dataset.created_at.isoformat()),
            )
            for task in dataset.tasks:
                self._conn.execute(
                    "INSERT INTO lab_tasks "
                    "(task_id, dataset_id, dataset_version, prompt, expected_tool_calls, "
                    " expected_assertions, tool_calls_ordered) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (
                        task.task_id, task.dataset_id, task.dataset_version,
                        task.prompt,
                        _enc(task.expected.tool_calls),
                        _enc(task.expected.assertions),
                        int(task.expected.tool_calls_ordered),
                    ),
                )

    def get_dataset(self, dataset_id: str, version: int) -> Dataset | None:
        row = self._conn.execute(
            "SELECT * FROM lab_datasets WHERE dataset_id=? AND version=?",
            (dataset_id, version),
        ).fetchone()
        if not row:
            return None
        tasks = self._load_tasks(dataset_id, version)
        return Dataset(
            dataset_id=row["dataset_id"],
            version=row["version"],
            name=row["name"],
            description=row["description"],
            tasks=tasks,
            created_at=datetime.fromisoformat(row["created_at"]),
        )

    def list_datasets(self) -> list[dict[str, Any]]:
        rows = self._conn.execute(
            "SELECT d.dataset_id, d.version, d.name, d.description, d.created_at, "
            "COUNT(t.task_id) AS task_count "
            "FROM lab_datasets d LEFT JOIN lab_tasks t "
            "ON t.dataset_id=d.dataset_id AND t.dataset_version=d.version "
            "GROUP BY d.dataset_id, d.version ORDER BY d.created_at DESC"
        ).fetchall()
        return [dict(r) for r in rows]

    def get_latest_dataset_version(self, dataset_id: str) -> int:
        row = self._conn.execute(
            "SELECT MAX(version) AS v FROM lab_datasets WHERE dataset_id=?",
            (dataset_id,),
        ).fetchone()
        return int(row["v"] or 0)

    def delete_dataset_version(self, dataset_id: str, version: int) -> None:
        with self._lock, self._conn:
            self._conn.execute(
                "DELETE FROM lab_tasks WHERE dataset_id=? AND dataset_version=?",
                (dataset_id, version),
            )
            self._conn.execute(
                "DELETE FROM lab_datasets WHERE dataset_id=? AND version=?",
                (dataset_id, version),
            )

    def _load_tasks(self, dataset_id: str, version: int) -> list[Task]:
        rows = self._conn.execute(
            "SELECT * FROM lab_tasks WHERE dataset_id=? AND dataset_version=? ORDER BY rowid",
            (dataset_id, version),
        ).fetchall()
        return [
            Task(
                task_id=r["task_id"],
                dataset_id=r["dataset_id"],
                dataset_version=r["dataset_version"],
                prompt=r["prompt"],
                expected=TaskExpectedOutcome(
                    tool_calls=_dec(r["expected_tool_calls"]),
                    assertions=_dec(r["expected_assertions"]),
                    tool_calls_ordered=bool(r["tool_calls_ordered"]),
                ),
            )
            for r in rows
        ]

    # ─── MCP Versions ─────────────────────────────────────────────────────────

    def register_mcp_version(self, reg: MCPVersionRegistration) -> None:
        with self._lock, self._conn:
            self._conn.execute(
                "INSERT INTO lab_mcp_versions "
                "(mcp_version_id, name, version_tag, transport, connection_config, "
                " schema_snapshot, registered_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (
                    reg.mcp_version_id, reg.name, reg.version_tag, reg.transport,
                    _enc(reg.connection_config), _enc(reg.schema_snapshot),
                    reg.registered_at.isoformat(),
                ),
            )

    def get_mcp_version(self, mcp_version_id: str) -> MCPVersionRegistration | None:
        row = self._conn.execute(
            "SELECT * FROM lab_mcp_versions WHERE mcp_version_id=?",
            (mcp_version_id,),
        ).fetchone()
        if not row:
            return None
        return self._mcp_row_to_model(row)

    def list_mcp_versions(self) -> list[dict[str, Any]]:
        rows = self._conn.execute(
            "SELECT * FROM lab_mcp_versions ORDER BY registered_at DESC"
        ).fetchall()
        return [dict(r) for r in rows]

    def delete_mcp_version(self, mcp_version_id: str) -> None:
        with self._lock, self._conn:
            self._conn.execute(
                "DELETE FROM lab_tool_variants WHERE mcp_version_id=?",
                (mcp_version_id,),
            )
            self._conn.execute(
                "DELETE FROM lab_mcp_versions WHERE mcp_version_id=?",
                (mcp_version_id,),
            )

    def _mcp_row_to_model(self, row: sqlite3.Row) -> MCPVersionRegistration:
        return MCPVersionRegistration(
            mcp_version_id=row["mcp_version_id"],
            name=row["name"],
            version_tag=row["version_tag"],
            transport=row["transport"],
            connection_config=_dec(row["connection_config"]),
            schema_snapshot=_dec(row["schema_snapshot"]),
            registered_at=datetime.fromisoformat(row["registered_at"]),
        )

    # ─── Tool Variants ────────────────────────────────────────────────────────

    def register_tool_variant(self, v: ToolDescriptionVariant) -> None:
        with self._lock, self._conn:
            self._conn.execute(
                "INSERT INTO lab_tool_variants "
                "(variant_id, mcp_version_id, tool_name, description, input_schema, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (
                    v.variant_id, v.mcp_version_id, v.tool_name, v.description,
                    _enc(v.input_schema) if v.input_schema is not None else None,
                    v.created_at.isoformat(),
                ),
            )

    def get_tool_variant(self, variant_id: str) -> ToolDescriptionVariant | None:
        row = self._conn.execute(
            "SELECT * FROM lab_tool_variants WHERE variant_id=?", (variant_id,)
        ).fetchone()
        if not row:
            return None
        return self._tv_row_to_model(row)

    def list_tool_variants(self, mcp_version_id: str) -> list[ToolDescriptionVariant]:
        rows = self._conn.execute(
            "SELECT * FROM lab_tool_variants WHERE mcp_version_id=? ORDER BY created_at",
            (mcp_version_id,),
        ).fetchall()
        return [self._tv_row_to_model(r) for r in rows]

    def _tv_row_to_model(self, row: sqlite3.Row) -> ToolDescriptionVariant:
        return ToolDescriptionVariant(
            variant_id=row["variant_id"],
            mcp_version_id=row["mcp_version_id"],
            tool_name=row["tool_name"],
            description=row["description"],
            input_schema=_dec(row["input_schema"]) if row["input_schema"] is not None else None,
            created_at=datetime.fromisoformat(row["created_at"]),
        )

    # ─── Model Configs ────────────────────────────────────────────────────────

    def create_model_config(self, mc: LabModelConfig) -> None:
        with self._lock, self._conn:
            self._conn.execute(
                "INSERT INTO lab_model_configs "
                "(model_config_id, name, provider, model_id, temperature, max_tokens, "
                " system_prompt, api_key_env, api_base, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    mc.model_config_id, mc.name, mc.provider, mc.model,
                    mc.temperature, mc.max_tokens, mc.system_prompt,
                    mc.api_key_env, mc.api_base, mc.created_at.isoformat(),
                ),
            )

    def get_model_config(self, model_config_id: str) -> LabModelConfig | None:
        row = self._conn.execute(
            "SELECT * FROM lab_model_configs WHERE model_config_id=?", (model_config_id,)
        ).fetchone()
        return self._mc_row_to_model(row) if row else None

    def list_model_configs(self) -> list[LabModelConfig]:
        rows = self._conn.execute(
            "SELECT * FROM lab_model_configs ORDER BY created_at"
        ).fetchall()
        return [self._mc_row_to_model(r) for r in rows]

    def delete_model_config(self, model_config_id: str) -> None:
        with self._lock, self._conn:
            self._conn.execute(
                "DELETE FROM lab_model_configs WHERE model_config_id=?",
                (model_config_id,),
            )

    def _mc_row_to_model(self, row: sqlite3.Row) -> LabModelConfig:
        return LabModelConfig(
            model_config_id=row["model_config_id"],
            name=row["name"],
            provider=row["provider"],
            model=row["model_id"],
            temperature=row["temperature"],
            max_tokens=row["max_tokens"],
            system_prompt=row["system_prompt"] or "",
            api_key_env=row["api_key_env"],
            api_base=row["api_base"],
            created_at=datetime.fromisoformat(row["created_at"]),
        )

    # ─── Workflow Configs ─────────────────────────────────────────────────────

    def create_workflow_config(self, wc: WorkflowConfig) -> None:
        with self._lock, self._conn:
            self._conn.execute(
                "INSERT INTO lab_workflow_configs "
                "(workflow_config_id, name, system_prompt, max_turns, timeout_seconds, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (
                    wc.workflow_config_id, wc.name, wc.system_prompt,
                    wc.max_turns, wc.timeout_seconds, wc.created_at.isoformat(),
                ),
            )

    def get_workflow_config(self, workflow_config_id: str) -> WorkflowConfig | None:
        row = self._conn.execute(
            "SELECT * FROM lab_workflow_configs WHERE workflow_config_id=?",
            (workflow_config_id,),
        ).fetchone()
        return self._wc_row_to_model(row) if row else None

    def list_workflow_configs(self) -> list[WorkflowConfig]:
        rows = self._conn.execute(
            "SELECT * FROM lab_workflow_configs ORDER BY created_at"
        ).fetchall()
        return [self._wc_row_to_model(r) for r in rows]

    def delete_workflow_config(self, workflow_config_id: str) -> None:
        with self._lock, self._conn:
            self._conn.execute(
                "DELETE FROM lab_workflow_configs WHERE workflow_config_id=?",
                (workflow_config_id,),
            )

    def _wc_row_to_model(self, row: sqlite3.Row) -> WorkflowConfig:
        return WorkflowConfig(
            workflow_config_id=row["workflow_config_id"],
            name=row["name"],
            system_prompt=row["system_prompt"] or "",
            max_turns=row["max_turns"],
            timeout_seconds=row["timeout_seconds"],
            created_at=datetime.fromisoformat(row["created_at"]),
        )

    # ─── Experiments ──────────────────────────────────────────────────────────

    def create_experiment(
        self,
        experiment_id: str,
        name: str,
        variant_links: list[dict[str, str]],
    ) -> None:
        with self._lock, self._conn:
            self._conn.execute(
                "INSERT INTO lab_experiments (experiment_id, name, status, created_at) "
                "VALUES (?, ?, 'pending', ?)",
                (experiment_id, name, _now()),
            )
            for link in variant_links:
                self._conn.execute(
                    "INSERT INTO lab_experiment_variants (experiment_id, variant_type, variant_id) "
                    "VALUES (?, ?, ?)",
                    (experiment_id, link["variant_type"], link["variant_id"]),
                )

    def get_experiment(self, experiment_id: str) -> dict[str, Any] | None:
        row = self._conn.execute(
            "SELECT e.*, "
            "(SELECT COUNT(*) FROM lab_runs r WHERE r.experiment_id=e.experiment_id) AS run_count, "
            "(SELECT COUNT(*) FROM lab_runs r WHERE r.experiment_id=e.experiment_id "
            " AND r.status='completed') AS completed_count "
            "FROM lab_experiments e WHERE e.experiment_id=?",
            (experiment_id,),
        ).fetchone()
        return dict(row) if row else None

    def list_experiments(self) -> list[dict[str, Any]]:
        rows = self._conn.execute(
            "SELECT e.*, "
            "(SELECT COUNT(*) FROM lab_runs r WHERE r.experiment_id=e.experiment_id) AS run_count, "
            "(SELECT COUNT(*) FROM lab_runs r WHERE r.experiment_id=e.experiment_id "
            " AND r.status='completed') AS completed_count "
            "FROM lab_experiments e ORDER BY e.created_at DESC"
        ).fetchall()
        return [dict(r) for r in rows]

    def set_experiment_status(
        self,
        experiment_id: str,
        status: str,
        completed_at: str | None = None,
    ) -> None:
        with self._lock, self._conn:
            self._conn.execute(
                "UPDATE lab_experiments SET status=?, completed_at=? WHERE experiment_id=?",
                (status, completed_at, experiment_id),
            )

    def delete_experiment(self, experiment_id: str) -> None:
        """Cascade-delete all experiment data atomically."""
        with self._lock, self._conn:
            # Get run IDs first
            run_rows = self._conn.execute(
                "SELECT run_id FROM lab_runs WHERE experiment_id=?", (experiment_id,)
            ).fetchall()
            run_ids = [r["run_id"] for r in run_rows]

            for run_id in run_ids:
                self._conn.execute("DELETE FROM lab_trace_sealed WHERE run_id=?", (run_id,))
                self._conn.execute("DELETE FROM lab_trace_events WHERE run_id=?", (run_id,))
                self._conn.execute("DELETE FROM lab_eval_results WHERE run_id=?", (run_id,))

            self._conn.execute("DELETE FROM lab_runs WHERE experiment_id=?", (experiment_id,))
            self._conn.execute(
                "DELETE FROM lab_regression_reports WHERE experiment_id=?", (experiment_id,)
            )
            self._conn.execute(
                "DELETE FROM lab_experiment_variants WHERE experiment_id=?", (experiment_id,)
            )
            self._conn.execute(
                "DELETE FROM lab_experiments WHERE experiment_id=?", (experiment_id,)
            )

    # ─── Runs ─────────────────────────────────────────────────────────────────

    def create_runs(self, runs: list[RunSpec]) -> None:
        with self._lock, self._conn:
            self._conn.executemany(
                "INSERT INTO lab_runs "
                "(run_id, experiment_id, task_id, model_config_id, mcp_version_id, "
                " tool_variant_id, workflow_config_id, status) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')",
                [
                    (
                        r.run_id, r.experiment_id, r.task.task_id,
                        r.llm_config.model_config_id, r.mcp_version.mcp_version_id,
                        r.tool_variant.variant_id if r.tool_variant else None,
                        r.workflow_config.workflow_config_id,
                    )
                    for r in runs
                ],
            )

    def list_runs(self, experiment_id: str) -> list[dict[str, Any]]:
        rows = self._conn.execute(
            "SELECT * FROM lab_runs WHERE experiment_id=? ORDER BY rowid",
            (experiment_id,),
        ).fetchall()
        return [dict(r) for r in rows]

    def get_run_row(self, run_id: str) -> dict[str, Any] | None:
        row = self._conn.execute(
            "SELECT * FROM lab_runs WHERE run_id=?", (run_id,)
        ).fetchone()
        return dict(row) if row else None

    def set_run_status(
        self,
        run_id: str,
        status: str,
        started_at: str | None = None,
        completed_at: str | None = None,
    ) -> None:
        with self._lock, self._conn:
            self._conn.execute(
                "UPDATE lab_runs SET status=?, started_at=COALESCE(?, started_at), "
                "completed_at=? WHERE run_id=?",
                (status, started_at, completed_at, run_id),
            )

    def get_run_counts(self, experiment_id: str) -> dict[str, int]:
        rows = self._conn.execute(
            "SELECT status, COUNT(*) AS cnt FROM lab_runs WHERE experiment_id=? GROUP BY status",
            (experiment_id,),
        ).fetchall()
        counts: dict[str, int] = {
            "pending": 0, "running": 0, "completed": 0,
            "failed": 0, "timed_out": 0, "cancelled": 0,
        }
        for r in rows:
            counts[r["status"]] = r["cnt"]
        return counts

    # ─── Traces ───────────────────────────────────────────────────────────────

    def append_trace_event(self, event: TraceEvent) -> None:
        if self.is_sealed(event.run_id):
            raise ValueError(f"Trace for run {event.run_id!r} is sealed; cannot append events")
        with self._lock, self._conn:
            self._conn.execute(
                "INSERT INTO lab_trace_events (run_id, seq, event_type, ts, payload) "
                "VALUES (?, ?, ?, ?, ?)",
                (event.run_id, event.seq, event.event_type,
                 event.ts.isoformat(), _enc(event.payload)),
            )

    def next_trace_seq(self, run_id: str) -> int:
        row = self._conn.execute(
            "SELECT COALESCE(MAX(seq), -1) AS last_seq FROM lab_trace_events WHERE run_id=?",
            (run_id,),
        ).fetchone()
        return int(row["last_seq"]) + 1

    def seal_trace(self, run_id: str) -> None:
        with self._lock, self._conn:
            self._conn.execute(
                "INSERT OR IGNORE INTO lab_trace_sealed (run_id, sealed_at) VALUES (?, ?)",
                (run_id, _now()),
            )

    def is_sealed(self, run_id: str) -> bool:
        row = self._conn.execute(
            "SELECT 1 FROM lab_trace_sealed WHERE run_id=?", (run_id,)
        ).fetchone()
        return row is not None

    def get_trace(self, run_id: str) -> list[TraceEvent]:
        rows = self._conn.execute(
            "SELECT * FROM lab_trace_events WHERE run_id=? ORDER BY seq",
            (run_id,),
        ).fetchall()
        return [
            TraceEvent(
                run_id=r["run_id"],
                seq=r["seq"],
                event_type=r["event_type"],
                ts=datetime.fromisoformat(r["ts"]),
                payload=_dec(r["payload"]),
            )
            for r in rows
        ]

    # ─── Evaluation ───────────────────────────────────────────────────────────

    def save_eval_result(self, result: EvaluationResult) -> None:
        with self._lock, self._conn:
            self._conn.execute(
                "INSERT OR REPLACE INTO lab_eval_results "
                "(run_id, experiment_id, classification, tool_call_accuracy, "
                " latency_ms, total_tokens, estimated_cost_usd, turn_count, "
                " error_field, detail) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    result.run_id, result.experiment_id, result.classification,
                    result.tool_call_accuracy, result.latency_ms,
                    result.total_tokens, result.estimated_cost_usd,
                    result.turn_count, result.error_field, _enc(result.detail),
                ),
            )

    def get_eval_result(self, run_id: str) -> EvaluationResult | None:
        row = self._conn.execute(
            "SELECT * FROM lab_eval_results WHERE run_id=?", (run_id,)
        ).fetchone()
        if not row:
            return None
        return EvaluationResult(
            run_id=row["run_id"],
            experiment_id=row["experiment_id"],
            classification=row["classification"],
            tool_call_accuracy=row["tool_call_accuracy"],
            latency_ms=row["latency_ms"],
            total_tokens=row["total_tokens"],
            estimated_cost_usd=row["estimated_cost_usd"],
            turn_count=row["turn_count"],
            error_field=row["error_field"],
            detail=_dec(row["detail"]),
        )

    def list_eval_results(self, experiment_id: str) -> list[EvaluationResult]:
        rows = self._conn.execute(
            "SELECT * FROM lab_eval_results WHERE experiment_id=?",
            (experiment_id,),
        ).fetchall()
        return [
            EvaluationResult(
                run_id=r["run_id"],
                experiment_id=r["experiment_id"],
                classification=r["classification"],
                tool_call_accuracy=r["tool_call_accuracy"],
                latency_ms=r["latency_ms"],
                total_tokens=r["total_tokens"],
                estimated_cost_usd=r["estimated_cost_usd"],
                turn_count=r["turn_count"],
                error_field=r["error_field"],
                detail=_dec(r["detail"]),
            )
            for r in rows
        ]

    # ─── Baselines ────────────────────────────────────────────────────────────

    def set_baseline(
        self,
        experiment_id: str,
        dataset_id: str,
        dataset_version: int,
        variant_key: str,
    ) -> str:
        baseline_id = str(uuid4())
        with self._lock, self._conn:
            self._conn.execute(
                "INSERT OR REPLACE INTO lab_baselines "
                "(baseline_id, experiment_id, dataset_id, dataset_version, variant_key, set_at) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (baseline_id, experiment_id, dataset_id, dataset_version, variant_key, _now()),
            )
        return baseline_id

    def get_baseline(
        self,
        dataset_id: str,
        dataset_version: int,
        variant_key: str,
    ) -> dict[str, Any] | None:
        row = self._conn.execute(
            "SELECT * FROM lab_baselines "
            "WHERE dataset_id=? AND dataset_version=? AND variant_key=?",
            (dataset_id, dataset_version, variant_key),
        ).fetchone()
        return dict(row) if row else None

    # ─── Regression Reports ───────────────────────────────────────────────────

    def save_regression_report(self, report: dict[str, Any]) -> None:
        with self._lock, self._conn:
            self._conn.execute(
                "INSERT OR REPLACE INTO lab_regression_reports "
                "(report_id, experiment_id, baseline_id, generated_at, entries) "
                "VALUES (?, ?, ?, ?, ?)",
                (
                    report["report_id"], report["experiment_id"],
                    report["baseline_id"], report["generated_at"],
                    _enc(report["entries"]),
                ),
            )

    def get_regression_report(self, experiment_id: str) -> dict[str, Any] | None:
        row = self._conn.execute(
            "SELECT * FROM lab_regression_reports WHERE experiment_id=? "
            "ORDER BY generated_at DESC LIMIT 1",
            (experiment_id,),
        ).fetchone()
        if not row:
            return None
        return {
            "report_id": row["report_id"],
            "experiment_id": row["experiment_id"],
            "baseline_id": row["baseline_id"],
            "generated_at": row["generated_at"],
            "entries": _dec(row["entries"]),
        }

    # ─── Mock Fixtures ────────────────────────────────────────────────────────

    def save_fixture(self, fixture: MockFixture) -> None:
        with self._lock, self._conn:
            self._conn.execute(
                "INSERT OR REPLACE INTO lab_mock_fixtures "
                "(fixture_id, name, fallback_mode, entries, created_at) "
                "VALUES (?, ?, ?, ?, ?)",
                (
                    fixture.fixture_id, fixture.name, fixture.fallback_mode,
                    _enc([e.model_dump() for e in fixture.entries]),
                    fixture.created_at.isoformat(),
                ),
            )

    def get_fixture(self, fixture_id: str) -> MockFixture | None:
        row = self._conn.execute(
            "SELECT * FROM lab_mock_fixtures WHERE fixture_id=?", (fixture_id,)
        ).fetchone()
        if not row:
            return None
        return self._fixture_row_to_model(row)

    def list_fixtures(self) -> list[MockFixture]:
        rows = self._conn.execute(
            "SELECT * FROM lab_mock_fixtures ORDER BY created_at DESC"
        ).fetchall()
        return [self._fixture_row_to_model(r) for r in rows]

    def delete_fixture(self, fixture_id: str) -> None:
        with self._lock, self._conn:
            self._conn.execute(
                "DELETE FROM lab_mock_fixtures WHERE fixture_id=?", (fixture_id,)
            )

    def _fixture_row_to_model(self, row: sqlite3.Row) -> MockFixture:
        raw_entries = _dec(row["entries"])
        entries = [MockFixtureEntry(**e) for e in raw_entries]
        return MockFixture(
            fixture_id=row["fixture_id"],
            name=row["name"],
            fallback_mode=row["fallback_mode"],
            entries=entries,
            created_at=datetime.fromisoformat(row["created_at"]),
        )

    # ─── Referential Integrity Helpers ────────────────────────────────────────

    def experiments_referencing_dataset(self, dataset_id: str, version: int) -> list[str]:
        rows = self._conn.execute(
            "SELECT DISTINCT r.experiment_id FROM lab_runs r "
            "JOIN lab_tasks t ON t.task_id=r.task_id "
            "WHERE t.dataset_id=? AND t.dataset_version=?",
            (dataset_id, version),
        ).fetchall()
        return [r["experiment_id"] for r in rows]

    def experiments_referencing_mcp_version(self, mcp_version_id: str) -> list[str]:
        rows = self._conn.execute(
            "SELECT DISTINCT experiment_id FROM lab_runs WHERE mcp_version_id=?",
            (mcp_version_id,),
        ).fetchall()
        return [r["experiment_id"] for r in rows]
