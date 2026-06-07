# Implementation Tasks

- [ ] 1. LabStore — database layer and migrations
  - Create `lab/` package with `lab/__init__.py`
  - Create `lab/store.py` implementing the `LabStore` class
  - Implement `migrate()` with idempotent `CREATE TABLE IF NOT EXISTS` for all 15 Lab tables (`lab_datasets`, `lab_tasks`, `lab_mcp_versions`, `lab_tool_variants`, `lab_model_configs`, `lab_workflow_configs`, `lab_experiments`, `lab_experiment_variants`, `lab_runs`, `lab_trace_events`, `lab_trace_sealed`, `lab_eval_results`, `lab_baselines`, `lab_regression_reports`, `lab_mock_fixtures`)
  - Implement all indexes (`idx_lab_runs_experiment`, `idx_lab_runs_status`, `idx_lab_trace_events_run`, `idx_lab_eval_results_experiment`)
  - Implement typed read/write methods for every entity group: datasets, tasks, mcp_versions, tool_variants, model_configs, workflow_configs, experiments, runs, traces, eval_results, baselines, regression_reports, mock_fixtures
  - Implement `seal_trace` / `is_sealed` logic preventing writes to sealed traces
  - Implement referential integrity helpers: `experiments_referencing_dataset`, `experiments_referencing_mcp_version`
  - Accept `sqlite3.Connection` and `threading.Lock` at construction to share the existing WAL connection
  - **Requirement**: Req 1, Req 2, Req 3, Req 4, Req 5, Req 6, Req 8, Req 9, Req 11

- [ ] 2. Pydantic models — `lab/models.py`
  - Define all wire and domain types: `TaskExpectedOutcome`, `Task`, `Dataset`, `MCPVersionRegistration`, `ToolDescriptionVariant`, `ModelConfig`, `WorkflowConfig`, `ExperimentDefinition`, `RunSpec`, `TraceEvent`, `EvaluationResult`, `RegressionEntry`
  - Add `MockFixture` and `MockFixtureEntry` models for fixture JSON schema validation
  - Ensure all `Literal` unions and optional fields match the DB schema (transport, classification, run status, etc.)
  - **Requirement**: Req 1, Req 2, Req 3, Req 4, Req 5, Req 6, Req 8, Req 9, Req 10

- [ ] 3. DatasetManager — `lab/dataset.py`
  - Implement `DatasetManager` class wrapping `LabStore`
  - `create()`: assign `dataset_id` (UUID), version 1, persist dataset and all tasks atomically
  - `update()`: increment version, write new dataset + tasks rows, preserve prior versions
  - `get()` and `list()` delegating to store
  - `delete_version()`: guard against deletion when referenced by experiments via `LabStore.experiments_referencing_dataset`; raise descriptive error with experiment IDs
  - `export_json()`: serialize `Dataset` to plain dict
  - `import_json()`: validate payload against `Dataset` schema, assign new IDs, call `create()`; return descriptive `ValidationError` for non-conforming fields
  - **Requirement**: Req 1

- [ ] 4. MCPVersionRegistry — `lab/registry.py`
  - Implement `MCPVersionRegistry` class accepting `LabStore` and `MCPClientManager`
  - `register()`: validate required fields per transport type, connect transiently to capture `schema_snapshot`, persist immutable registration; reject if `(name, version_tag)` already exists
  - `register_tool_variant()`: validate `tool_name` exists in the version's `schema_snapshot` before persisting
  - `get_schema()`: return stored snapshot (never live schema)
  - `list()`: delegate to store
  - `delete()`: guard via `LabStore.experiments_referencing_mcp_version`; raise on conflict
  - **Requirement**: Req 2

- [ ] 5. ModelConfig and WorkflowConfig CRUD — via LabStore + LabBridge stubs
  - Implement `LabStore` CRUD methods for `lab_model_configs` and `lab_workflow_configs` (already included in task 1; this task wires the service-layer validation)
  - Add service-level helpers in `lab/store.py` or a thin service: enforce `UNIQUE` name constraint with a user-readable error, validate required fields (provider, model for ModelConfig; name for WorkflowConfig)
  - Implement `delete_model_config` and `delete_workflow_config` with existence checks
  - **Requirement**: Req 10, Req 3

- [ ] 6. MatrixEngine — `lab/matrix.py`
  - Implement `MatrixEngine` class accepting `LabStore`
  - `preview()`: resolve all variant references from store, compute Cartesian product (`tasks × model_configs × mcp_versions × tool_variants_or_none × workflow_configs`), return `list[RunSpec]` without persisting; validate all references exist and raise on missing reference
  - `create_experiment()`: call `preview()` for validation, enforce hard cap of 500 runs, persist experiment row + all run specs atomically in a single transaction, return `(experiment_id, list[RunSpec])`
  - Assign `run_id` = UUID4 per run spec before persistence
  - **Requirement**: Req 3

- [ ] 7. MockMCPServer — `lab/mock_mcp.py`
  - Implement `MockMCPServer` accepting a `MockFixture` model
  - `call_tool()`: hash arguments with SHA-256 over canonical JSON, look up `(tool_name, arg_hash)` in fixture entries, return pre-recorded response on match
  - On miss: return configurable fallback — `"error"` mode returns an MCP error response; `"empty"` mode returns an empty result
  - `get_call_log()`: return list of all calls received with matched/unmatched status
  - Add fixture schema validation at construction: raise descriptive error for non-conforming fixture
  - **Requirement**: Req 9

- [ ] 8. RunExecutor — `lab/executor.py`
  - Implement `RunExecutor` accepting `LabStore`, `LLMEngine`, `MCPClientManager`, `EventBus`, `max_parallel=8`
  - `execute_experiment()`: set experiment status → running, dispatch runs through `asyncio.Semaphore(max_parallel)`, set experiment status → completed when all runs finish; publish `lab_run_progress` events on `EventBus` after each run
  - `execute_run()`: preflight API key check (raise before run if env var unset), set run status → running + `started_at`, wire `LabTraceRecorder` to append trace events, build per-run `LLMConfig` from `ModelConfig`, connect live or mock MCP (apply tool variant description overrides before presenting schema to LLM), invoke `LLMEngine.run_conversation`, on success seal trace + set status → completed + trigger `EvaluationEngine.evaluate`, on exception record error event + set status → failed + seal, on timeout cancel task + set status → timed_out + seal
  - Record wall-clock `started_at` and `completed_at` on every run
  - `cancel_experiment()`: set cancellation flag, stop scheduling new runs, allow in-flight runs to complete
  - `rerun()`: clone `RunSpec` with new `run_id` and new timestamps, persist new run row, execute; do not modify original run
  - **Requirement**: Req 4, Req 5, Req 10, Req 11

- [ ] 9. EvaluationEngine — `lab/evaluation.py`
  - Implement `EvaluationEngine` accepting `LabStore`
  - `evaluate()`: load sealed trace + task expected outcomes from store
  - Score tool call accuracy: unordered set intersection ratio; for ordered tasks use LCS ratio
  - Score assertion compliance: apply each assertion string as a Python `re.search` pattern against final LLM output; all-pass = 1.0, none-defined = 1.0
  - Classify run: `error` if trace has error event or required field missing (record missing field name, halt); `success` if all tool calls matched AND all assertions pass; `partial_success` if some matched; `failure` if none matched and expected non-empty
  - Compute `latency_ms`, `total_tokens`, `estimated_cost_usd`, `turn_count` from trace events
  - Persist `EvaluationResult` via store, then call `RegressionDetector.check(experiment_id)`
  - **Requirement**: Req 6

- [ ] 10. RegressionDetector — `lab/regression.py`
  - Implement `RegressionDetector` accepting `LabStore`
  - `_variant_key()`: deterministic SHA-256 hex[:16] over sorted JSON of `[model_config_id, mcp_version_id, tool_variant_id, workflow_config_id]`
  - `set_baseline()`: load eval results for experiment, group by variant_key, upsert one baseline row per `(dataset_id, dataset_version, variant_key)` combo (replace existing)
  - `check()`: for each variant_key in experiment results, look up baseline; if no baseline skip without error; compare `success_rate` (flag if drop > 5 pp) and `mean_latency_ms` (flag if increase > 20%); distinguish regression vs improvement; if any findings generate and persist regression report, return report dict; if none return `None`
  - **Requirement**: Req 8

- [ ] 11. LabBridge — `lab/bridge.py`
  - Implement `LabBridge` as a FastAPI `APIRouter` with prefix `/api/lab`
  - Wire all dataset routes: `GET /datasets`, `POST /datasets`, `GET /datasets/{dataset_id}/versions/{version}`, `PUT /datasets/{dataset_id}`, `DELETE /datasets/{dataset_id}/versions/{version}`, `POST /datasets/import`, `GET /datasets/{dataset_id}/versions/{version}/export`
  - Wire all MCP registry routes: `GET /mcp-versions`, `POST /mcp-versions`, `DELETE /mcp-versions/{mcp_version_id}`, `GET /mcp-versions/{mcp_version_id}/schema`, `POST /mcp-versions/{mcp_version_id}/tool-variants`, `GET /mcp-versions/{mcp_version_id}/tool-variants`
  - Wire model config routes: `GET /model-configs`, `POST /model-configs`, `DELETE /model-configs/{model_config_id}`
  - Wire workflow config routes: `GET /workflow-configs`, `POST /workflow-configs`, `DELETE /workflow-configs/{workflow_config_id}`
  - Wire experiment routes: `GET /experiments`, `POST /experiments`, `GET /experiments/{experiment_id}`, `GET /experiments/{experiment_id}/preview`, `POST /experiments/{experiment_id}/run`, `POST /experiments/{experiment_id}/cancel`, `DELETE /experiments/{experiment_id}`; experiment delete cascades all associated runs, traces, and eval results atomically
  - Wire run routes: `GET /experiments/{experiment_id}/runs`, `GET /runs/{run_id}`, `GET /runs/{run_id}/trace`, `GET /runs/{run_id}/trace/export`, `POST /runs/{run_id}/rerun`
  - Wire evaluation routes: `GET /experiments/{experiment_id}/results`, `GET /runs/{run_id}/result`
  - Wire regression routes: `POST /experiments/{experiment_id}/set-baseline`, `GET /experiments/{experiment_id}/regression-report`
  - Wire mock fixture routes: `GET /mock-fixtures`, `POST /mock-fixtures`, `GET /mock-fixtures/{fixture_id}`, `DELETE /mock-fixtures/{fixture_id}`
  - **Requirement**: Req 1, Req 2, Req 3, Req 4, Req 5, Req 6, Req 7, Req 8, Req 9, Req 10, Req 11, Req 12

- [ ] 12. WorkbenchBridge wiring — mount LabBridge
  - In `ui/bridge.py` `__init__`, construct `LabStore(self.store._conn, self.store._lock)` and call `lab_store.migrate()`
  - Instantiate `DatasetManager`, `MCPVersionRegistry`, `MatrixEngine`, `RunExecutor`, `EvaluationEngine`, `RegressionDetector` with their dependencies
  - Instantiate `LabBridge` and call `self.app.include_router(lab_bridge.router)`
  - Ensure `RunExecutor` receives `self.llm_engine`, `self.mcp_manager`, and `self.bus` so Lab progress events flow through the existing WebSocket broadcast
  - **Requirement**: Req 4, Req 12

- [ ] 13. Lab UI — navigation and primary screens
  - Create `desktop/src/app/components/lab.ts` as the Lab section root component; add a `Lab` tab to the existing top-level tab bar
  - Create `desktop/src/app/components/lab-datasets.ts`: Dataset Manager screen with dataset list, create/update/delete/import/export controls
  - Create `desktop/src/app/components/lab-experiments.ts`: Experiment Builder screen with variant selector, matrix preview, and launch button; default landing view shows recent experiments with status and summary metrics
  - Create `desktop/src/app/components/lab-run-monitor.ts`: Run Monitor screen with per-run status grid; single-run debug view rendering full Execution_Trace as a structured timeline consistent with existing Hermes inspector conventions
  - Create `desktop/src/app/components/lab-dashboard.ts`: Comparison Dashboard showing eval results grouped by variant dimension with aggregate metrics (`success_rate`, `mean_latency_ms`, `mean_total_tokens`, `mean_estimated_cost_usd`, `failure_count`), best-variant highlight, classification filter, and CSV export
  - Create `desktop/src/styles/lab.css` with Lab-specific styles
  - All screens call `/api/lab/*` endpoints via `fetch`
  - **Requirement**: Req 7, Req 12

- [ ] 14. Lab UI — real-time progress via WebSocket integration
  - In `lab-run-monitor.ts` and `lab-dashboard.ts`, subscribe to the existing `/ws` WebSocket and filter for `event_type === "lab_run_progress"` events
  - Update the Run Monitor progress indicator (completed / in-progress / pending / failed counts) on each received event without requiring a page refresh
  - Update Comparison Dashboard aggregate metrics incrementally as runs complete
  - Display real-time progress indicator while experiment status is `running`, including when zero runs are currently in-flight (pending state)
  - **Requirement**: Req 7, Req 12

- [ ] 15. Lab UI — trace diff viewer
  - Create `desktop/src/app/components/lab-trace-diff.ts`: side-by-side trace comparison view
  - Allow user to select any two runs from the Comparison Dashboard and open the diff viewer
  - Render each trace as a structured event timeline (prompt, LLM response, tool call, MCP response, error events) side by side
  - Visually highlight events that differ between the two traces (event type mismatch, different tool names, argument differences, outcome differences)
  - Link from a run's debug view to the chat interface, passing the run's Execution_Trace context to the chat session
  - **Requirement**: Req 7, Req 12
