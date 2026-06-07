from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path
from typing import Any
from uuid import uuid4

import litellm
from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from config import AppConfig, LLMConfig, MCPServerConfig
from core.event_bus import EventBus
from core.event_model import EventType, HermesEvent
from core.session_store import SessionStore
from core.telemetry import TelemetryService
from lab.bridge import LabBridge
from lab.dataset import DatasetManager
from lab.evaluation import EvaluationEngine
from lab.executor import RunExecutor
from lab.matrix import MatrixEngine
from lab.registry import MCPVersionRegistry
from lab.regression import RegressionDetector
from lab.store import LabStore
from llm.engine import LLMEngine
from llm.tool_bridge import ToolBridge
from mcp.client_manager import MCPClientManager
from mcp.inspector import MCPInspector
from mcp.tool_router import ToolRouter
from replay.engine import ReplayEngine
from replay.event_store import EventStore

logger = logging.getLogger(__name__)


class SessionCreateRequest(BaseModel):
    title: str | None = None


class SessionUpdateRequest(BaseModel):
    title: str = Field(min_length=1)


class SessionDuplicateRequest(BaseModel):
    title: str | None = None


class ChatAttachment(BaseModel):
    name: str = Field(min_length=1)
    mime_type: str = "text/plain"
    size_bytes: int = 0
    content: str = ""
    truncated: bool = False


class ChatRequest(BaseModel):
    session_id: str
    message: str = ""
    attachments: list[ChatAttachment] = Field(default_factory=list)


class BranchRequest(BaseModel):
    source_session_id: str
    event_id: str
    title: str | None = None


class ReplayToolRequest(BaseModel):
    event_id: str
    session_id: str | None = None


class ToolRunRequest(BaseModel):
    session_id: str
    tool_name: str = Field(min_length=1)
    arguments: dict[str, Any] = Field(default_factory=dict)
    preferred_server: str | None = None


class BenchmarkTargetRequest(BaseModel):
    label: str | None = None
    model: str = Field(min_length=1)
    provider: str | None = None
    api_base: str | None = None
    api_key_env: str | None = None
    cli_command: str | None = None
    cli_args: list[str] = Field(default_factory=list)
    temperature: float | None = None
    top_p: float | None = None
    presence_penalty: float | None = None
    frequency_penalty: float | None = None
    max_tokens: int | None = None
    timeout_seconds: float | None = None
    system_prompt: str | None = None


class BenchmarkRunRequest(BaseModel):
    session_id: str
    message: str = ""
    attachments: list[ChatAttachment] = Field(default_factory=list)
    targets: list[BenchmarkTargetRequest] = Field(min_length=2, max_length=6)


class ConfigUpdateRequest(BaseModel):
    llm: LLMConfig
    llm_profiles: dict[str, LLMConfig] = Field(default_factory=dict)
    default_llm_profile: str | None = None


class MCPServerCreateRequest(BaseModel):
    name: str = Field(min_length=1)
    transport: str
    command: str | None = None
    args: list[str] = Field(default_factory=list)
    cwd: str | None = None
    env: dict[str, str] = Field(default_factory=dict)
    url: str | None = None
    headers: dict[str, str] = Field(default_factory=dict)
    timeout_seconds: float = 30.0
    enabled: bool = True


class MCPServerUpdateRequest(BaseModel):
    transport: str | None = None
    command: str | None = None
    args: list[str] | None = None
    cwd: str | None = None
    env: dict[str, str] | None = None
    url: str | None = None
    headers: dict[str, str] | None = None
    timeout_seconds: float | None = None
    enabled: bool | None = None


class WorkbenchBridge:
    def __init__(self, config: AppConfig, config_path: Path, workspace_root: Path) -> None:
        self.config = config
        self.config_path = config_path
        self.workspace_root = workspace_root
        self.store = EventStore(config.ensure_dirs(workspace_root))
        self.bus = EventBus(self.store)
        self.sessions = SessionStore(self.store)
        self.telemetry = TelemetryService()
        self.inspector = MCPInspector()
        self.router = ToolRouter()
        self.mcp_manager = MCPClientManager(config.mcp_servers, self.bus, self.router, self.inspector)
        self.tool_bridge = ToolBridge(self.store, self.mcp_manager)
        self.llm_engine = LLMEngine(config.llm, self.bus, self.tool_bridge)
        self.replay = ReplayEngine(self.store, self.sessions, self.bus)

        # ── Lab subsystem ──────────────────────────────────────────────────────
        self.lab_store = LabStore(self.store._conn, self.store._lock)
        self.lab_store.migrate()
        self.lab_datasets = DatasetManager(self.lab_store)
        self.lab_registry = MCPVersionRegistry(self.lab_store, self.mcp_manager)
        self.lab_matrix = MatrixEngine(self.lab_store)
        self.lab_executor = RunExecutor(
            self.lab_store, self.llm_engine, self.mcp_manager, self.bus
        )
        self.lab_eval = EvaluationEngine(self.lab_store)
        self.lab_regression = RegressionDetector(self.lab_store)
        self.lab_eval.set_regression_detector(self.lab_regression)
        self.lab_executor.set_eval_engine(self.lab_eval)

        self.websockets: set[WebSocket] = set()
        self.tasks: set[asyncio.Task[Any]] = set()
        self._started = False

        self.bus.subscribe(self.telemetry.handle_event)
        self.bus.subscribe(self.inspector.handle_event)
        self.bus.subscribe(self._broadcast_event)

        app = FastAPI(title="Hermes Workbench", version="0.1.0")
        app.add_middleware(
            CORSMiddleware,
            allow_origins=["*"],
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

        # Mount Lab API router
        lab_bridge = LabBridge(
            self.lab_store,
            self.lab_datasets,
            self.lab_registry,
            self.lab_matrix,
            self.lab_executor,
            self.lab_eval,
            self.lab_regression,
        )
        app.include_router(lab_bridge.router)

        @app.on_event("startup")
        async def startup() -> None:
            await self.startup()

        @app.on_event("shutdown")
        async def shutdown() -> None:
            await self.shutdown()

        @app.get("/api/health")
        async def health() -> dict[str, Any]:
            return {
                "status": "ok",
                "servers": self.mcp_manager.server_status(),
                "tools": len(self.mcp_manager.list_tools()),
            }

        @app.get("/api/bootstrap")
        async def bootstrap(session_id: str | None = Query(default=None)) -> dict[str, Any]:
            return await self.bootstrap_state(session_id=session_id)

        @app.get("/api/config")
        async def get_config() -> dict[str, Any]:
            return self.config.model_dump_public()

        @app.put("/api/config")
        async def update_config(request: ConfigUpdateRequest) -> dict[str, Any]:
            default_profile = str(request.default_llm_profile or self.config.default_llm_profile).strip()
            profiles = dict(request.llm_profiles) if request.llm_profiles else dict(self.config.llm_profiles)

            if request.llm_profiles and default_profile not in profiles:
                raise HTTPException(status_code=400, detail=f"Default AI profile '{default_profile}' was not provided")

            if not profiles:
                profiles = {default_profile or "Primary AI": request.llm}

            active_profile = default_profile or next(iter(profiles.keys()))
            profiles[active_profile] = request.llm
            self.config.set_llm_profiles(profiles, active_profile)
            self.llm_engine.config = self.config.llm
            self.config.save(self.config_path)
            return self.config.model_dump_public()

        @app.put("/api/config/general")
        async def update_general_config(request: dict[str, Any]) -> dict[str, Any]:
            if "skip_ssl_verify" in request:
                self.config.skip_ssl_verify = bool(request["skip_ssl_verify"])
            self.config.save(self.config_path)
            # Apply SSL setting immediately
            if self.config.skip_ssl_verify:
                from llm.engine import LLMEngine
                LLMEngine._disable_ssl_verification()
            return {"skip_ssl_verify": self.config.skip_ssl_verify}

        @app.post("/api/config/test/llm")
        async def test_llm(request: ConfigUpdateRequest) -> dict[str, Any]:
            try:
                import logging
                logger = logging.getLogger(__name__)
                logger.info(f"Test LLM request: provider={request.llm.provider}, model={request.llm.model}, api_key_env={request.llm.api_key_env[:10] if request.llm.api_key_env else 'None'}...")
                return await self.llm_engine.test_config(request.llm)
            except Exception as exc:
                import logging
                import traceback
                logger = logging.getLogger(__name__)
                logger.error(f"Test LLM failed: {type(exc).__name__}: {exc}")
                logger.error(f"Traceback: {traceback.format_exc()}")
                raise HTTPException(status_code=400, detail=str(exc)) from exc

        @app.post("/api/config/mcp-server")
        async def add_mcp_server(request: MCPServerCreateRequest) -> dict[str, Any]:
            server_config = MCPServerConfig.model_validate(request.model_dump(exclude={"name"}))
            await self.mcp_manager.disconnect_server(request.name)
            self.config.mcp_servers[request.name] = server_config
            self.mcp_manager.server_configs[request.name] = server_config
            self.config.save(self.config_path)
            await self.mcp_manager.connect_server(request.name, server_config, session_id="system")
            tools = await self.mcp_manager.refresh_tools(session_id="system")
            return {
                "config": self.config.model_dump_public(),
                "servers": self.mcp_manager.server_status(),
                "tools": tools,
            }

        @app.delete("/api/config/mcp-server/{server_name}")
        async def delete_mcp_server(server_name: str) -> dict[str, Any]:
            if server_name not in self.config.mcp_servers:
                raise HTTPException(status_code=404, detail=f"Server '{server_name}' not found")

            await self.mcp_manager.disconnect_server(server_name)
            del self.config.mcp_servers[server_name]
            if server_name in self.mcp_manager.server_configs:
                del self.mcp_manager.server_configs[server_name]
            self.config.save(self.config_path)

            # Refresh tools after deletion
            tools = await self.mcp_manager.refresh_tools(session_id="system")
            return {
                "config": self.config.model_dump_public(),
                "servers": self.mcp_manager.server_status(),
                "tools": tools,
            }

        @app.patch("/api/config/mcp-server/{server_name}")
        async def update_mcp_server(server_name: str, request: MCPServerUpdateRequest) -> dict[str, Any]:
            if server_name not in self.config.mcp_servers:
                raise HTTPException(status_code=404, detail=f"Server '{server_name}' not found")

            payload = self.config.mcp_servers[server_name].model_dump()
            payload.update(request.model_dump(exclude_unset=True))
            server_config = MCPServerConfig.model_validate(payload)

            await self.mcp_manager.disconnect_server(server_name)
            self.config.mcp_servers[server_name] = server_config
            self.mcp_manager.server_configs[server_name] = server_config
            self.config.save(self.config_path)

            if server_config.enabled:
                await self.mcp_manager.connect_server(server_name, server_config, session_id="system")

            tools = await self.mcp_manager.refresh_tools(session_id="system")
            return {
                "config": self.config.model_dump_public(),
                "servers": self.mcp_manager.server_status(),
                "tools": tools,
            }

        @app.post("/api/config/test/mcp")
        async def test_mcp() -> dict[str, Any]:
            tools = await self.mcp_manager.refresh_tools(session_id="system")
            servers = self.mcp_manager.server_status()
            return {
                "ok": bool(servers) and all(server["connected"] and not server["error"] for server in servers),
                "servers": servers,
                "tool_count": len(tools),
            }

        @app.post("/api/sessions")
        async def create_session(request: SessionCreateRequest) -> dict[str, Any]:
            session = await self.sessions.create_session(title=request.title)
            return {"session": session, "bootstrap": await self.bootstrap_state(session["session_id"])}

        @app.patch("/api/sessions/{session_id}")
        async def rename_session(session_id: str, request: SessionUpdateRequest) -> dict[str, Any]:
            session = await self.sessions.rename_session(session_id, request.title.strip())
            if session is None:
                raise HTTPException(status_code=404, detail="Session not found")
            return {"session": session}

        @app.delete("/api/sessions/{session_id}")
        async def delete_session(session_id: str) -> dict[str, Any]:
            existing = await self.sessions.get_session(session_id)
            if existing is None:
                raise HTTPException(status_code=404, detail="Session not found")
            await self.sessions.delete_session(session_id)
            return {"deleted": True, "session_id": session_id}

        @app.post("/api/sessions/{session_id}/duplicate")
        async def duplicate_session(session_id: str, request: SessionDuplicateRequest) -> dict[str, Any]:
            source = await self.sessions.get_session(session_id)
            if source is None:
                raise HTTPException(status_code=404, detail="Session not found")
            session = await self.replay.duplicate_session(session_id, title=request.title)
            return {"session": session, "bootstrap": await self.bootstrap_state(session["session_id"])}

        @app.get("/api/sessions/{session_id}/events")
        async def session_events(session_id: str) -> dict[str, Any]:
            events = await self.replay.list_events(session_id)
            return {"events": [event.model_dump(mode="json") for event in events]}

        @app.post("/api/chat")
        async def chat(request: ChatRequest) -> dict[str, Any]:
            if not request.message.strip() and not request.attachments:
                raise HTTPException(status_code=400, detail="Message or attachment is required")
            self._schedule(self._run_chat(request.session_id, request.message.strip(), request.attachments))
            return {"accepted": True, "session_id": request.session_id}

        @app.post("/api/tools/run")
        async def run_tool(request: ToolRunRequest) -> dict[str, Any]:
            try:
                result = await self.mcp_manager.call_tool(
                    session_id=request.session_id,
                    tool_name=request.tool_name,
                    arguments=request.arguments,
                    preferred_server=request.preferred_server,
                )
            except KeyError as exc:
                raise HTTPException(status_code=404, detail=str(exc)) from exc
            except Exception as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc
            return {"result": result}

        @app.post("/api/benchmarks/run")
        async def run_benchmark(request: BenchmarkRunRequest) -> dict[str, Any]:
            source_session = await self.sessions.get_session(request.session_id)
            if source_session is None:
                raise HTTPException(status_code=404, detail="Session not found")
            if not request.message.strip() and not request.attachments:
                raise HTTPException(status_code=400, detail="Message or attachment is required")

            benchmark = await self._run_benchmark(request.session_id, request.message.strip(), request.attachments, request.targets)
            return benchmark

        @app.get("/api/benchmarks/report")
        async def benchmark_report(session_id: str, group_id: str | None = None) -> dict[str, Any]:
            try:
                return await self._build_benchmark_report(session_id, group_id=group_id)
            except LookupError as exc:
                raise HTTPException(status_code=404, detail=str(exc)) from exc

        @app.post("/api/replay/branch")
        async def branch(request: BranchRequest) -> dict[str, Any]:
            session = await self.replay.branch_session(
                request.source_session_id,
                request.event_id,
                title=request.title,
            )
            return {"session": session, "bootstrap": await self.bootstrap_state(session["session_id"])}

        @app.get("/api/replay/step")
        async def replay_step(session_id: str, cursor: int = 0, step: int = 1) -> dict[str, Any]:
            return await self.replay.step_events(session_id, cursor=cursor, step=step)

        @app.post("/api/replay/tool")
        async def replay_tool(request: ReplayToolRequest) -> dict[str, Any]:
            event = await asyncio.to_thread(self.store.get_event, request.event_id)
            if event is None or event.event_type != EventType.TOOL_CALL_END:
                raise HTTPException(status_code=404, detail="Replayable tool event not found")

            payload = event.payload
            result = await self.mcp_manager.call_tool(
                session_id=request.session_id or event.session_id,
                tool_name=payload["qualified_name"],
                arguments=payload.get("arguments", {}),
            )
            return {"result": result}

        @app.post("/api/mcp/refresh")
        async def refresh_tools() -> dict[str, Any]:
            tools = await self.mcp_manager.refresh_tools()
            return {"tools": tools, "servers": self.mcp_manager.server_status()}

        # ── Keystore (secure secret storage) ─────────────────────────────────

        @app.get("/api/keystore")
        async def list_secrets() -> dict[str, Any]:
            """List stored secret names (not values)."""
            return {"keys": self.llm_engine.keystore.list_names()}

        @app.post("/api/keystore")
        async def store_secret(request: dict[str, Any]) -> dict[str, Any]:
            """Store a secret. Body: {"name": "KEY_NAME", "value": "secret_value"}"""
            name = str(request.get("name") or "").strip()
            value = str(request.get("value") or "").strip()
            if not name:
                raise HTTPException(status_code=400, detail="Secret name is required.")
            if not value:
                raise HTTPException(status_code=400, detail="Secret value is required.")
            self.llm_engine.keystore.set(name, value)
            return {"stored": True, "name": name}

        @app.delete("/api/keystore/{secret_name}")
        async def delete_secret(secret_name: str) -> dict[str, Any]:
            """Delete a stored secret by name."""
            deleted = self.llm_engine.keystore.delete(secret_name)
            if not deleted:
                raise HTTPException(status_code=404, detail=f"Secret '{secret_name}' not found.")
            return {"deleted": True, "name": secret_name}

        @app.get("/api/keystore/{secret_name}/check")
        async def check_secret(secret_name: str) -> dict[str, Any]:
            """Check if a secret exists and is resolvable (without revealing it)."""
            resolved = self.llm_engine.keystore.resolve(secret_name)
            return {
                "name": secret_name,
                "exists": resolved is not None,
                "source": "keystore" if self.llm_engine.keystore.has(secret_name)
                          else "env" if os.getenv(secret_name)
                          else "raw" if resolved
                          else "none",
            }

        @app.websocket("/ws")
        async def websocket_endpoint(websocket: WebSocket) -> None:
            await websocket.accept()
            self.websockets.add(websocket)
            try:
                await websocket.send_json({"type": "bootstrap", "payload": await self.bootstrap_state()})
                while True:
                    await websocket.receive_text()
            except WebSocketDisconnect:
                self.websockets.discard(websocket)
            finally:
                self.websockets.discard(websocket)

        self.app = app

    async def startup(self) -> None:
        if self._started:
            return
        self._started = True

        logger.info("Starting Hermes Workbench Bridge")

        # Ensure system session exists
        await self.sessions.ensure_system_session()

        # Check for corrupted sessions
        corrupted = await self.sessions.cleanup_corrupted_sessions()
        if corrupted:
            logger.warning(f"Found {len(corrupted)} corrupted sessions: {corrupted}")

        # Ensure at least one user session exists
        session_list = [session for session in await self.sessions.list_sessions() if session["session_id"] != "system"]
        if not session_list:
            logger.info("No user sessions found, creating Primary Session")
            await self.sessions.create_session(title="Primary Session")

        # Connect MCP servers
        try:
            await self.mcp_manager.connect_all(session_id="system")
            logger.info("MCP servers connected successfully")
        except Exception as e:
            logger.error(f"Failed to connect MCP servers: {e}", exc_info=True)

    async def shutdown(self) -> None:
        await self.mcp_manager.close()
        self.store.close()
        for task in list(self.tasks):
            task.cancel()

    async def bootstrap_state(self, session_id: str | None = None) -> dict[str, Any]:
        sessions = [session for session in await self.sessions.list_sessions() if session["session_id"] != "system"]
        active_session_id = session_id or (sessions[0]["session_id"] if sessions else None)
        events: list[HermesEvent] = []
        if active_session_id:
            events = await self.replay.list_events(active_session_id)

        return {
            "config": self.config.model_dump_public(),
            "active_session_id": active_session_id,
            "sessions": sessions,
            "servers": self.mcp_manager.server_status(),
            "tools": self.mcp_manager.list_tools(),
            "telemetry": self.telemetry.snapshot(),
            "inspector": self.inspector.snapshot(active_session_id),
            "events": [event.model_dump(mode="json") for event in events],
        }

    async def _run_chat(
        self,
        session_id: str,
        message: str,
        attachments: list[ChatAttachment],
        llm_config: LLMConfig | None = None,
    ) -> None:
        try:
            attachment_payloads = [attachment.model_dump(mode="json") for attachment in attachments]
            await self.llm_engine.handle_user_message(
                session_id,
                message,
                attachments=attachment_payloads,
                display_content=_build_user_display_content(message, attachment_payloads),
                config_override=llm_config,
            )
        except Exception as exc:
            await self.bus.publish(
                EventType.ERROR,
                session_id,
                {"source": "chat", "message": str(exc)},
            )

    async def _broadcast_event(self, event: HermesEvent) -> None:
        if not self.websockets:
            return
        payload = {"type": "event", "payload": event.model_dump(mode="json")}
        stale: list[WebSocket] = []
        for websocket in list(self.websockets):
            try:
                await websocket.send_json(payload)
            except RuntimeError:
                stale.append(websocket)
            except Exception:
                stale.append(websocket)
        for websocket in stale:
            self.websockets.discard(websocket)

    def _schedule(self, coroutine: Any) -> None:
        task = asyncio.create_task(coroutine)
        self.tasks.add(task)
        task.add_done_callback(self.tasks.discard)

    async def _run_benchmark(
        self,
        source_session_id: str,
        message: str,
        attachments: list[ChatAttachment],
        targets: list[BenchmarkTargetRequest],
    ) -> dict[str, Any]:
        source_session = await self.sessions.get_session(source_session_id)
        if source_session is None:
            raise LookupError("Source session not found")

        group_id = str(uuid4())
        source_events = await self.replay.list_events(source_session_id)
        source_event_count = len(source_events)
        source_metrics = self.telemetry.snapshot(source_session_id)
        prompt_preview = _build_user_display_content(message, [attachment.model_dump(mode="json") for attachment in attachments])
        created_sessions: list[dict[str, Any]] = []

        for target in targets:
            label, target_config = _merge_benchmark_target(self.config.llm, target)
            child = await self.replay.clone_session(
                source_session_id,
                title=f"{source_session['title']} • {label}",
                parent_session_id=source_session_id,
                metadata={
                    "kind": "benchmark_target",
                    "benchmark_group_id": group_id,
                    "benchmark_source_session_id": source_session_id,
                    "benchmark_source_event_count": source_event_count,
                    "benchmark_source_metrics": source_metrics,
                    "benchmark_prompt_preview": prompt_preview,
                    "benchmark_target": {
                        "label": label,
                        "model": target_config.model,
                        "provider": target_config.provider,
                    },
                },
            )
            created_sessions.append(child)
            self._schedule(self._run_chat(child["session_id"], message, attachments, llm_config=target_config))

        return {
            "group_id": group_id,
            "source_session_id": source_session_id,
            "sessions": created_sessions,
            "report": await self._build_benchmark_report(source_session_id, group_id=group_id),
        }

    async def _build_benchmark_report(self, session_id: str, group_id: str | None = None) -> dict[str, Any]:
        sessions = [session for session in await self.sessions.list_sessions() if session["session_id"] != "system"]
        current_session = next((session for session in sessions if session["session_id"] == session_id), None)
        if current_session is None:
            raise LookupError("Session not found")

        current_metadata = current_session.get("metadata") or {}
        if current_metadata.get("kind") == "benchmark_target":
            source_session_id = str(current_metadata.get("benchmark_source_session_id") or "")
            selected_group_id = group_id or str(current_metadata.get("benchmark_group_id") or "")
        else:
            source_session_id = session_id
            selected_group_id = group_id or ""

        benchmark_children = [
            session
            for session in sessions
            if (session.get("metadata") or {}).get("kind") == "benchmark_target"
            and str((session.get("metadata") or {}).get("benchmark_source_session_id") or "") == source_session_id
        ]
        if not benchmark_children:
            raise LookupError("No benchmark runs found for this conversation")

        if not selected_group_id:
            latest_session = max(benchmark_children, key=lambda session: str(session.get("updated_at") or session.get("created_at") or ""))
            selected_group_id = str((latest_session.get("metadata") or {}).get("benchmark_group_id") or "")

        grouped_children = [
            session
            for session in benchmark_children
            if str((session.get("metadata") or {}).get("benchmark_group_id") or "") == selected_group_id
        ]
        if not grouped_children:
            raise LookupError("Benchmark group not found")

        source_session = next((session for session in sessions if session["session_id"] == source_session_id), None)
        entries: list[dict[str, Any]] = []
        completed = True
        prompt_preview = str(((grouped_children[0].get("metadata") or {}).get("benchmark_prompt_preview")) or "")

        for child in grouped_children:
            metadata = child.get("metadata") or {}
            source_event_count = int(metadata.get("benchmark_source_event_count") or 0)
            baseline_metrics = metadata.get("benchmark_source_metrics") or self.telemetry.snapshot(source_session_id)
            events = await self.replay.list_events(child["session_id"])
            benchmark_events = events[source_event_count:]
            latest_llm_end = next((event for event in reversed(benchmark_events) if str(event.event_type) == EventType.LLM_END.value), None)
            latest_error = next((event for event in reversed(benchmark_events) if str(event.event_type) == EventType.ERROR.value), None)
            latest_llm_start = next((event for event in reversed(benchmark_events) if str(event.event_type) == EventType.LLM_START.value), None)
            response_text = ""
            if latest_llm_end is not None:
                response_text = str((latest_llm_end.payload.get("assistant_message") or {}).get("content") or "")

            status = "pending"
            if latest_error is not None:
                status = "error"
            elif latest_llm_end is not None:
                status = "completed"
            elif latest_llm_start is not None:
                status = "running"

            if status not in {"completed", "error"}:
                completed = False

            child_metrics = self.telemetry.snapshot(child["session_id"])
            metrics_delta = _subtract_metrics(child_metrics, baseline_metrics)
            entries.append(
                {
                    "session_id": child["session_id"],
                    "title": child["title"],
                    "updated_at": child.get("updated_at"),
                    "status": status,
                    "target": metadata.get("benchmark_target") or {},
                    "kpis": {
                        **metrics_delta,
                        "last_latency_ms": float((latest_llm_end.payload.get("latency_ms") if latest_llm_end else 0) or 0),
                        "response_chars": len(response_text),
                    },
                    "response_text": response_text,
                    "error_message": str(latest_error.payload.get("message") or "") if latest_error is not None else "",
                }
            )

        return {
            "group_id": selected_group_id,
            "source_session_id": source_session_id,
            "source_title": str(source_session.get("title") or source_session_id) if source_session else source_session_id,
            "prompt_preview": prompt_preview,
            "completed": completed,
            "entries": entries,
        }


def _build_user_display_content(message: str, attachments: list[dict[str, Any]]) -> str:
    summary_parts: list[str] = []
    if message:
        summary_parts.append(message)
    if attachments:
        names = ", ".join(str(attachment.get("name") or "attachment") for attachment in attachments)
        summary_parts.append(f"Attached: {names}")
    return "\n\n".join(summary_parts).strip()


def _merge_benchmark_target(base_config: LLMConfig, target: BenchmarkTargetRequest) -> tuple[str, LLMConfig]:
    payload = base_config.model_dump()
    overrides = target.model_dump(exclude_none=True, exclude_unset=True)
    label = str(overrides.pop("label", None) or overrides.get("model") or payload.get("model") or "Benchmark Target")
    payload.update(overrides)
    return label, LLMConfig.model_validate(payload)


def _subtract_metrics(current: dict[str, Any], baseline: dict[str, Any]) -> dict[str, Any]:
    numeric_keys = {
        "llm_calls",
        "tool_calls",
        "prompt_tokens",
        "completion_tokens",
        "total_tokens",
        "llm_latency_ms",
        "tool_latency_ms",
        "error_count",
    }
    baseline_applied = not any(
        float(current.get(key, 0) or 0) < float(baseline.get(key, 0) or 0)
        for key in {"llm_calls", "tool_calls", "prompt_tokens", "completion_tokens", "total_tokens"}
    )
    delta: dict[str, Any] = {}
    for key in numeric_keys:
        current_value = float(current.get(key, 0) or 0)
        baseline_value = float(baseline.get(key, 0) or 0)
        delta[key] = max(0.0, current_value - baseline_value) if baseline_applied else current_value

    delta["avg_llm_latency_ms"] = delta["llm_latency_ms"] / delta["llm_calls"] if delta["llm_calls"] else 0.0
    delta["avg_tool_latency_ms"] = delta["tool_latency_ms"] / delta["tool_calls"] if delta["tool_calls"] else 0.0
    for key in ["llm_calls", "tool_calls", "prompt_tokens", "completion_tokens", "total_tokens", "error_count"]:
        delta[key] = int(delta[key])
    return delta
