"""RunExecutor — parallel execution engine for Lab experiment runs."""

from __future__ import annotations

import asyncio
import os
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any
from uuid import uuid4

from config import LLMConfig
from core.event_bus import EventBus
from lab.mock_mcp import MockMCPServer
from lab.models import RunSpec, TraceEvent
from lab.store import LabStore
from llm.engine import LLMEngine
from mcp.client_manager import MCPClientManager

if TYPE_CHECKING:
    from lab.evaluation import EvaluationEngine

DEFAULT_MAX_PARALLEL = 8


class RunExecutor:
    def __init__(
        self,
        lab_store: LabStore,
        llm_engine: LLMEngine,
        mcp_manager: MCPClientManager,
        event_bus: EventBus,
        max_parallel: int = DEFAULT_MAX_PARALLEL,
    ) -> None:
        self._store = lab_store
        self._llm_engine = llm_engine
        self._mcp_manager = mcp_manager
        self._bus = event_bus
        self._semaphore = asyncio.Semaphore(max(1, max_parallel))
        self._eval_engine: EvaluationEngine | None = None
        self._cancelled: set[str] = set()  # experiment_ids that have been cancelled

    def set_eval_engine(self, eval_engine: "EvaluationEngine") -> None:
        self._eval_engine = eval_engine

    # ─── Public API ───────────────────────────────────────────────────────────

    async def execute_experiment(
        self, experiment_id: str, runs: list[RunSpec]
    ) -> None:
        """Execute all runs in the matrix; update experiment status when done."""
        await asyncio.to_thread(
            self._store.set_experiment_status, experiment_id, "running"
        )
        tasks = [
            asyncio.create_task(self._guarded_run(experiment_id, spec))
            for spec in runs
        ]
        await asyncio.gather(*tasks, return_exceptions=True)

        # Determine final status
        if experiment_id in self._cancelled:
            self._cancelled.discard(experiment_id)
            final_status = "cancelled"
        else:
            final_status = "completed"

        await asyncio.to_thread(
            self._store.set_experiment_status,
            experiment_id,
            final_status,
            datetime.now(timezone.utc).isoformat(),
        )

    async def cancel_experiment(self, experiment_id: str) -> None:
        """Signal cancellation; in-flight runs will finish, pending ones won't start."""
        self._cancelled.add(experiment_id)
        await asyncio.to_thread(
            self._store.set_experiment_status, experiment_id, "cancelled",
            datetime.now(timezone.utc).isoformat(),
        )

    async def rerun(self, run_id: str) -> RunSpec | None:
        """Create a new Run with identical config but a new run_id. Does not overwrite original."""
        run_row = await asyncio.to_thread(self._store.get_run_row, run_id)
        if run_row is None:
            raise KeyError(f"Run {run_id!r} not found")

        # Resolve the full RunSpec from store components
        spec = await self._load_run_spec(run_row)
        if spec is None:
            raise ValueError(f"Could not reconstruct RunSpec for run {run_id!r}")

        new_spec = RunSpec(
            run_id=str(uuid4()),
            experiment_id=spec.experiment_id,
            task=spec.task,
            llm_config=spec.llm_config,
            mcp_version=spec.mcp_version,
            tool_variant=spec.tool_variant,
            workflow_config=spec.workflow_config,
        )
        await asyncio.to_thread(self._store.create_runs, [new_spec])
        asyncio.create_task(
            self._guarded_run(new_spec.experiment_id, new_spec)
        )
        return new_spec

    # ─── Execution internals ──────────────────────────────────────────────────

    async def _guarded_run(self, experiment_id: str, spec: RunSpec) -> None:
        """Execute a single run inside the semaphore; never raises."""
        if experiment_id in self._cancelled:
            await asyncio.to_thread(
                self._store.set_run_status, spec.run_id, "cancelled"
            )
            return

        async with self._semaphore:
            if experiment_id in self._cancelled:
                await asyncio.to_thread(
                    self._store.set_run_status, spec.run_id, "cancelled"
                )
                return
            try:
                timeout = spec.workflow_config.timeout_seconds
                await asyncio.wait_for(self._execute_run(spec), timeout=timeout)
            except asyncio.TimeoutError:
                await self._handle_timeout(spec)
            except Exception as exc:
                await self._handle_failure(spec, exc)
            finally:
                await self._emit_progress(experiment_id)

    async def _execute_run(self, spec: RunSpec) -> None:
        run_id = spec.run_id
        recorder = _LabTraceRecorder(run_id, self._store)

        # Preflight: check API key
        if spec.llm_config.api_key_env:
            if not os.environ.get(spec.llm_config.api_key_env):
                raise RuntimeError(
                    f"API key env var {spec.llm_config.api_key_env!r} is not set"
                )

        # Mark running
        await asyncio.to_thread(
            self._store.set_run_status,
            run_id, "running",
            datetime.now(timezone.utc).isoformat(),
        )

        # Build per-run LLMConfig
        llm_config = self._build_llm_config(spec)

        # Record system + user prompt events
        await asyncio.to_thread(
            recorder.append,
            "system_prompt",
            {"content": spec.workflow_config.system_prompt or llm_config.system_prompt},
        )
        await asyncio.to_thread(
            recorder.append,
            "user_prompt",
            {"content": spec.task.prompt},
        )

        # Wire trace recorder to bus (capture LLM/MCP events)
        async def capture_event(event: Any) -> None:
            if event.session_id == run_id:
                await asyncio.to_thread(
                    recorder.append,
                    str(event.event_type.value if hasattr(event.event_type, "value") else event.event_type),
                    dict(event.payload),
                )

        unsub = self._bus.subscribe(capture_event)

        try:
            # Check if this is a mock run
            is_mock = spec.mcp_version.transport == "mock"

            if is_mock:
                await self._execute_mock_run(spec, llm_config, recorder)
            else:
                # Build a scoped LLMEngine that uses the spec's LLMConfig
                scoped_engine = LLMEngine(
                    config=llm_config,
                    bus=self._bus,
                    tool_bridge=self._llm_engine.tool_bridge,
                    max_tool_rounds=spec.workflow_config.max_turns,
                )

                # Create an isolated session for this run
                from replay.event_store import EventStore
                from core.event_bus import EventBus as _EB

                # Use the run_id as the session_id so events are scoped
                await _ensure_session(self._store._conn, run_id)

                await scoped_engine.handle_user_message(
                    session_id=run_id,
                    content=spec.task.prompt,
                    config_override=llm_config,
                )

        finally:
            unsub()

        # Success path
        await asyncio.to_thread(self._store.seal_trace, run_id)
        await asyncio.to_thread(
            self._store.set_run_status,
            run_id, "completed",
            None,
            datetime.now(timezone.utc).isoformat(),
        )

        # Trigger evaluation
        if self._eval_engine is not None:
            try:
                await self._eval_engine.evaluate(run_id)
            except Exception:
                pass

    async def _execute_mock_run(
        self,
        spec: RunSpec,
        llm_config: LLMConfig,
        recorder: "_LabTraceRecorder",
    ) -> None:
        """Execute a run against the MockMCPServer."""
        fixture_id = spec.mcp_version.connection_config.get("fixture_id")
        if not fixture_id:
            raise ValueError(
                "Mock MCP version requires 'fixture_id' in connection_config"
            )
        fixture = await asyncio.to_thread(self._store.get_fixture, fixture_id)
        if fixture is None:
            raise ValueError(f"Fixture {fixture_id!r} not found")

        mock_server = MockMCPServer(fixture)

        # Build synthetic tool catalog with variant overrides applied
        tools = mock_server.list_tools()
        if spec.tool_variant:
            tools = _apply_tool_variant(tools, spec.tool_variant)

        # Simulate a single-turn interaction (mock runs don't use real LLM)
        await asyncio.to_thread(
            recorder.append,
            "mock_run_start",
            {"tool_count": len(tools), "task_prompt": spec.task.prompt},
        )

        # For mock runs we record a simulated llm_end event so evaluation can work
        await asyncio.to_thread(
            recorder.append,
            "llm_end",
            {
                "assistant_message": {"role": "assistant", "content": "[mock run — no LLM call]"},
                "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
                "latency_ms": 0.0,
            },
        )

        # Record mock call log
        await asyncio.to_thread(
            recorder.append,
            "mock_call_log",
            {"calls": mock_server.get_call_log()},
        )

    async def _handle_failure(self, spec: RunSpec, exc: Exception) -> None:
        run_id = spec.run_id
        recorder = _LabTraceRecorder(run_id, self._store)
        try:
            await asyncio.to_thread(
                recorder.append,
                "error",
                {"source": "run_executor", "message": str(exc)},
            )
        except Exception:
            pass
        try:
            await asyncio.to_thread(self._store.seal_trace, run_id)
        except Exception:
            pass
        await asyncio.to_thread(
            self._store.set_run_status,
            run_id, "failed",
            None,
            datetime.now(timezone.utc).isoformat(),
        )

    async def _handle_timeout(self, spec: RunSpec) -> None:
        run_id = spec.run_id
        recorder = _LabTraceRecorder(run_id, self._store)
        try:
            await asyncio.to_thread(
                recorder.append,
                "error",
                {
                    "source": "run_executor",
                    "message": f"Run timed out after {spec.workflow_config.timeout_seconds}s",
                },
            )
        except Exception:
            pass
        try:
            await asyncio.to_thread(self._store.seal_trace, run_id)
        except Exception:
            pass
        await asyncio.to_thread(
            self._store.set_run_status,
            run_id, "timed_out",
            None,
            datetime.now(timezone.utc).isoformat(),
        )

    async def _emit_progress(self, experiment_id: str) -> None:
        try:
            counts = await asyncio.to_thread(
                self._store.get_run_counts, experiment_id
            )
            await self._bus.publish(
                "lab_run_progress",
                "system",
                {
                    "experiment_id": experiment_id,
                    "completed": counts.get("completed", 0),
                    "in_progress": counts.get("running", 0),
                    "failed": counts.get("failed", 0) + counts.get("timed_out", 0),
                    "pending": counts.get("pending", 0),
                },
            )
        except Exception:
            pass

    def _build_llm_config(self, spec: RunSpec) -> LLMConfig:
        mc = spec.llm_config
        wc = spec.workflow_config
        system = wc.system_prompt or mc.system_prompt or self._llm_engine.config.system_prompt
        return LLMConfig(
            provider=mc.provider,  # type: ignore[arg-type]
            model=mc.model,
            api_key_env=mc.api_key_env,
            api_base=mc.api_base,
            temperature=mc.temperature,
            max_tokens=mc.max_tokens,
            system_prompt=system,
        )

    async def _load_run_spec(self, run_row: dict[str, Any]) -> RunSpec | None:
        task_row = self._store._conn.execute(
            "SELECT * FROM lab_tasks WHERE task_id=?", (run_row["task_id"],)
        ).fetchone()
        dataset_row = self._store._conn.execute(
            "SELECT * FROM lab_datasets WHERE dataset_id=? AND version=?",
            (task_row["dataset_id"], task_row["dataset_version"]),
        ).fetchone() if task_row else None
        if task_row is None or dataset_row is None:
            return None

        import orjson
        from lab.models import Task, TaskExpectedOutcome

        task = Task(
            task_id=task_row["task_id"],
            dataset_id=task_row["dataset_id"],
            dataset_version=task_row["dataset_version"],
            prompt=task_row["prompt"],
            expected=TaskExpectedOutcome(
                tool_calls=orjson.loads(task_row["expected_tool_calls"]),
                assertions=orjson.loads(task_row["expected_assertions"]),
                tool_calls_ordered=bool(task_row["tool_calls_ordered"]),
            ),
        )
        mc = await asyncio.to_thread(
            self._store.get_model_config, run_row["model_config_id"]
        )
        mv = await asyncio.to_thread(
            self._store.get_mcp_version, run_row["mcp_version_id"]
        )
        tv = (
            await asyncio.to_thread(
                self._store.get_tool_variant, run_row["tool_variant_id"]
            )
            if run_row.get("tool_variant_id")
            else None
        )
        wc = await asyncio.to_thread(
            self._store.get_workflow_config, run_row["workflow_config_id"]
        )
        if mc is None or mv is None or wc is None:
            return None

        return RunSpec(
            run_id=str(uuid4()),
            experiment_id=run_row["experiment_id"],
            task=task,
            llm_config=mc,
            mcp_version=mv,
            tool_variant=tv,
            workflow_config=wc,
        )


# ─── Trace recorder ───────────────────────────────────────────────────────────


class _LabTraceRecorder:
    def __init__(self, run_id: str, store: LabStore) -> None:
        self._run_id = run_id
        self._store = store

    def append(self, event_type: str, payload: dict[str, Any]) -> None:
        seq = self._store.next_trace_seq(self._run_id)
        event = TraceEvent(
            run_id=self._run_id,
            seq=seq,
            event_type=event_type,
            payload=payload,
        )
        try:
            self._store.append_trace_event(event)
        except ValueError:
            pass  # Already sealed — ignore late stragglers


# ─── Helpers ──────────────────────────────────────────────────────────────────


def _apply_tool_variant(
    tools: list[dict[str, Any]], variant: Any
) -> list[dict[str, Any]]:
    """Return tools list with the variant's description/schema applied."""
    result = []
    for tool in tools:
        if tool.get("name") == variant.tool_name:
            patched = dict(tool)
            patched["description"] = variant.description
            if variant.input_schema is not None:
                patched["inputSchema"] = variant.input_schema
            result.append(patched)
        else:
            result.append(tool)
    return result


async def _ensure_session(conn: Any, session_id: str) -> None:
    """Create a minimal session row so the EventStore FK constraint is satisfied."""
    import asyncio as _asyncio
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc).isoformat()
    try:
        conn.execute(
            "INSERT OR IGNORE INTO sessions (session_id, title, created_at, metadata) "
            "VALUES (?, ?, ?, ?)",
            (session_id, f"Lab Run {session_id[:8]}", now, b"{}"),
        )
    except Exception:
        pass
