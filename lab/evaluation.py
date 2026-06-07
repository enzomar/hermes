"""EvaluationEngine — scores completed Runs against Task expected outcomes."""

from __future__ import annotations

import asyncio
import re
from difflib import SequenceMatcher
from typing import TYPE_CHECKING, Any

from lab.models import EvaluationResult, TraceEvent
from lab.store import LabStore

if TYPE_CHECKING:
    from lab.regression import RegressionDetector

# Rough token-to-USD cost estimate (GPT-4-class; good enough for relative comparison)
_COST_PER_TOKEN = 10e-6


class EvaluationEngine:
    def __init__(self, lab_store: LabStore) -> None:
        self._store = lab_store
        self._regression: RegressionDetector | None = None

    def set_regression_detector(self, regression: "RegressionDetector") -> None:
        self._regression = regression

    async def evaluate(self, run_id: str) -> EvaluationResult:
        run_row = await asyncio.to_thread(self._store.get_run_row, run_id)
        if run_row is None:
            raise KeyError(f"Run {run_id!r} not found")

        experiment_id: str = run_row["experiment_id"]
        task_id: str = run_row["task_id"]

        # Load trace
        trace: list[TraceEvent] = await asyncio.to_thread(self._store.get_trace, run_id)

        # Load task
        task_row = await asyncio.to_thread(
            self._store._conn.execute,
            "SELECT * FROM lab_tasks WHERE task_id=?",
            (task_id,),
        )
        task_data = task_row.fetchone()

        import orjson
        expected_tool_calls: list[str] = orjson.loads(task_data["expected_tool_calls"]) if task_data else []
        expected_assertions: list[str] = orjson.loads(task_data["expected_assertions"]) if task_data else []
        tool_calls_ordered: bool = bool(task_data["tool_calls_ordered"]) if task_data else False

        # Check for error events in trace
        error_events = [e for e in trace if e.event_type == "error"]
        if error_events:
            result = EvaluationResult(
                run_id=run_id,
                experiment_id=experiment_id,
                classification="error",
                tool_call_accuracy=0.0,
                latency_ms=_compute_latency(trace),
                total_tokens=_compute_tokens(trace),
                estimated_cost_usd=_compute_cost(trace),
                turn_count=_compute_turns(trace),
                error_field="error_event",
                detail={"error_events": [e.payload for e in error_events[:3]]},
            )
            await asyncio.to_thread(self._store.save_eval_result, result)
            await self._trigger_regression_check(experiment_id)
            return result

        # Extract actual tool calls from trace
        actual_tool_calls = _extract_tool_calls(trace)

        # Extract final LLM output
        final_output = _extract_final_output(trace)

        # Score tool call accuracy
        if expected_tool_calls:
            if tool_calls_ordered:
                accuracy = _lcs_ratio(expected_tool_calls, actual_tool_calls)
            else:
                matched = len(set(actual_tool_calls) & set(expected_tool_calls))
                accuracy = matched / len(expected_tool_calls)
        else:
            accuracy = 1.0

        # Score assertions
        assertion_results = _score_assertions(expected_assertions, final_output)
        all_assertions_pass = all(assertion_results) if assertion_results else True
        any_assertion_pass = any(assertion_results) if assertion_results else True

        # Classify
        all_tools_match = (accuracy >= 1.0) if expected_tool_calls else True
        some_tools_match = (accuracy > 0.0) if expected_tool_calls else True

        if all_tools_match and all_assertions_pass:
            classification = "success"
        elif some_tools_match or any_assertion_pass:
            classification = "partial_success"
        else:
            classification = "failure"

        detail: dict[str, Any] = {
            "actual_tool_calls": actual_tool_calls,
            "expected_tool_calls": expected_tool_calls,
            "assertion_results": assertion_results,
            "final_output_preview": final_output[:500] if final_output else "",
        }

        result = EvaluationResult(
            run_id=run_id,
            experiment_id=experiment_id,
            classification=classification,
            tool_call_accuracy=round(accuracy, 4),
            latency_ms=_compute_latency(trace),
            total_tokens=_compute_tokens(trace),
            estimated_cost_usd=_compute_cost(trace),
            turn_count=_compute_turns(trace),
            detail=detail,
        )

        await asyncio.to_thread(self._store.save_eval_result, result)
        await self._trigger_regression_check(experiment_id)
        return result

    async def _trigger_regression_check(self, experiment_id: str) -> None:
        if self._regression is None:
            return
        try:
            await self._regression.check(experiment_id)
        except Exception:
            pass  # Regression check is best-effort; never fail evaluation


# ─── Trace analysis helpers ───────────────────────────────────────────────────


def _extract_tool_calls(trace: list[TraceEvent]) -> list[str]:
    """Return tool names in call order from tool_call_start events."""
    names = []
    for event in trace:
        if event.event_type == "tool_call_start":
            name = event.payload.get("tool_name") or event.payload.get("qualified_name", "")
            if name:
                names.append(str(name))
    return names


def _extract_final_output(trace: list[TraceEvent]) -> str:
    """Return content of the last llm_end event."""
    for event in reversed(trace):
        if event.event_type == "llm_end":
            msg = event.payload.get("assistant_message") or {}
            content = msg.get("content") if isinstance(msg, dict) else None
            if content:
                return str(content)
    return ""


def _score_assertions(assertions: list[str], output: str) -> list[bool]:
    results = []
    for pattern in assertions:
        try:
            results.append(bool(re.search(pattern, output, re.DOTALL | re.IGNORECASE)))
        except re.error:
            # Treat malformed regex as simple substring match
            results.append(pattern.lower() in output.lower())
    return results


def _lcs_ratio(expected: list[str], actual: list[str]) -> float:
    """Longest common subsequence ratio for ordered tool call matching."""
    if not expected:
        return 1.0
    matcher = SequenceMatcher(None, expected, actual)
    lcs_len = sum(block.size for block in matcher.get_matching_blocks())
    return lcs_len / len(expected)


def _compute_latency(trace: list[TraceEvent]) -> float:
    if not trace:
        return 0.0
    total = sum(
        float(e.payload.get("latency_ms", 0))
        for e in trace
        if e.event_type in ("llm_end", "tool_call_end")
    )
    return round(total, 2)


def _compute_tokens(trace: list[TraceEvent]) -> int:
    total = 0
    for event in trace:
        if event.event_type == "llm_end":
            usage = event.payload.get("usage") or {}
            total += int(usage.get("total_tokens", 0) or 0)
    return total


def _compute_cost(trace: list[TraceEvent]) -> float:
    tokens = _compute_tokens(trace)
    return round(tokens * _COST_PER_TOKEN, 6)


def _compute_turns(trace: list[TraceEvent]) -> int:
    return sum(1 for e in trace if e.event_type == "llm_end")
