"""Pydantic domain models for Hermes MCP Lab."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, Field


# ─── Task / Dataset ───────────────────────────────────────────────────────────


class TaskExpectedOutcome(BaseModel):
    tool_calls: list[str] = Field(default_factory=list)
    tool_calls_ordered: bool = False
    assertions: list[str] = Field(default_factory=list)


class Task(BaseModel):
    task_id: str = Field(default_factory=lambda: str(uuid4()))
    dataset_id: str
    dataset_version: int
    prompt: str
    expected: TaskExpectedOutcome = Field(default_factory=TaskExpectedOutcome)


class Dataset(BaseModel):
    dataset_id: str = Field(default_factory=lambda: str(uuid4()))
    version: int = 1
    name: str
    description: str = ""
    tasks: list[Task] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ─── MCP Registry ─────────────────────────────────────────────────────────────


class MCPVersionRegistration(BaseModel):
    mcp_version_id: str = Field(default_factory=lambda: str(uuid4()))
    name: str
    version_tag: str
    transport: Literal["stdio", "sse", "mock"]
    connection_config: dict[str, Any] = Field(default_factory=dict)
    schema_snapshot: dict[str, Any] = Field(default_factory=dict)
    registered_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ToolDescriptionVariant(BaseModel):
    variant_id: str = Field(default_factory=lambda: str(uuid4()))
    mcp_version_id: str
    tool_name: str
    description: str
    input_schema: dict[str, Any] | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ─── Model / Workflow configs ─────────────────────────────────────────────────


class LabModelConfig(BaseModel):
    model_config_id: str = Field(default_factory=lambda: str(uuid4()))
    name: str
    provider: str
    model: str
    temperature: float = 0.0
    max_tokens: int = 4096
    system_prompt: str = ""
    api_key_env: str | None = None
    api_base: str | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    model_config = {"protected_namespaces": ()}  # avoid clash with Pydantic's model_config


class WorkflowConfig(BaseModel):
    workflow_config_id: str = Field(default_factory=lambda: str(uuid4()))
    name: str
    system_prompt: str = ""
    max_turns: int = 6
    timeout_seconds: float = 120.0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ─── Experiment / Run ─────────────────────────────────────────────────────────


class ExperimentDefinition(BaseModel):
    name: str
    dataset_ids: list[tuple[str, int]]          # list of (dataset_id, version)
    model_config_ids: list[str]
    mcp_version_ids: list[str]
    tool_variant_ids: list[str] = Field(default_factory=list)   # empty = no override
    workflow_config_ids: list[str]
    fixture_id: str | None = None               # if set, all runs use the mock server


class RunSpec(BaseModel):
    run_id: str = Field(default_factory=lambda: str(uuid4()))
    experiment_id: str
    task: Task
    llm_config: LabModelConfig
    mcp_version: MCPVersionRegistration
    tool_variant: ToolDescriptionVariant | None = None
    workflow_config: WorkflowConfig


RunStatus = Literal["pending", "running", "completed", "failed", "timed_out", "cancelled"]
ExperimentStatus = Literal["pending", "running", "completed", "cancelled"]


# ─── Trace ────────────────────────────────────────────────────────────────────


class TraceEvent(BaseModel):
    run_id: str
    seq: int
    event_type: str
    ts: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    payload: dict[str, Any] = Field(default_factory=dict)


# ─── Evaluation ───────────────────────────────────────────────────────────────


class EvaluationResult(BaseModel):
    run_id: str
    experiment_id: str
    classification: Literal["success", "partial_success", "failure", "error"]
    tool_call_accuracy: float
    latency_ms: float
    total_tokens: int
    estimated_cost_usd: float
    turn_count: int
    error_field: str | None = None
    detail: dict[str, Any] = Field(default_factory=dict)


# ─── Regression ───────────────────────────────────────────────────────────────


class RegressionEntry(BaseModel):
    variant_key: str
    metric: str
    baseline_value: float
    new_value: float
    delta_absolute: float
    delta_relative: float
    direction: Literal["regression", "improvement"]


# ─── Mock MCP ─────────────────────────────────────────────────────────────────


class MockFixtureEntry(BaseModel):
    tool_name: str
    arg_hash: str
    response: dict[str, Any]


class MockFixture(BaseModel):
    fixture_id: str = Field(default_factory=lambda: str(uuid4()))
    name: str
    fallback_mode: Literal["error", "empty"] = "error"
    entries: list[MockFixtureEntry] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
