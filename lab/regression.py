"""RegressionDetector — baseline comparison and regression/improvement reporting."""

from __future__ import annotations

import asyncio
import hashlib
import json
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from lab.models import EvaluationResult, RegressionEntry
from lab.store import LabStore

# Thresholds
SUCCESS_RATE_THRESHOLD_PP = 5.0   # percentage points
LATENCY_THRESHOLD_PCT = 20.0       # percent increase


class RegressionDetector:
    def __init__(self, lab_store: LabStore) -> None:
        self._store = lab_store

    async def set_baseline(self, experiment_id: str) -> str:
        """Designate the given experiment's results as the baseline for each variant."""
        results = await asyncio.to_thread(self._store.list_eval_results, experiment_id)
        if not results:
            raise ValueError(f"Experiment {experiment_id!r} has no evaluation results to baseline")

        # Group by (dataset_id, dataset_version, variant_key)
        groups: dict[tuple[str, int, str], list[EvaluationResult]] = {}
        for result in results:
            run_row = await asyncio.to_thread(self._store.get_run_row, result.run_id)
            if run_row is None:
                continue
            task_row = self._store._conn.execute(
                "SELECT dataset_id, dataset_version FROM lab_tasks WHERE task_id=?",
                (run_row["task_id"],),
            ).fetchone()
            if task_row is None:
                continue
            vkey = self._variant_key(
                run_row["model_config_id"],
                run_row["mcp_version_id"],
                run_row["tool_variant_id"],
                run_row["workflow_config_id"],
            )
            key = (task_row["dataset_id"], task_row["dataset_version"], vkey)
            groups.setdefault(key, []).append(result)

        last_baseline_id = ""
        for (dataset_id, dataset_version, variant_key), group_results in groups.items():
            baseline_id = await asyncio.to_thread(
                self._store.set_baseline,
                experiment_id,
                dataset_id,
                dataset_version,
                variant_key,
            )
            last_baseline_id = baseline_id

        return last_baseline_id

    async def check(self, experiment_id: str) -> dict[str, Any] | None:
        """Compare completed experiment results against baselines; return report or None."""
        results = await asyncio.to_thread(self._store.list_eval_results, experiment_id)
        if not results:
            return None

        # Group results by (dataset_id, dataset_version, variant_key)
        groups: dict[tuple[str, int, str], list[EvaluationResult]] = {}
        run_meta: dict[str, dict[str, Any]] = {}

        for result in results:
            run_row = await asyncio.to_thread(self._store.get_run_row, result.run_id)
            if run_row is None:
                continue
            task_row = self._store._conn.execute(
                "SELECT dataset_id, dataset_version FROM lab_tasks WHERE task_id=?",
                (run_row["task_id"],),
            ).fetchone()
            if task_row is None:
                continue
            vkey = self._variant_key(
                run_row["model_config_id"],
                run_row["mcp_version_id"],
                run_row["tool_variant_id"],
                run_row["workflow_config_id"],
            )
            key = (task_row["dataset_id"], task_row["dataset_version"], vkey)
            groups.setdefault(key, []).append(result)
            run_meta[result.run_id] = {
                "dataset_id": task_row["dataset_id"],
                "dataset_version": task_row["dataset_version"],
                "variant_key": vkey,
            }

        entries: list[dict[str, Any]] = []
        baseline_id_used: str | None = None

        for (dataset_id, dataset_version, variant_key), group_results in groups.items():
            baseline = await asyncio.to_thread(
                self._store.get_baseline, dataset_id, dataset_version, variant_key
            )
            if baseline is None:
                continue  # No baseline for this combo — skip without error

            # Compute new metrics
            new_success_rate = _success_rate(group_results)
            new_mean_latency = _mean_latency(group_results)

            # Load baseline eval results
            baseline_results = await asyncio.to_thread(
                self._store.list_eval_results, baseline["experiment_id"]
            )
            # Filter to matching variant key
            baseline_group: list[EvaluationResult] = []
            for br in baseline_results:
                brun = await asyncio.to_thread(self._store.get_run_row, br.run_id)
                if brun is None:
                    continue
                btask = self._store._conn.execute(
                    "SELECT dataset_id, dataset_version FROM lab_tasks WHERE task_id=?",
                    (brun["task_id"],),
                ).fetchone()
                if btask is None:
                    continue
                bvkey = self._variant_key(
                    brun["model_config_id"],
                    brun["mcp_version_id"],
                    brun["tool_variant_id"],
                    brun["workflow_config_id"],
                )
                if (
                    btask["dataset_id"] == dataset_id
                    and btask["dataset_version"] == dataset_version
                    and bvkey == variant_key
                ):
                    baseline_group.append(br)

            if not baseline_group:
                continue

            base_success_rate = _success_rate(baseline_group)
            base_mean_latency = _mean_latency(baseline_group)
            baseline_id_used = baseline["baseline_id"]

            # Check success rate
            sr_delta = new_success_rate - base_success_rate
            if abs(sr_delta) > SUCCESS_RATE_THRESHOLD_PP:
                entries.append(
                    RegressionEntry(
                        variant_key=variant_key,
                        metric="success_rate",
                        baseline_value=round(base_success_rate, 2),
                        new_value=round(new_success_rate, 2),
                        delta_absolute=round(sr_delta, 2),
                        delta_relative=round(
                            sr_delta / base_success_rate * 100 if base_success_rate else 0, 2
                        ),
                        direction="improvement" if sr_delta > 0 else "regression",
                    ).model_dump()
                )

            # Check latency
            if base_mean_latency > 0:
                lat_delta_pct = (new_mean_latency - base_mean_latency) / base_mean_latency * 100
                if abs(lat_delta_pct) > LATENCY_THRESHOLD_PCT:
                    entries.append(
                        RegressionEntry(
                            variant_key=variant_key,
                            metric="mean_latency_ms",
                            baseline_value=round(base_mean_latency, 2),
                            new_value=round(new_mean_latency, 2),
                            delta_absolute=round(new_mean_latency - base_mean_latency, 2),
                            delta_relative=round(lat_delta_pct, 2),
                            direction="improvement" if lat_delta_pct < 0 else "regression",
                        ).model_dump()
                    )

        if not entries:
            return None

        report: dict[str, Any] = {
            "report_id": str(uuid4()),
            "experiment_id": experiment_id,
            "baseline_id": baseline_id_used or "",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "entries": entries,
        }
        await asyncio.to_thread(self._store.save_regression_report, report)
        return report

    # ─── Internal ─────────────────────────────────────────────────────────────

    @staticmethod
    def _variant_key(
        model_config_id: str,
        mcp_version_id: str,
        tool_variant_id: str | None,
        workflow_config_id: str,
    ) -> str:
        key_data = json.dumps(
            [model_config_id, mcp_version_id, tool_variant_id, workflow_config_id],
            sort_keys=True,
        )
        return hashlib.sha256(key_data.encode()).hexdigest()[:16]


# ─── Metric helpers ───────────────────────────────────────────────────────────


def _success_rate(results: list[EvaluationResult]) -> float:
    if not results:
        return 0.0
    successes = sum(1 for r in results if r.classification == "success")
    return (successes / len(results)) * 100.0


def _mean_latency(results: list[EvaluationResult]) -> float:
    if not results:
        return 0.0
    return sum(r.latency_ms for r in results) / len(results)
