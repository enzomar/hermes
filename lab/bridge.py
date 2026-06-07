"""LabBridge — FastAPI router for all /api/lab/* endpoints."""

from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from lab.dataset import DatasetManager
from lab.evaluation import EvaluationEngine
from lab.executor import RunExecutor
from lab.matrix import MatrixEngine
from lab.models import (
    ExperimentDefinition,
    LabModelConfig,
    MockFixture,
    MockFixtureEntry,
    WorkflowConfig,
)
from lab.registry import MCPVersionRegistry
from lab.regression import RegressionDetector
from lab.store import LabStore


# ─── Request models ───────────────────────────────────────────────────────────


class CreateDatasetRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str = ""
    tasks: list[dict[str, Any]] = Field(min_length=1)


class UpdateDatasetRequest(BaseModel):
    tasks: list[dict[str, Any]] = Field(min_length=1)
    description: str | None = None


class RegisterMCPVersionRequest(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    version_tag: str = Field(min_length=1, max_length=64)
    transport: str
    connection_config: dict[str, Any] = Field(default_factory=dict)


class RegisterToolVariantRequest(BaseModel):
    tool_name: str = Field(min_length=1)
    description: str = Field(min_length=1)
    input_schema: dict[str, Any] | None = None


class CreateModelConfigRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    provider: str = Field(min_length=1)
    model: str = Field(min_length=1)
    temperature: float = Field(default=0.0, ge=0.0, le=2.0)
    max_tokens: int = Field(default=4096, ge=1, le=128000)
    system_prompt: str = ""
    api_key_env: str | None = None
    api_base: str | None = None


class CreateWorkflowConfigRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    system_prompt: str = ""
    max_turns: int = Field(default=6, ge=1, le=50)
    timeout_seconds: float = Field(default=120.0, ge=5.0, le=3600.0)


class CreateExperimentRequest(BaseModel):
    name: str = Field(min_length=1)
    dataset_ids: list[list[Any]]  # [[dataset_id, version], ...]
    model_config_ids: list[str] = Field(min_length=1)
    mcp_version_ids: list[str] = Field(min_length=1)
    tool_variant_ids: list[str] = Field(default_factory=list)
    workflow_config_ids: list[str] = Field(min_length=1)
    fixture_id: str | None = None


class CreateFixtureRequest(BaseModel):
    name: str = Field(min_length=1)
    fallback_mode: str = "error"
    entries: list[dict[str, Any]] = Field(default_factory=list)


# ─── LabBridge ────────────────────────────────────────────────────────────────


class LabBridge:
    def __init__(
        self,
        lab_store: LabStore,
        dataset_manager: DatasetManager,
        registry: MCPVersionRegistry,
        matrix_engine: MatrixEngine,
        executor: RunExecutor,
        eval_engine: EvaluationEngine,
        regression_detector: RegressionDetector,
    ) -> None:
        self._store = lab_store
        self._datasets = dataset_manager
        self._registry = registry
        self._matrix = matrix_engine
        self._executor = executor
        self._eval = eval_engine
        self._regression = regression_detector

        router = APIRouter(prefix="/api/lab", tags=["lab"])
        self.router = router

        # ── Datasets ──────────────────────────────────────────────────────────

        @router.get("/datasets")
        async def list_datasets() -> dict[str, Any]:
            return {"datasets": await self._datasets.list()}

        @router.post("/datasets")
        async def create_dataset(req: CreateDatasetRequest) -> dict[str, Any]:
            dataset = await self._datasets.create(req.name, req.tasks, req.description)
            return {"dataset": dataset.model_dump(mode="json")}

        @router.get("/datasets/{dataset_id}/versions/{version}")
        async def get_dataset(dataset_id: str, version: int) -> dict[str, Any]:
            try:
                dataset = await self._datasets.get(dataset_id, version)
                return {"dataset": dataset.model_dump(mode="json")}
            except KeyError as exc:
                raise HTTPException(status_code=404, detail=str(exc)) from exc

        @router.put("/datasets/{dataset_id}")
        async def update_dataset(
            dataset_id: str, req: UpdateDatasetRequest
        ) -> dict[str, Any]:
            try:
                dataset = await self._datasets.update(
                    dataset_id, req.tasks, req.description
                )
                return {"dataset": dataset.model_dump(mode="json")}
            except KeyError as exc:
                raise HTTPException(status_code=404, detail=str(exc)) from exc

        @router.delete("/datasets/{dataset_id}/versions/{version}")
        async def delete_dataset_version(
            dataset_id: str, version: int
        ) -> dict[str, Any]:
            try:
                await self._datasets.delete_version(dataset_id, version)
                return {"deleted": True}
            except (KeyError, ValueError) as exc:
                raise HTTPException(status_code=409, detail=str(exc)) from exc

        @router.post("/datasets/import")
        async def import_dataset(payload: dict[str, Any]) -> dict[str, Any]:
            try:
                dataset = await self._datasets.import_json(payload)
                return {"dataset": dataset.model_dump(mode="json")}
            except (ValueError, KeyError) as exc:
                raise HTTPException(status_code=422, detail=str(exc)) from exc

        @router.get("/datasets/{dataset_id}/versions/{version}/export")
        async def export_dataset(dataset_id: str, version: int) -> dict[str, Any]:
            try:
                return await self._datasets.export_json(dataset_id, version)
            except KeyError as exc:
                raise HTTPException(status_code=404, detail=str(exc)) from exc

        # ── MCP Versions ──────────────────────────────────────────────────────

        @router.get("/mcp-versions")
        async def list_mcp_versions() -> dict[str, Any]:
            return {"mcp_versions": await self._registry.list()}

        @router.post("/mcp-versions")
        async def register_mcp_version(req: RegisterMCPVersionRequest) -> dict[str, Any]:
            try:
                reg = await self._registry.register(
                    req.name, req.version_tag, req.transport, req.connection_config
                )
                return {"mcp_version": reg.model_dump(mode="json")}
            except (ValueError, RuntimeError) as exc:
                raise HTTPException(status_code=422, detail=str(exc)) from exc

        @router.delete("/mcp-versions/{mcp_version_id}")
        async def delete_mcp_version(mcp_version_id: str) -> dict[str, Any]:
            try:
                await self._registry.delete(mcp_version_id)
                return {"deleted": True}
            except (KeyError, ValueError) as exc:
                raise HTTPException(status_code=409, detail=str(exc)) from exc

        @router.get("/mcp-versions/{mcp_version_id}/schema")
        async def get_mcp_schema(mcp_version_id: str) -> dict[str, Any]:
            try:
                return {"schema": await self._registry.get_schema(mcp_version_id)}
            except KeyError as exc:
                raise HTTPException(status_code=404, detail=str(exc)) from exc

        @router.post("/mcp-versions/{mcp_version_id}/tool-variants")
        async def register_tool_variant(
            mcp_version_id: str, req: RegisterToolVariantRequest
        ) -> dict[str, Any]:
            try:
                variant = await self._registry.register_tool_variant(
                    mcp_version_id, req.tool_name, req.description, req.input_schema
                )
                return {"tool_variant": variant.model_dump(mode="json")}
            except (KeyError, ValueError) as exc:
                raise HTTPException(status_code=422, detail=str(exc)) from exc

        @router.get("/mcp-versions/{mcp_version_id}/tool-variants")
        async def list_tool_variants(mcp_version_id: str) -> dict[str, Any]:
            return {
                "tool_variants": await self._registry.list_tool_variants(mcp_version_id)
            }

        # ── Model Configs ─────────────────────────────────────────────────────

        @router.get("/model-configs")
        async def list_model_configs() -> dict[str, Any]:
            configs = await asyncio.to_thread(self._store.list_model_configs)
            return {"model_configs": [c.model_dump(mode="json") for c in configs]}

        @router.post("/model-configs")
        async def create_model_config(req: CreateModelConfigRequest) -> dict[str, Any]:
            mc = LabModelConfig(
                name=req.name,
                provider=req.provider,
                model=req.model,
                temperature=req.temperature,
                max_tokens=req.max_tokens,
                system_prompt=req.system_prompt,
                api_key_env=req.api_key_env,
                api_base=req.api_base,
            )
            try:
                await asyncio.to_thread(self._store.create_model_config, mc)
            except Exception as exc:
                if "UNIQUE" in str(exc).upper():
                    raise HTTPException(
                        status_code=409,
                        detail=f"ModelConfig with name {req.name!r} already exists",
                    ) from exc
                raise HTTPException(status_code=422, detail=str(exc)) from exc
            return {"model_config": mc.model_dump(mode="json")}

        @router.delete("/model-configs/{model_config_id}")
        async def delete_model_config(model_config_id: str) -> dict[str, Any]:
            await asyncio.to_thread(self._store.delete_model_config, model_config_id)
            return {"deleted": True}

        # ── Workflow Configs ──────────────────────────────────────────────────

        @router.get("/workflow-configs")
        async def list_workflow_configs() -> dict[str, Any]:
            configs = await asyncio.to_thread(self._store.list_workflow_configs)
            return {"workflow_configs": [c.model_dump(mode="json") for c in configs]}

        @router.post("/workflow-configs")
        async def create_workflow_config(
            req: CreateWorkflowConfigRequest,
        ) -> dict[str, Any]:
            wc = WorkflowConfig(
                name=req.name,
                system_prompt=req.system_prompt,
                max_turns=req.max_turns,
                timeout_seconds=req.timeout_seconds,
            )
            try:
                await asyncio.to_thread(self._store.create_workflow_config, wc)
            except Exception as exc:
                if "UNIQUE" in str(exc).upper():
                    raise HTTPException(
                        status_code=409,
                        detail=f"WorkflowConfig with name {req.name!r} already exists",
                    ) from exc
                raise HTTPException(status_code=422, detail=str(exc)) from exc
            return {"workflow_config": wc.model_dump(mode="json")}

        @router.delete("/workflow-configs/{workflow_config_id}")
        async def delete_workflow_config(workflow_config_id: str) -> dict[str, Any]:
            await asyncio.to_thread(
                self._store.delete_workflow_config, workflow_config_id
            )
            return {"deleted": True}

        # ── Experiments ───────────────────────────────────────────────────────

        @router.get("/experiments")
        async def list_experiments() -> dict[str, Any]:
            return {
                "experiments": await asyncio.to_thread(self._store.list_experiments)
            }

        @router.post("/experiments")
        async def create_experiment(req: CreateExperimentRequest) -> dict[str, Any]:
            exp_def = ExperimentDefinition(
                name=req.name,
                dataset_ids=[(str(d[0]), int(d[1])) for d in req.dataset_ids],
                model_config_ids=req.model_config_ids,
                mcp_version_ids=req.mcp_version_ids,
                tool_variant_ids=req.tool_variant_ids,
                workflow_config_ids=req.workflow_config_ids,
                fixture_id=req.fixture_id,
            )
            try:
                experiment_id, runs = await self._matrix.create_experiment(
                    req.name, exp_def
                )
            except ValueError as exc:
                raise HTTPException(status_code=422, detail=str(exc)) from exc
            exp = await asyncio.to_thread(self._store.get_experiment, experiment_id)
            return {
                "experiment": exp,
                "run_count": len(runs),
            }

        @router.get("/experiments/{experiment_id}")
        async def get_experiment(experiment_id: str) -> dict[str, Any]:
            exp = await asyncio.to_thread(self._store.get_experiment, experiment_id)
            if exp is None:
                raise HTTPException(status_code=404, detail="Experiment not found")
            return {"experiment": exp}

        @router.get("/experiments/{experiment_id}/preview")
        async def preview_experiment(experiment_id: str) -> dict[str, Any]:
            exp = await asyncio.to_thread(self._store.get_experiment, experiment_id)
            if exp is None:
                raise HTTPException(status_code=404, detail="Experiment not found")
            runs = await asyncio.to_thread(self._store.list_runs, experiment_id)
            return {"experiment": exp, "runs": runs, "run_count": len(runs)}

        @router.post("/experiments/{experiment_id}/run")
        async def run_experiment(experiment_id: str) -> dict[str, Any]:
            exp = await asyncio.to_thread(self._store.get_experiment, experiment_id)
            if exp is None:
                raise HTTPException(status_code=404, detail="Experiment not found")
            if exp["status"] == "running":
                raise HTTPException(
                    status_code=409, detail="Experiment is already running"
                )
            run_rows = await asyncio.to_thread(self._store.list_runs, experiment_id)
            if not run_rows:
                raise HTTPException(
                    status_code=422, detail="Experiment has no runs to execute"
                )
            # Reload RunSpecs from stored run rows
            specs = await _load_run_specs(self._store, run_rows)
            asyncio.create_task(
                self._executor.execute_experiment(experiment_id, specs)
            )
            return {"accepted": True, "experiment_id": experiment_id}

        @router.post("/experiments/{experiment_id}/cancel")
        async def cancel_experiment(experiment_id: str) -> dict[str, Any]:
            await self._executor.cancel_experiment(experiment_id)
            return {"cancelled": True}

        @router.delete("/experiments/{experiment_id}")
        async def delete_experiment(experiment_id: str) -> dict[str, Any]:
            exp = await asyncio.to_thread(self._store.get_experiment, experiment_id)
            if exp is None:
                raise HTTPException(status_code=404, detail="Experiment not found")
            if exp["status"] == "running":
                raise HTTPException(
                    status_code=409,
                    detail="Cannot delete a running experiment. Cancel it first.",
                )
            await asyncio.to_thread(self._store.delete_experiment, experiment_id)
            return {"deleted": True}

        # ── Runs ──────────────────────────────────────────────────────────────

        @router.get("/experiments/{experiment_id}/runs")
        async def list_runs(experiment_id: str) -> dict[str, Any]:
            runs = await asyncio.to_thread(self._store.list_runs, experiment_id)
            return {"runs": runs}

        @router.get("/runs/{run_id}")
        async def get_run(run_id: str) -> dict[str, Any]:
            run = await asyncio.to_thread(self._store.get_run_row, run_id)
            if run is None:
                raise HTTPException(status_code=404, detail="Run not found")
            return {"run": run}

        @router.get("/runs/{run_id}/trace")
        async def get_trace(run_id: str) -> dict[str, Any]:
            trace = await asyncio.to_thread(self._store.get_trace, run_id)
            return {"trace": [e.model_dump(mode="json") for e in trace]}

        @router.get("/runs/{run_id}/trace/export")
        async def export_trace(run_id: str) -> dict[str, Any]:
            trace = await asyncio.to_thread(self._store.get_trace, run_id)
            run = await asyncio.to_thread(self._store.get_run_row, run_id)
            return {
                "run_id": run_id,
                "run": run,
                "events": [e.model_dump(mode="json") for e in trace],
            }

        @router.post("/runs/{run_id}/rerun")
        async def rerun(run_id: str) -> dict[str, Any]:
            try:
                new_spec = await self._executor.rerun(run_id)
                return {
                    "new_run_id": new_spec.run_id if new_spec else None,
                    "accepted": True,
                }
            except (KeyError, ValueError) as exc:
                raise HTTPException(status_code=404, detail=str(exc)) from exc

        # ── Evaluation ────────────────────────────────────────────────────────

        @router.get("/experiments/{experiment_id}/results")
        async def list_results(experiment_id: str) -> dict[str, Any]:
            results = await asyncio.to_thread(
                self._store.list_eval_results, experiment_id
            )
            # Compute aggregate metrics per variant
            aggregated = _aggregate_results(results)
            return {
                "results": [r.model_dump(mode="json") for r in results],
                "aggregated": aggregated,
            }

        @router.get("/runs/{run_id}/result")
        async def get_result(run_id: str) -> dict[str, Any]:
            result = await asyncio.to_thread(self._store.get_eval_result, run_id)
            if result is None:
                raise HTTPException(status_code=404, detail="Evaluation result not found")
            return {"result": result.model_dump(mode="json")}

        # ── Regression ────────────────────────────────────────────────────────

        @router.post("/experiments/{experiment_id}/set-baseline")
        async def set_baseline(experiment_id: str) -> dict[str, Any]:
            try:
                baseline_id = await self._regression.set_baseline(experiment_id)
                return {"baseline_id": baseline_id}
            except ValueError as exc:
                raise HTTPException(status_code=422, detail=str(exc)) from exc

        @router.get("/experiments/{experiment_id}/regression-report")
        async def get_regression_report(experiment_id: str) -> dict[str, Any]:
            report = await asyncio.to_thread(
                self._store.get_regression_report, experiment_id
            )
            if report is None:
                return {"report": None}
            return {"report": report}

        # ── Mock Fixtures ─────────────────────────────────────────────────────

        @router.get("/mock-fixtures")
        async def list_fixtures() -> dict[str, Any]:
            fixtures = await asyncio.to_thread(self._store.list_fixtures)
            return {"fixtures": [f.model_dump(mode="json") for f in fixtures]}

        @router.post("/mock-fixtures")
        async def create_fixture(req: CreateFixtureRequest) -> dict[str, Any]:
            if req.fallback_mode not in ("error", "empty"):
                raise HTTPException(
                    status_code=422,
                    detail="fallback_mode must be 'error' or 'empty'",
                )
            entries = []
            for e in req.entries:
                try:
                    entries.append(MockFixtureEntry(**e))
                except Exception as exc:
                    raise HTTPException(
                        status_code=422,
                        detail=f"Invalid fixture entry: {exc}",
                    ) from exc
            fixture = MockFixture(
                name=req.name,
                fallback_mode=req.fallback_mode,  # type: ignore[arg-type]
                entries=entries,
            )
            await asyncio.to_thread(self._store.save_fixture, fixture)
            return {"fixture": fixture.model_dump(mode="json")}

        @router.get("/mock-fixtures/{fixture_id}")
        async def get_fixture(fixture_id: str) -> dict[str, Any]:
            fixture = await asyncio.to_thread(self._store.get_fixture, fixture_id)
            if fixture is None:
                raise HTTPException(status_code=404, detail="Fixture not found")
            return {"fixture": fixture.model_dump(mode="json")}

        @router.delete("/mock-fixtures/{fixture_id}")
        async def delete_fixture(fixture_id: str) -> dict[str, Any]:
            await asyncio.to_thread(self._store.delete_fixture, fixture_id)
            return {"deleted": True}


# ─── Helpers ──────────────────────────────────────────────────────────────────


async def _load_run_specs(store: LabStore, run_rows: list[dict[str, Any]]) -> list[RunSpec]:
    """Reload full RunSpec objects from stored run rows."""
    from lab.models import Task, TaskExpectedOutcome
    import orjson

    specs: list[RunSpec] = []
    for row in run_rows:
        task_data = store._conn.execute(
            "SELECT * FROM lab_tasks WHERE task_id=?", (row["task_id"],)
        ).fetchone()
        if task_data is None:
            continue

        task = Task(
            task_id=task_data["task_id"],
            dataset_id=task_data["dataset_id"],
            dataset_version=task_data["dataset_version"],
            prompt=task_data["prompt"],
            expected=TaskExpectedOutcome(
                tool_calls=orjson.loads(task_data["expected_tool_calls"]),
                assertions=orjson.loads(task_data["expected_assertions"]),
                tool_calls_ordered=bool(task_data["tool_calls_ordered"]),
            ),
        )
        mc = store.get_model_config(row["model_config_id"])
        mv = store.get_mcp_version(row["mcp_version_id"])
        wc = store.get_workflow_config(row["workflow_config_id"])
        tv = store.get_tool_variant(row["tool_variant_id"]) if row.get("tool_variant_id") else None

        if mc is None or mv is None or wc is None:
            continue

        specs.append(
            RunSpec(
                run_id=row["run_id"],
                experiment_id=row["experiment_id"],
                task=task,
                llm_config=mc,
                mcp_version=mv,
                tool_variant=tv,
                workflow_config=wc,
            )
        )
    return specs


def _aggregate_results(results: list[Any]) -> list[dict[str, Any]]:
    """Compute per-variant aggregate metrics for the comparison dashboard."""
    from collections import defaultdict

    groups: dict[str, list[Any]] = defaultdict(list)
    for r in results:
        groups[r.run_id[:8]].append(r)  # placeholder grouping — real impl uses variant_key

    aggregated = []
    for group_key, group in groups.items():
        total = len(group)
        successes = sum(1 for r in group if r.classification == "success")
        aggregated.append({
            "variant_key": group_key,
            "run_count": total,
            "success_rate": round(successes / total * 100, 2) if total else 0,
            "mean_latency_ms": round(
                sum(r.latency_ms for r in group) / total, 2
            ) if total else 0,
            "mean_total_tokens": round(
                sum(r.total_tokens for r in group) / total, 2
            ) if total else 0,
            "mean_estimated_cost_usd": round(
                sum(r.estimated_cost_usd for r in group) / total, 6
            ) if total else 0,
            "failure_count": sum(1 for r in group if r.classification == "failure"),
        })
    return aggregated
