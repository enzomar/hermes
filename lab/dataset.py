"""DatasetManager — CRUD, versioning, import/export for Lab datasets."""

from __future__ import annotations

import asyncio
from typing import Any
from uuid import uuid4

from pydantic import ValidationError

from lab.models import Dataset, Task, TaskExpectedOutcome
from lab.store import LabStore


class DatasetManager:
    def __init__(self, lab_store: LabStore) -> None:
        self._store = lab_store

    async def create(
        self,
        name: str,
        tasks: list[dict[str, Any]],
        description: str = "",
    ) -> Dataset:
        dataset_id = str(uuid4())
        dataset = self._build_dataset(dataset_id, 1, name, description, tasks)
        await asyncio.to_thread(self._store.create_dataset, dataset)
        return dataset

    async def update(
        self,
        dataset_id: str,
        tasks: list[dict[str, Any]],
        description: str | None = None,
    ) -> Dataset:
        current_version = await asyncio.to_thread(
            self._store.get_latest_dataset_version, dataset_id
        )
        if current_version == 0:
            raise KeyError(f"Dataset {dataset_id!r} not found")

        # Fetch current name/description to carry forward if not overriding
        existing = await asyncio.to_thread(self._store.get_dataset, dataset_id, current_version)
        assert existing is not None
        new_description = description if description is not None else existing.description
        new_version = current_version + 1
        dataset = self._build_dataset(
            dataset_id, new_version, existing.name, new_description, tasks
        )
        await asyncio.to_thread(self._store.create_dataset, dataset)
        return dataset

    async def get(self, dataset_id: str, version: int) -> Dataset:
        dataset = await asyncio.to_thread(self._store.get_dataset, dataset_id, version)
        if dataset is None:
            raise KeyError(f"Dataset {dataset_id!r} version {version} not found")
        return dataset

    async def list(self) -> list[dict[str, Any]]:
        return await asyncio.to_thread(self._store.list_datasets)

    async def delete_version(self, dataset_id: str, version: int) -> None:
        refs = await asyncio.to_thread(
            self._store.experiments_referencing_dataset, dataset_id, version
        )
        if refs:
            ids = ", ".join(refs[:5])
            raise ValueError(
                f"Cannot delete Dataset {dataset_id!r} v{version}: "
                f"referenced by experiments: {ids}"
            )
        await asyncio.to_thread(self._store.delete_dataset_version, dataset_id, version)

    async def export_json(self, dataset_id: str, version: int) -> dict[str, Any]:
        dataset = await self.get(dataset_id, version)
        return {
            "dataset_id": dataset.dataset_id,
            "version": dataset.version,
            "name": dataset.name,
            "description": dataset.description,
            "created_at": dataset.created_at.isoformat(),
            "tasks": [
                {
                    "task_id": t.task_id,
                    "prompt": t.prompt,
                    "expected": {
                        "tool_calls": t.expected.tool_calls,
                        "tool_calls_ordered": t.expected.tool_calls_ordered,
                        "assertions": t.expected.assertions,
                    },
                }
                for t in dataset.tasks
            ],
        }

    async def import_json(self, payload: dict[str, Any]) -> Dataset:
        # Validate required top-level fields
        missing = [f for f in ("name", "tasks") if f not in payload]
        if missing:
            raise ValueError(f"Import payload missing required fields: {missing}")

        if not isinstance(payload["tasks"], list) or len(payload["tasks"]) == 0:
            raise ValueError("Import payload 'tasks' must be a non-empty list")

        task_dicts: list[dict[str, Any]] = []
        for i, t in enumerate(payload["tasks"]):
            if not isinstance(t, dict) or "prompt" not in t:
                raise ValueError(
                    f"Task at index {i} missing required field 'prompt'"
                )
            task_dicts.append(t)

        return await self.create(
            name=str(payload["name"]),
            description=str(payload.get("description", "")),
            tasks=task_dicts,
        )

    # ─── Internal helpers ─────────────────────────────────────────────────────

    @staticmethod
    def _build_dataset(
        dataset_id: str,
        version: int,
        name: str,
        description: str,
        raw_tasks: list[dict[str, Any]],
    ) -> Dataset:
        tasks = []
        for raw in raw_tasks:
            expected_raw = raw.get("expected", {})
            expected = TaskExpectedOutcome(
                tool_calls=list(expected_raw.get("tool_calls", [])),
                tool_calls_ordered=bool(expected_raw.get("tool_calls_ordered", False)),
                assertions=list(expected_raw.get("assertions", [])),
            )
            tasks.append(
                Task(
                    task_id=str(uuid4()),
                    dataset_id=dataset_id,
                    dataset_version=version,
                    prompt=str(raw["prompt"]),
                    expected=expected,
                )
            )
        return Dataset(
            dataset_id=dataset_id,
            version=version,
            name=name,
            description=description,
            tasks=tasks,
        )
