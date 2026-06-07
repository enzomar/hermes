# Implementation Plan: Global Refactoring

## Overview

Behavior-preserving structural refactoring of the Hermes dual-stack application. The work is ordered so that each step produces a compilable/runnable system: infrastructure and interfaces first, then backend extraction, config split, frontend decomposition, CSS cleanup, and finally dead code removal with naming unification.

## Tasks

- [ ] 1. Backend: Configuration separation
  - [ ] 1.1 Create `LLMProviderConfig` and `AIProfileConfig` sub-models in `config.py`
    - Add `LLMProviderConfig` (provider, model, api_base, api_key_env, custom_llm_provider, cli_command, cli_args) and `AIProfileConfig` (temperature, top_p, presence_penalty, frequency_penalty, max_tokens, timeout_seconds, system_prompt, disable_tools) as Pydantic models
    - Move the `normalize_provider_aliases` validator onto `LLMProviderConfig`
    - _Requirements: 3.1, 3.2_

  - [ ] 1.2 Compose `LLMConfig` from the two sub-models with backward-compatible serialization
    - Add `provider_config` and `profile_config` fields to `LLMConfig`
    - Implement `accept_flat_or_structured` model validator to support both flat JSON and structured JSON
    - Override `model_dump()` to serialize flat for existing `hermes.local.json` compatibility
    - Keep `validate_local_cli` validator working through the new structure
    - _Requirements: 3.3, 3.4_

  - [ ]* 1.3 Write property test for configuration round-trip
    - **Property 3: Configuration Format Round-Trip**
    - Generate arbitrary valid LLMConfig instances (flat and structured), serialize to dict, deserialize back, assert field equality
    - **Validates: Requirements 3.3, 3.4**

- [ ] 2. Backend: Provider adapter layer
  - [ ] 2.1 Create `llm/providers/` package with `base.py` protocol and `__init__.py` registry
    - Define `ProviderAdapter` protocol class with `complete()` and `test_connection()` methods
    - Define `CompletionResult` dataclass
    - Implement `get_adapter(config: LLMProviderConfig) -> ProviderAdapter` in `__init__.py`
    - _Requirements: 2.3_

  - [ ] 2.2 Extract `litellm_adapter.py` from engine.py
    - Move `_litellm_model_name`, `_api_completion_kwargs`, `_api_key`, `_api_base`, `_api_headers`, SSL handling logic into `LitellmAdapter` class
    - Implement `complete()` and `test_connection()` conforming to the protocol
    - _Requirements: 2.1, 2.2_

  - [ ] 2.3 Extract `github_models.py` from engine.py
    - Move `_run_github_models_completion`, `_test_github_models` logic into `GitHubModelsAdapter`
    - Implement `complete()` and `test_connection()` conforming to the protocol
    - _Requirements: 2.1, 2.2_

  - [ ] 2.4 Extract `local_cli.py` from engine.py
    - Move `_run_local_cli_completion`, `_resolve_cli_command`, `_build_cli_args`, `_format_cli_prompt`, `_estimate_usage`, `_uses_local_cli` logic into `LocalCliAdapter`
    - Implement `complete()` and `test_connection()` conforming to the protocol
    - _Requirements: 2.1, 2.2_

  - [ ] 2.5 Refactor `engine.py` to use provider adapters via registry
    - Remove all provider-specific methods from `LLMEngine`
    - Replace inline provider logic in `run_conversation()` with `get_adapter(config.provider_config).complete(...)` calls
    - Update `test_config()` to delegate to `adapter.test_connection()`
    - Pass `LLMProviderConfig` to adapters rather than full config
    - _Requirements: 2.1, 2.3, 2.4_

  - [ ]* 2.6 Write property test for provider adapter protocol conformance
    - **Property 2: Provider Adapter Protocol Conformance**
    - For each adapter in the registry, verify it satisfies the `ProviderAdapter` protocol and `get_adapter()` returns correct type
    - **Validates: Requirements 2.3**

- [ ] 3. Checkpoint - Backend verification
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Frontend: Module decomposition infrastructure
  - [ ] 4.1 Create `desktop/src/app/features/` directory and `actionRouter.ts`
    - Create the features directory
    - Implement `actionRouter.ts` with `ACTION_MAP` and `executeAction()` dispatcher
    - Wire up the action router in the existing event handlers (but keep current logic intact for now)
    - _Requirements: 1.1, 1.4_

  - [ ] 4.2 Extract `features/sessions.ts` from app.ts
    - Move session create, delete, rename, switch, duplicate functions
    - Import `state` from `../state` for all mutable application state access
    - Re-export all moved symbols from `app.ts` for backward compatibility
    - _Requirements: 1.2, 1.3, 1.4_

  - [ ] 4.3 Extract `features/settings.ts` from app.ts
    - Move settings panel open/close, save, LLM test functions
    - Import `state` from `../state`
    - Re-export from `app.ts`
    - _Requirements: 1.2, 1.3, 1.4_

  - [ ] 4.4 Extract `features/llmProfiles.ts` from app.ts
    - Move profile CRUD, draft management, form sync functions
    - Import `state` from `../state`
    - Re-export from `app.ts`
    - _Requirements: 1.2, 1.3, 1.4_

  - [ ] 4.5 Extract `features/chat.ts` from app.ts
    - Move message compose, submit, render timeline, WebSocket message handling functions
    - Import `state` from `../state`
    - Re-export from `app.ts`
    - _Requirements: 1.2, 1.3, 1.4_

  - [ ] 4.6 Extract `features/benchmark.ts` from app.ts
    - Move benchmark panel, profile select, run, report functions
    - Import `state` from `../state`
    - Re-export from `app.ts`
    - _Requirements: 1.2, 1.3, 1.4_

  - [ ] 4.7 Extract `features/mcpInspector.ts` and `features/mcpSettings.ts` from app.ts
    - Move MCP tool runner, connections, activity logic to `mcpInspector.ts`
    - Move MCP server add/edit/delete/toggle logic to `mcpSettings.ts`
    - Import `state` from `../state`
    - Re-export from `app.ts`
    - _Requirements: 1.2, 1.3, 1.4_

  - [ ] 4.8 Extract `features/commandPalette.ts`, `features/lab.ts`, and `features/attachments.ts` from app.ts
    - Move command palette open/close/filter/execute to `commandPalette.ts`
    - Move lab panels (datasets, experiments, models) to `lab.ts`
    - Move file reading, MIME detection, normalization to `attachments.ts`
    - Import `state` from `../state` in each
    - Re-export from `app.ts`
    - _Requirements: 1.2, 1.3, 1.4_

  - [ ] 4.9 Reduce `app.ts` to initialization entry point
    - Keep only `startApp()`, `boot()`, top-level event delegation, and re-exports
    - Wire all event handlers to dispatch through `actionRouter.ts`
    - Verify `app.ts` is under 300 lines
    - _Requirements: 1.1, 1.3_

  - [ ]* 4.10 Verify export preservation with TypeScript compilation
    - **Property 1: Export Preservation**
    - Run `tsc --noEmit` to confirm all external import sites resolve without errors
    - Verify no circular dependencies with `madge --circular`
    - **Validates: Requirements 1.3, 1.5**

- [ ] 5. Checkpoint - Frontend decomposition verification
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. CSS consolidation
  - [ ] 6.1 Redistribute `improvements.css` rules into domain-specific CSS files
    - Audit each rule in `improvements.css` and move to the appropriate file (layout fixes → `layout.css`, component tweaks → `components.css`, feature overrides → matching feature file)
    - Delete `improvements.css`
    - _Requirements: 4.2_

  - [ ] 6.2 Add `components.css` import and establish correct import ordering in `styles.css`
    - Update `styles.css` to import in correct layer order: base, layout, components, features (timeline, composer, settings, inspector, benchmark, overlays, onboarding, lab), responsive
    - _Requirements: 4.4_

  - [ ] 6.3 Remove duplicate/conflicting selectors and dead CSS rules
    - Identify duplicate selectors across files that apply conflicting declarations
    - Keep rules in the most specific domain file
    - Remove CSS rules whose selectors don't match any rendered element (use PurgeCSS dry-run or manual audit)
    - _Requirements: 4.1, 4.3_

- [ ] 7. Dead code removal
  - [ ] 7.1 Remove unused TypeScript exports, functions, and imports
    - Run `tsc --noUnusedLocals --noUnusedParameters` to identify unreachable symbols
    - Remove unused import statements
    - Verify no reachable code is affected by checking build output
    - _Requirements: 5.1, 5.3_

  - [ ] 7.2 Remove unused Python functions, classes, and imports
    - Run `ruff check --fix` with unused-import rules enabled
    - Use `vulture` from `main.py` entry point to identify dead code
    - Remove unreachable functions and module-level variables
    - _Requirements: 5.2, 5.4_

- [ ] 8. Naming convention unification
  - [ ] 8.1 Fix TypeScript naming inconsistencies
    - Ensure all local variables, functions, and parameters use camelCase
    - Ensure all type aliases, interfaces, and class names use PascalCase
    - Use semantic rename to update all references atomically
    - _Requirements: 6.1, 6.2, 6.5_

  - [ ] 8.2 Fix Python naming inconsistencies
    - Ensure all local variables, functions, parameters, and module names use snake_case
    - Ensure all class names use PascalCase
    - Use semantic rename to update all references
    - _Requirements: 6.3, 6.4, 6.5_

- [ ] 9. Final checkpoint - Full verification
  - Ensure all tests pass, ask the user if questions arise.
  - Verify `tsc --noEmit` passes (no broken references)
  - Verify `vite build` succeeds (frontend builds)
  - Verify backend starts and responds to health check
  - _Requirements: 7.1, 7.2, 7.3, 7.4_

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design
- The ordering ensures the system is compilable/runnable after each task
- Backend tasks come first because config changes propagate to the engine
- Frontend decomposition is the largest body of work but each extract is independent
- CSS and dead code steps run last because they depend on the final module structure

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3", "2.1"] },
    { "id": 3, "tasks": ["2.2", "2.3", "2.4"] },
    { "id": 4, "tasks": ["2.5"] },
    { "id": 5, "tasks": ["2.6", "4.1"] },
    { "id": 6, "tasks": ["4.2", "4.3", "4.4", "4.5", "4.6"] },
    { "id": 7, "tasks": ["4.7", "4.8"] },
    { "id": 8, "tasks": ["4.9"] },
    { "id": 9, "tasks": ["4.10"] },
    { "id": 10, "tasks": ["6.1", "6.2"] },
    { "id": 11, "tasks": ["6.3"] },
    { "id": 12, "tasks": ["7.1", "7.2"] },
    { "id": 13, "tasks": ["8.1", "8.2"] }
  ]
}
```
