# Requirements Document

## Introduction

Hermes MCP Lab transforms Hermes into a controlled experimentation, benchmarking, and observability environment for MCP-based agent systems. The core concept is the **Run**: every experiment execution is defined by a combination of a dataset, model configuration, MCP server version(s), tool description variant(s), and workflow configuration. Hermes MCP Lab enables teams to answer the question "which system variant performs best on this dataset?" by running experiments across all combinations in parallel, capturing full execution traces, evaluating results, and detecting regressions automatically.

Hermes MCP Lab is NOT an MCP server IDE, NOT an agent framework, and NOT a deployment platform. Chat interaction is a secondary debugging tool, not the primary interface.

---

## Glossary

- **Run**: A single experiment execution defined by a unique combination of Dataset, Model_Config, MCP_Version, Tool_Description_Variant, and Workflow_Config. A Run produces an Execution_Trace and an Evaluation_Result.
- **Dataset**: A named, versioned collection of Tasks with their expected outcomes used as the input to an Experiment.
- **Task**: A single input item within a Dataset, consisting of a prompt or instruction and zero or more expected outcome criteria (expected tool calls, expected output structure, success conditions).
- **Experiment**: A user-defined configuration specifying the matrix of Variants to evaluate against one or more Datasets.
- **Variant**: A single dimension of variation within an Experiment — a Model_Config, MCP_Version, Tool_Description_Variant, or Workflow_Config.
- **Matrix_Engine**: The system module responsible for expanding an Experiment into the full set of Runs by computing the Cartesian product of all Variants.
- **Run_Executor**: The system module responsible for executing a single Run against a live or mock MCP server and capturing its Execution_Trace.
- **Execution_Trace**: The complete, immutable record of a Run, including all prompts sent, LLM tokens received, tool calls made, MCP requests and responses, token counts, latency measurements, and cost estimates.
- **Evaluation_Engine**: The system module responsible for scoring a completed Run against the Task's expected outcomes.
- **Evaluation_Result**: The scored output of the Evaluation_Engine for a single Run, including success/failure classification, metric values, and failure classification.
- **MCP_Version_Registry**: The system module that stores and manages versioned registrations of MCP server endpoints and tool schemas.
- **Tool_Description_Variant**: A named version of a tool's description string and/or input schema registered in the MCP_Version_Registry for A/B testing purposes.
- **Model_Config**: A named configuration specifying an LLM provider, model identifier, and inference parameters (temperature, max_tokens, etc.).
- **Workflow_Config**: A named configuration specifying agent orchestration behavior — system prompt, tool selection policy, retry strategy, and maximum turns.
- **Comparison_Dashboard**: The UI module that displays side-by-side metric comparisons across Runs within an Experiment.
- **Regression_Detector**: The system module that compares Evaluation_Results across Experiment runs and surfaces statistically significant degradations.
- **Baseline**: A designated set of Evaluation_Results against which the Regression_Detector compares new Experiment results.
- **Dataset_Manager**: The system module responsible for CRUD operations, versioning, and import/export of Datasets.
- **Model_Router**: The system module responsible for routing Run execution requests to the correct LLM provider based on Model_Config.
- **Trace_Recorder**: The system module responsible for persisting Execution_Traces to durable storage and making them queryable.
- **Mock_MCP_Server**: A configurable in-process MCP server that returns deterministic, pre-recorded responses for use in offline or cost-controlled Runs.

---

## Requirements

### Requirement 1: Dataset Management

**User Story:** As a researcher, I want to define and manage versioned datasets of tasks with expected outcomes, so that I can use consistent, reproducible inputs across multiple experiments.

#### Acceptance Criteria

1. THE Dataset_Manager SHALL assign a unique identifier and a version number to each Dataset upon creation.
2. WHEN a user creates a Dataset, THE Dataset_Manager SHALL require a name, a non-empty list of Tasks, and an optional description.
3. WHEN a user defines a Task, THE Dataset_Manager SHALL accept a prompt string, zero or more expected tool call names, and zero or more expected output assertions.
4. WHEN a user updates an existing Dataset, THE Dataset_Manager SHALL create a new immutable version and preserve all prior versions.
5. THE Dataset_Manager SHALL support import and export of Datasets in JSON format.
6. WHEN a Dataset import file does not conform to the Dataset schema, THE Dataset_Manager SHALL return a descriptive validation error identifying the non-conforming fields.
7. FOR ALL valid Dataset objects, exporting then importing SHALL produce a Dataset equivalent in content to the original (round-trip property).
8. THE Dataset_Manager SHALL allow a user to list all Datasets with their name, version, Task count, and creation timestamp.
9. WHEN a user deletes a Dataset version that is referenced by one or more Experiments, THE Dataset_Manager SHALL reject the deletion and return an error identifying the referencing Experiments.

---

### Requirement 2: MCP Version Registry

**User Story:** As a researcher, I want to register and manage versioned MCP server endpoints and tool description variants, so that I can compare the effect of tool changes on agent performance.

#### Acceptance Criteria

1. THE MCP_Version_Registry SHALL store each MCP server registration with a name, version tag, transport type (stdio or sse), connection configuration, and registration timestamp.
2. WHEN a user registers an MCP server version, THE MCP_Version_Registry SHALL validate the connection configuration and return an error if required fields are missing.
3. THE MCP_Version_Registry SHALL support registration of Tool_Description_Variants by associating an alternative description string and/or input schema with a specific tool name and version tag.
4. WHEN a user requests the tool schema for a registered MCP server version, THE MCP_Version_Registry SHALL return the schema as-discovered at registration time, not the live server schema.
5. THE MCP_Version_Registry SHALL allow a user to list all registered server versions and their associated Tool_Description_Variants.
6. WHEN a user deletes an MCP server registration that is referenced by one or more Experiments, THE MCP_Version_Registry SHALL reject the deletion and return an error identifying the referencing Experiments.
7. THE MCP_Version_Registry SHALL NOT allow modification of an existing version's connection configuration or schema; modifications SHALL require registering a new version.

---

### Requirement 3: Experiment Definition

**User Story:** As a researcher, I want to define experiments as a matrix of variants applied to a dataset, so that I can systematically compare system configurations.

#### Acceptance Criteria

1. THE Matrix_Engine SHALL accept an Experiment definition consisting of one or more Datasets, one or more Model_Configs, one or more MCP_Versions, one or more Tool_Description_Variants, and one or more Workflow_Configs.
2. WHEN an Experiment is submitted, THE Matrix_Engine SHALL expand the definition into the full Cartesian product of all Variant dimensions, producing one Run specification per combination.
3. THE Matrix_Engine SHALL assign a unique Run identifier to each Run specification in the expanded matrix before any Runs are created or executed.
4. WHEN an Experiment definition references a Dataset version, MCP_Version, or Model_Config that does not exist in the system, THE Matrix_Engine SHALL return a validation error identifying the missing reference before creating any Runs.
5. THE Matrix_Engine SHALL persist the full Experiment definition and the expanded Run list atomically, so that no partial Experiment state is observable.
6. THE Matrix_Engine SHALL allow a user to preview the expanded Run list without executing the Experiment.
7. WHEN a user cancels an in-progress Experiment, THE Matrix_Engine SHALL stop scheduling new Runs and allow already-executing Runs to complete.

---

### Requirement 4: Parallel Run Execution

**User Story:** As a researcher, I want Hermes to execute all Runs in an Experiment in parallel, so that experiments complete in reasonable time even for large matrices.

#### Acceptance Criteria

1. WHEN an Experiment is started, THE Run_Executor SHALL execute all Runs in the expanded matrix concurrently, subject to a configurable maximum parallelism limit.
2. THE Run_Executor SHALL execute each Run in isolation, with no shared mutable state between concurrent Runs.
3. WHEN a Run execution encounters an LLM API error or MCP connection error, THE Run_Executor SHALL mark the Run as failed, record the error in the Execution_Trace, and continue executing remaining Runs.
4. WHEN a Run execution exceeds the Workflow_Config's configured timeout, THE Run_Executor SHALL terminate the Run, mark it as timed out, and record the elapsed time in the Execution_Trace.
5. THE Run_Executor SHALL support execution against both live MCP servers and Mock_MCP_Servers configured with pre-recorded responses.
6. WHILE an Experiment is in progress, THE Run_Executor SHALL emit progress events indicating the count of completed, in-progress, failed, and pending Runs.
7. THE Run_Executor SHALL record the wall-clock start time and end time of each Run in its Execution_Trace.

---

### Requirement 5: Execution Trace Recording

**User Story:** As a researcher, I want every Run to produce a complete, immutable execution trace, so that I can audit exactly what happened during any run.

#### Acceptance Criteria

1. THE Trace_Recorder SHALL capture and persist, for every Run, the ordered sequence of: system prompt, user prompt, LLM tokens received, tool calls made (name, arguments, result), MCP requests (raw JSON), MCP responses (raw JSON), and any errors encountered.
2. THE Trace_Recorder SHALL record latency in milliseconds for each LLM call and each MCP tool call within a Run.
3. THE Trace_Recorder SHALL record prompt token count, completion token count, and estimated cost (in USD) for each LLM call within a Run.
4. THE Trace_Recorder SHALL assign an immutable, non-negative integer sequence number starting from 0 to each event within an Execution_Trace to preserve ordering.
5. WHEN a Run completes, THE Trace_Recorder SHALL mark the Execution_Trace as sealed; sealed traces SHALL NOT be modified.
6. THE Trace_Recorder SHALL support querying Execution_Traces by Run identifier, Experiment identifier, Dataset identifier, and time range.
7. THE Trace_Recorder SHALL support export of a single Execution_Trace in JSON format.
8. FOR ALL valid Execution_Trace objects, exporting then importing SHALL produce a trace equivalent in content to the original (round-trip property).

---

### Requirement 6: Evaluation Engine

**User Story:** As a researcher, I want each completed Run to be automatically evaluated against its Task's expected outcomes, so that I can measure success rates without manual review.

#### Acceptance Criteria

1. WHEN a Run completes, THE Evaluation_Engine SHALL automatically evaluate the Run's Execution_Trace against the expected outcomes defined in the corresponding Task.
2. THE Evaluation_Engine SHALL evaluate tool call accuracy: whether the expected tool names were called, in the expected order where order is specified.
3. THE Evaluation_Engine SHALL evaluate output assertion compliance: whether the final LLM output satisfies each assertion defined in the Task.
4. THE Evaluation_Engine SHALL classify each Run as one of: success, partial_success, failure, or error.
5. THE Evaluation_Engine SHALL compute and record the following metrics per Run: tool_call_accuracy (ratio of expected to actual tool calls matched), latency_ms (total Run wall-clock time), total_tokens (sum of prompt and completion tokens), estimated_cost_usd, and turn_count.
6. WHEN an Evaluation_Engine rule references a field not present in the Execution_Trace, THE Evaluation_Engine SHALL classify the Run as error, record the missing field name, and halt evaluation for that Run regardless of whether other criteria could have been evaluated.
7. THE Evaluation_Engine SHALL store each Evaluation_Result with a reference to its Run identifier and be queryable by Run identifier and Experiment identifier.

---

### Requirement 7: Comparison Dashboard

**User Story:** As a researcher, I want to compare evaluation results across all Runs within an Experiment side by side, so that I can identify which variant performs best.

#### Comparison_Dashboard SHALL display Evaluation_Results for all Runs in an Experiment, grouped by Variant dimension (Model_Config, MCP_Version, Tool_Description_Variant, Workflow_Config).

#### Acceptance Criteria

1. THE Comparison_Dashboard SHALL display Evaluation_Results for all Runs in an Experiment, grouped by Variant dimension.
2. THE Comparison_Dashboard SHALL present, for each Variant, the aggregate metrics: success_rate, mean_latency_ms, mean_total_tokens, mean_estimated_cost_usd, and failure_count.
3. THE Comparison_Dashboard SHALL visually distinguish the highest-performing Variant for each metric using a consistent highlight indicator.
4. THE Comparison_Dashboard SHALL allow a user to select any two Runs and view their Execution_Traces side by side.
5. THE Comparison_Dashboard SHALL allow a user to filter the displayed Runs by classification (success, partial_success, failure, error).
6. THE Comparison_Dashboard SHALL allow a user to export the full comparison table as a CSV file.
7. THE Comparison_Dashboard SHALL update displayed metrics in real time as Runs complete for any Experiment with a running status, without requiring a manual page refresh.

---

### Requirement 8: Regression Detection

**User Story:** As a researcher, I want Hermes to automatically detect when a new Experiment shows performance degradation compared to a Baseline, so that I can catch tool or model regressions before they reach production.

#### Acceptance Criteria

1. THE Regression_Detector SHALL allow a user to designate any completed Experiment's results as the Baseline for a given Dataset and Variant combination.
2. WHEN a new Experiment completes against a Dataset that has an established Baseline, THE Regression_Detector SHALL compare the new Evaluation_Results against the Baseline for matching Variant dimensions.
3. THE Regression_Detector SHALL flag a regression WHEN the new Experiment's success_rate for any Variant is more than 5 percentage points below the Baseline success_rate for the same Variant.
4. THE Regression_Detector SHALL flag a regression WHEN the new Experiment's mean_latency_ms for any Variant exceeds the Baseline mean_latency_ms by more than 20 percent.
5. WHEN one or more regressions are detected, THE Regression_Detector SHALL emit a regression report identifying each degraded Variant, the Baseline metric value, the new metric value, and the delta.
6. THE Regression_Detector SHALL distinguish regressions (statistically significant degradation) from improvements (statistically significant improvement) in the report.
7. WHEN no Baseline exists for a Dataset and Variant combination, THE Regression_Detector SHALL complete without error and produce no regression report for that combination.

---

### Requirement 9: Mock MCP Server

**User Story:** As a researcher, I want to run experiments against a mock MCP server using pre-recorded responses, so that I can test agent behavior in a cost-controlled, deterministic environment.

#### Acceptance Criteria

1. THE Mock_MCP_Server SHALL accept a response fixture file that maps tool call signatures (tool name plus argument hash) to pre-recorded MCP responses.
2. WHEN a Run executing against the Mock_MCP_Server makes a tool call that matches a fixture entry, THE Mock_MCP_Server SHALL return the pre-recorded response.
3. WHEN a Run executing against the Mock_MCP_Server makes a tool call that does not match any fixture entry, THE Mock_MCP_Server SHALL return a configurable fallback response (either a default error or a default empty result).
4. THE Mock_MCP_Server SHALL record every tool call it receives during a Run, including the tool name, arguments, and matched or unmatched status.
5. THE Mock_MCP_Server SHALL support response fixture files in JSON format.
6. FOR ALL valid fixture files, loading then re-exporting SHALL produce a fixture equivalent in content to the original (round-trip property).
7. IF a fixture file does not conform to the expected schema, THEN THE Mock_MCP_Server SHALL return a descriptive error and refuse to start.

---

### Requirement 10: Model Router

**User Story:** As a researcher, I want to configure multiple LLM providers and models as named variants, so that I can compare model behavior across identical tasks.

#### Acceptance Criteria

1. THE Model_Router SHALL support named Model_Config registrations specifying provider (openai, anthropic, local, github-copilot), model identifier, temperature, max_tokens, and system prompt override.
2. WHEN a Run is dispatched, THE Model_Router SHALL route the LLM calls to the provider and model specified in the Run's Model_Config.
3. WHEN a Model_Config references an API key environment variable that is not set, THE Model_Router SHALL return an error before the Run begins execution.
4. THE Model_Router SHALL record the model identifier and provider actually used in each Run's Execution_Trace.
5. WHEN a Model_Config specifies a local provider, THE Model_Router SHALL use the configured api_base and not require an API key.
6. THE Model_Router SHALL support at least 2 simultaneous active Model_Config providers within a single Experiment.

---

### Requirement 11: Experiment History and Audit

**User Story:** As a researcher, I want a complete history of all experiments and their outcomes, so that I can audit past results and reproduce any previous run.

#### Acceptance Criteria

1. THE Trace_Recorder SHALL persist all Experiments, Runs, Execution_Traces, and Evaluation_Results durably in the existing Hermes SQLite database.
2. THE Trace_Recorder SHALL allow a user to list all Experiments with their name, creation timestamp, Dataset reference(s), status (pending, running, completed, cancelled), Run count, and success_rate.
3. WHEN a user requests to re-run a specific past Run, THE Run_Executor SHALL create a new Run with identical configuration but a new Run identifier and execution timestamp; it SHALL NOT overwrite the original Run.
4. THE Trace_Recorder SHALL retain all Experiment data indefinitely unless the user explicitly deletes an Experiment.
5. WHEN a user deletes an Experiment, THE Trace_Recorder SHALL also delete all associated Runs, Execution_Traces, and Evaluation_Results atomically.
6. THE Trace_Recorder SHALL support search and filtering of Experiment history by Dataset name, date range, status, and success rate threshold.

---

### Requirement 12: Lab Interface (Non-Chat Primary UI)

**User Story:** As a researcher, I want a dedicated Lab interface that is separate from the chat interface, so that experiment workflows are first-class and not buried inside a chat-centric UI.

#### Acceptance Criteria

1. THE Lab_Interface SHALL provide a dedicated top-level navigation entry point distinct from the existing chat interface.
2. THE Lab_Interface SHALL surface the following primary workflow screens: Dataset Manager, Experiment Builder, Run Monitor, Comparison Dashboard, and Regression Report.
3. WHEN a user navigates to the Lab_Interface, THE Lab_Interface SHALL display the list of recent Experiments with their status and summary metrics as the default landing view.
4. THE Lab_Interface SHALL allow a user to launch an Experiment from the Experiment Builder without leaving the Lab_Interface.
5. WHILE an Experiment has a running status, THE Lab_Interface SHALL display a real-time Run progress indicator showing completed, in-progress, and pending Run counts, even if no Runs are currently executing.
6. THE Lab_Interface SHALL provide a single-Run debug view that renders the full Execution_Trace in a structured, human-readable timeline format consistent with the existing Hermes inspector UI conventions.
7. WHERE the chat interface is opened from a Run's debug view, THE Lab_Interface SHALL pass the Run's Execution_Trace context to the chat session to enable debugging queries against the trace data.

