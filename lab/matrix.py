"""MatrixEngine — Cartesian product expansion of experiment variants into RunSpecs."""

from __future__ import annotations

import asyncio
from itertools import product
from typing import Any
from uuid import uuid4

from lab.models import ExperimentDefinition, RunSpec
from lab.store import LabStore

MAX_RUNS = 500


class MatrixEngine:
    def __init__(self, lab_store: LabStore) -> None:
        self._store = lab_store

    def preview(self, experiment_def: ExperimentDefinition) -> list[dict[str, Any]]:
        """Return the full Cartesian product as plain dicts without persisting anything."""
        runs = self._expand(experiment_def, experiment_id="preview")
        return [
            {
                "run_id": r.run_id,
                "task_id": r.task.task_id,
                "task_prompt_preview": r.task.prompt[:120],
                "model_config_id": r.llm_config.model_config_id,
                "model_config_name": r.llm_config.name,
                "mcp_version_id": r.mcp_version.mcp_version_id,
                "mcp_version_name": f"{r.mcp_version.name}@{r.mcp_version.version_tag}",
                "tool_variant_id": r.tool_variant.variant_id if r.tool_variant else None,
                "workflow_config_id": r.workflow_config.workflow_config_id,
                "workflow_config_name": r.workflow_config.name,
            }
            for r in runs
        ]

    async def create_experiment(
        self,
        name: str,
        experiment_def: ExperimentDefinition,
    ) -> tuple[str, list[RunSpec]]:
        """Validate references, expand matrix, persist atomically, return (experiment_id, runs)."""
        experiment_id = str(uuid4())
        runs = self._expand(experiment_def, experiment_id=experiment_id)

        if len(runs) > MAX_RUNS:
            raise ValueError(
                f"Experiment matrix produces {len(runs)} runs, "
                f"exceeding the maximum of {MAX_RUNS}. "
                "Reduce the number of variants."
            )

        # Build variant links for audit
        variant_links: list[dict[str, str]] = []
        for dataset_id, dataset_version in experiment_def.dataset_ids:
            variant_links.append(
                {"variant_type": "dataset", "variant_id": f"{dataset_id}:{dataset_version}"}
            )
        for mc_id in experiment_def.model_config_ids:
            variant_links.append({"variant_type": "model_config", "variant_id": mc_id})
        for mv_id in experiment_def.mcp_version_ids:
            variant_links.append({"variant_type": "mcp_version", "variant_id": mv_id})
        for tv_id in experiment_def.tool_variant_ids:
            variant_links.append({"variant_type": "tool_variant", "variant_id": tv_id})
        for wc_id in experiment_def.workflow_config_ids:
            variant_links.append({"variant_type": "workflow_config", "variant_id": wc_id})

        # Persist atomically
        await asyncio.to_thread(
            self._store.create_experiment, experiment_id, name, variant_links
        )
        await asyncio.to_thread(self._store.create_runs, runs)

        return experiment_id, runs

    # ─── Internal ─────────────────────────────────────────────────────────────

    def _expand(
        self, experiment_def: ExperimentDefinition, experiment_id: str
    ) -> list[RunSpec]:
        # Resolve all referenced entities and validate they exist
        tasks = self._resolve_tasks(experiment_def.dataset_ids)
        model_configs = self._resolve_model_configs(experiment_def.model_config_ids)
        mcp_versions = self._resolve_mcp_versions(experiment_def.mcp_version_ids)
        workflow_configs = self._resolve_workflow_configs(experiment_def.workflow_config_ids)

        # Tool variants are optional; None means "use registered schema as-is"
        if experiment_def.tool_variant_ids:
            tool_variants = self._resolve_tool_variants(experiment_def.tool_variant_ids)
        else:
            tool_variants = [None]

        runs: list[RunSpec] = []
        for task, mc, mv, tv, wc in product(
            tasks, model_configs, mcp_versions, tool_variants, workflow_configs
        ):
            runs.append(
                RunSpec(
                    run_id=str(uuid4()),
                    experiment_id=experiment_id,
                    task=task,
                    llm_config=mc,
                    mcp_version=mv,
                    tool_variant=tv,
                    workflow_config=wc,
                )
            )
        return runs

    def _resolve_tasks(self, dataset_ids: list[tuple[str, int]]) -> list[Any]:
        tasks = []
        for dataset_id, version in dataset_ids:
            dataset = self._store.get_dataset(dataset_id, version)
            if dataset is None:
                raise ValueError(
                    f"Dataset {dataset_id!r} version {version} not found"
                )
            if not dataset.tasks:
                raise ValueError(
                    f"Dataset {dataset_id!r} version {version} has no tasks"
                )
            tasks.extend(dataset.tasks)
        if not tasks:
            raise ValueError("Experiment must reference at least one dataset with tasks")
        return tasks

    def _resolve_model_configs(self, ids: list[str]) -> list[Any]:
        configs = []
        for mc_id in ids:
            mc = self._store.get_model_config(mc_id)
            if mc is None:
                raise ValueError(f"ModelConfig {mc_id!r} not found")
            configs.append(mc)
        return configs

    def _resolve_mcp_versions(self, ids: list[str]) -> list[Any]:
        versions = []
        for mv_id in ids:
            mv = self._store.get_mcp_version(mv_id)
            if mv is None:
                raise ValueError(f"MCPVersion {mv_id!r} not found")
            versions.append(mv)
        return versions

    def _resolve_tool_variants(self, ids: list[str]) -> list[Any]:
        variants = []
        for tv_id in ids:
            tv = self._store.get_tool_variant(tv_id)
            if tv is None:
                raise ValueError(f"ToolVariant {tv_id!r} not found")
            variants.append(tv)
        return variants

    def _resolve_workflow_configs(self, ids: list[str]) -> list[Any]:
        configs = []
        for wc_id in ids:
            wc = self._store.get_workflow_config(wc_id)
            if wc is None:
                raise ValueError(f"WorkflowConfig {wc_id!r} not found")
            configs.append(wc)
        return configs
