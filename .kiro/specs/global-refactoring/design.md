# Design Document: Global Refactoring

## Overview

This design describes the structural decomposition of the Hermes application into well-bounded modules while preserving all runtime behavior. The refactoring targets four areas: the monolithic frontend `app.ts`, the coupled LLM engine, the flat configuration model, and the CSS architecture.

The guiding principle is **behavioral equivalence**: every change is purely structural, and the application must produce identical output for all inputs before and after.

---

## Architecture

### High-Level Module Map (Post-Refactoring)

```
desktop/src/
├── main.ts                          (entry point — unchanged)
├── styles.css                       (CSS layer import order)
├── app/
│   ├── app.ts                       (≤300 lines: boot, mount, event delegation)
│   ├── state.ts                     (centralized HermesState + persistence)
│   ├── types.ts                     (all shared type definitions)
│   ├── config.ts                    (frontend constants)
│   ├── api.ts                       (HTTP client)
│   ├── websocket.ts                 (WebSocket class)
│   ├── utils.ts                     (shared DOM/string helpers)
│   ├── layout.ts                    (shell/sidebar rendering)
│   ├── features/
│   │   ├── chat.ts                  (message compose, submit, render timeline)
│   │   ├── settings.ts              (settings panel: open/close, save, LLM test)
│   │   ├── llmProfiles.ts           (profile CRUD, draft management, form sync)
│   │   ├── sessions.ts              (create, delete, rename, switch, duplicate)
│   │   ├── benchmark.ts             (benchmark panel, profile select, run, report)
│   │   ├── mcpInspector.ts          (MCP tool runner, connections, activity)
│   │   ├── mcpSettings.ts           (MCP server add/edit/delete/toggle)
│   │   ├── commandPalette.ts        (palette open/close, filter, execute)
│   │   ├── lab.ts                   (lab panels: datasets, experiments, models)
│   │   └── attachments.ts           (file reading, MIME detection, normalization)
│   └── components/                  (render-only component functions — existing)

llm/
├── __init__.py
├── engine.py                        (orchestration only)
├── streaming.py                     (unchanged)
├── tool_bridge.py                   (unchanged)
└── providers/
    ├── __init__.py                  (registry + protocol)
    ├── base.py                      (ProviderAdapter protocol)
    ├── litellm_adapter.py           (OpenAI, Anthropic, Groq, etc. via litellm)
    ├── github_models.py             (GitHub Models direct completion)
    └── local_cli.py                 (local CLI subprocess execution)

config.py                            (AppConfig, LLMProviderConfig, AIProfileConfig, LLMConfig)
```

---

## Components and Interfaces

### 1. Frontend Module Decomposition

#### 1.1 Reduced `app.ts` Entry Point

The refactored `app.ts` retains only:
- `startApp()`: mounts DOM root, calls `boot()`
- `boot()`: awaits backend, fetches bootstrap, connects WebSocket, calls `hydrateShell()`
- Top-level event delegation: single `click`, `input`, `change`, `keydown` handlers that dispatch to feature modules based on `data-action` attributes or target selectors
- Re-exports of all public symbols from feature modules (preserving external import paths)

```typescript
// desktop/src/app/app.ts (sketch)
import { state } from "./state";
import { connectSocket } from "./features/chat";
import { hydrateShell } from "../app/layout";
import { executeAction } from "./actionRouter";

export function startApp(root: HTMLDivElement): void {
  root.addEventListener("click", (e) => handleClick(e));
  root.addEventListener("input", (e) => handleInput(e));
  root.addEventListener("change", (e) => handleChange(e));
  document.addEventListener("keydown", (e) => handleGlobalKeydown(e));
  boot();
}

// Re-export public API for backward compatibility
export { createSession, deleteSession } from "./features/sessions";
export { openSettings, closeSettings } from "./features/settings";
// ... all other previously-exported symbols
```

#### 1.2 Feature Module Boundaries

Each feature module follows a consistent pattern:

```typescript
// desktop/src/app/features/sessions.ts
import { state } from "../state";
import { api } from "../api";
import { render } from "../layout";

export async function createSession(title?: string, focus = false): Promise<void> { /* ... */ }
export async function deleteSession(sessionId: string): Promise<void> { /* ... */ }
export async function switchRelativeSession(direction: 1 | -1): Promise<void> { /* ... */ }
// ...
```

**State access rule**: Every feature module imports `state` from `../state` as its single source of mutable application state. No feature module declares module-level `let` bindings that hold application data.

#### 1.3 Action Router

A dedicated `actionRouter.ts` maps action strings (from `data-action` attributes) to feature module functions, replacing the monolithic `executeAction()` switch statement:

```typescript
// desktop/src/app/actionRouter.ts
import * as sessions from "./features/sessions";
import * as settings from "./features/settings";
import * as benchmark from "./features/benchmark";

const ACTION_MAP: Record<string, (payload: ActionPayload) => Promise<void> | void> = {
  "create-session": sessions.createSession,
  "open-settings": settings.openSettings,
  "run-benchmark": benchmark.runBenchmark,
  // ...
};

export async function executeAction(action: string, payload: ActionPayload = {}): Promise<void> {
  const handler = ACTION_MAP[action];
  if (handler) await handler(payload);
}
```

#### 1.4 Circular Dependency Prevention

The dependency graph is strictly layered:
```
types.ts ← config.ts ← state.ts ← api.ts / utils.ts ← features/* ← app.ts
                                                   ↑
                                             layout.ts
                                             components/*
```

If two feature modules need shared logic (e.g., `llmProfiles.ts` and `settings.ts` both need profile serialization), the shared function lives in `utils.ts` or a dedicated `features/shared.ts`.

---

### 2. Backend Engine Separation

#### 2.1 Provider Adapter Protocol

```python
# llm/providers/base.py
from __future__ import annotations
from typing import Any, Protocol
from config import LLMProviderConfig

class ProviderAdapter(Protocol):
    """Interface all LLM provider adapters must satisfy."""

    async def complete(
        self,
        messages: list[dict[str, Any]],
        config: LLMProviderConfig,
        *,
        tools: list[dict[str, Any]] | None = None,
        max_tokens: int = 2048,
        temperature: float = 0.2,
        timeout: float = 90.0,
        **kwargs: Any,
    ) -> CompletionResult:
        """Send messages to the provider and return a completion result."""
        ...

    async def test_connection(self, config: LLMProviderConfig) -> dict[str, Any]:
        """Validate connectivity and return diagnostic info."""
        ...


class CompletionResult:
    """Standardized completion output across all providers."""
    assistant_message: dict[str, Any]  # {role, content, tool_calls}
    usage: dict[str, int]              # {prompt_tokens, completion_tokens, total_tokens}
    latency_ms: float
```

#### 2.2 Provider Registry

```python
# llm/providers/__init__.py
from config import LLMProviderConfig
from llm.providers.base import ProviderAdapter
from llm.providers.litellm_adapter import LitellmAdapter
from llm.providers.github_models import GitHubModelsAdapter
from llm.providers.local_cli import LocalCliAdapter

_ADAPTERS: dict[str, type[ProviderAdapter]] = {
    "github-copilot": GitHubModelsAdapter,
    "local-cli": LocalCliAdapter,
}

# All other providers route through litellm
_DEFAULT_ADAPTER = LitellmAdapter

def get_adapter(config: LLMProviderConfig) -> ProviderAdapter:
    adapter_cls = _ADAPTERS.get(config.provider, _DEFAULT_ADAPTER)
    return adapter_cls()
```

#### 2.3 Refactored Engine (Orchestration Only)

```python
# llm/engine.py (post-refactoring — sketch)
from llm.providers import get_adapter
from config import LLMConfig

class LLMEngine:
    async def run_conversation(self, session_id: str, *, config_override=None):
        config = config_override or self.config
        adapter = get_adapter(config.provider_config)

        for round_idx in range(self.max_tool_rounds):
            result = await adapter.complete(
                messages=history,
                config=config.provider_config,
                tools=available_tools if not config.profile_config.disable_tools else None,
                max_tokens=config.profile_config.max_tokens,
                temperature=config.profile_config.temperature,
                timeout=config.profile_config.timeout_seconds,
            )
            # ... tool call dispatch, event publishing, loop control
```

The engine no longer contains `_litellm_model_name`, `_api_completion_kwargs`, `_run_github_models_completion`, `_run_local_cli_completion`, `_resolve_cli_command`, `_build_cli_args`, `_format_cli_prompt`, `_estimate_usage`, `_api_key`, `_api_base`, or `_api_headers`. All of these move into the appropriate adapter.

---

### 3. Configuration Separation

#### 3.1 Split Models

```python
# config.py
from pydantic import BaseModel, Field

class LLMProviderConfig(BaseModel):
    """Connectivity: how to reach the LLM provider."""
    provider: Literal["openai", "anthropic", ...] = "openai"
    model: str = "openai/gpt-4.1-mini"
    api_base: str | None = None
    api_key_env: str | None = None
    custom_llm_provider: str | None = None
    cli_command: str | None = None
    cli_args: list[str] = Field(default_factory=list)


class AIProfileConfig(BaseModel):
    """Behavior: how the AI should respond."""
    temperature: float = 0.2
    top_p: float | None = None
    presence_penalty: float | None = None
    frequency_penalty: float | None = None
    max_tokens: int = 2048
    timeout_seconds: float = 90.0
    system_prompt: str = "You are Hermes, an MCP AI IDE workbench assistant..."
    disable_tools: bool = False
```

#### 3.2 Backward-Compatible Composition

```python
class LLMConfig(BaseModel):
    """Composed config — serializes flat for backward compat."""
    provider_config: LLMProviderConfig = Field(default_factory=LLMProviderConfig)
    profile_config: AIProfileConfig = Field(default_factory=AIProfileConfig)

    @model_validator(mode="before")
    @classmethod
    def accept_flat_or_structured(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        # If data has nested structure, pass through
        if "provider_config" in data or "profile_config" in data:
            return data
        # Otherwise, split flat keys into the two sub-models
        provider_keys = LLMProviderConfig.model_fields.keys()
        profile_keys = AIProfileConfig.model_fields.keys()
        return {
            "provider_config": {k: data[k] for k in provider_keys if k in data},
            "profile_config": {k: data[k] for k in profile_keys if k in data},
        }

    def model_dump(self, **kwargs) -> dict[str, Any]:
        """Serialize as flat dict for backward compatibility."""
        result = {}
        result.update(self.provider_config.model_dump(**kwargs))
        result.update(self.profile_config.model_dump(**kwargs))
        return result
```

This ensures existing `hermes.local.json` files load without changes, and saving produces the same flat structure.

#### 3.3 Provider Alias Normalization

The `normalize_provider_aliases` validator remains on `LLMProviderConfig` (not on the composed `LLMConfig`), so alias resolution happens close to the provider field.

---

### 4. CSS Consolidation

#### 4.1 Layer Architecture

```css
/* desktop/src/styles.css */
@import "./styles/base.css";        /* Layer 1: resets, variables, typography */
@import "./styles/layout.css";      /* Layer 2: shell grid, sidebar, panels */
@import "./styles/components.css";  /* Layer 3: buttons, inputs, cards, chips */
@import "./styles/timeline.css";    /* Layer 4: feature — chat timeline */
@import "./styles/composer.css";    /* Layer 4: feature — message composer */
@import "./styles/settings.css";    /* Layer 4: feature — settings panel */
@import "./styles/inspector.css";   /* Layer 4: feature — MCP inspector */
@import "./styles/benchmark.css";   /* Layer 4: feature — benchmark split */
@import "./styles/overlays.css";    /* Layer 4: feature — modals, palette */
@import "./styles/onboarding.css";  /* Layer 4: feature — onboarding flow */
@import "./styles/lab.css";         /* Layer 4: feature — lab panels */
@import "./styles/responsive.css";  /* Layer 5: media queries (last) */
```

`improvements.css` is deleted. Its rules are redistributed:
- Layout fixes → `layout.css`
- Component tweaks → `components.css`
- Feature-specific overrides → the matching feature CSS file

#### 4.2 Deduplication Strategy

When the same selector exists in multiple files with conflicting declarations, the rule stays in the **most specific** domain file. If it's a generic component selector (e.g., `.btn`), it belongs in `components.css`. If it's scoped to a feature (e.g., `.settings-panel .btn`), it stays in `settings.css`.

---

### 5. Dead Code Removal

**Frontend**: Use TypeScript's `--noUnusedLocals` and `--noUnusedParameters` flags combined with tree-shaking analysis from Vite's build output to identify unreachable code.

**Backend**: Use `vulture` (or manual grep-based reachability) from `main.py` as the entry point.

Unused imports are removed by running `ruff check --fix` (Python) and ESLint `no-unused-imports` (TypeScript).

---

### 6. Naming Convention Unification

**TypeScript rules** (enforced via ESLint `@typescript-eslint/naming-convention`):
- Variables, functions, parameters: `camelCase`
- Types, interfaces, classes: `PascalCase`
- Constants: `UPPER_CASE` (for true module-level constants only)

**Python rules** (enforced via ruff `N` rules):
- Variables, functions, parameters, modules: `snake_case`
- Classes: `PascalCase`
- Constants: `UPPER_CASE`

Renaming is performed using IDE-level refactoring (semantic rename) to update all references atomically.

---

## Data Models

### Configuration Data Flow

```
hermes.local.json (flat or structured)
        │
        ▼
   AppConfig.load()
        │
        ├── LLMConfig
        │     ├── LLMProviderConfig  (provider, model, api_base, api_key_env, ...)
        │     └── AIProfileConfig    (temperature, max_tokens, system_prompt, ...)
        │
        ├── MCPServerConfig[]
        └── llm_profiles: dict[str, LLMConfig]
```

### Provider Adapter Data Flow

```
LLMEngine.run_conversation()
        │
        ▼
  get_adapter(provider_config) → ProviderAdapter
        │
        ▼
  adapter.complete(messages, provider_config, tools, ...)
        │
        ▼
  CompletionResult { assistant_message, usage, latency_ms }
```

---

## Error Handling

- **Config loading**: If a field is missing from the flat format, Pydantic's defaults apply. If a field is of the wrong type, validation raises `ValidationError` with a clear path (same as current behavior).
- **Provider adapter errors**: Each adapter raises `RuntimeError` with a descriptive message (same as current `_run_local_cli_completion` and `_run_github_models_completion` patterns). The engine catches these and publishes an error event.
- **Import path migration**: All re-exports from `app.ts` ensure that existing import sites (`import { X } from "./app/app"`) continue to resolve. TypeScript compilation failure is the catch-all for broken references.
- **CSS specificity conflicts**: The import order in `styles.css` establishes cascade priority. Later imports win in case of equal specificity.

---

## Testing Strategy

### Dual Approach

- **Property-based tests** verify universal invariants (config round-trip, export preservation, adapter conformance)
- **Snapshot tests** capture pre-refactoring behavior for comparison (DOM output, API responses)
- **Static analysis** enforces structural constraints (no circular deps, naming conventions, no dead code)
- **Smoke tests** verify one-time structural outcomes (file existence, line count limits, import ordering)

### Tooling

| Layer | Tool | Purpose |
|-------|------|---------|
| TypeScript types | `tsc --noEmit` | Catch broken references after decomposition |
| Dead code (TS) | `eslint no-unused-imports` + Vite tree-shake | Detect unreachable symbols |
| Dead code (Python) | `ruff` + `vulture` | Detect unreachable symbols |
| Naming (TS) | `@typescript-eslint/naming-convention` | Enforce camelCase/PascalCase |
| Naming (Python) | `ruff N` rules | Enforce snake_case/PascalCase |
| Circular deps | `madge --circular` | Detect import cycles |
| CSS coverage | `purgecss` (dry-run mode) | Identify unused selectors |
| Config compat | `pytest` + Hypothesis | Property-based round-trip tests |
| API identity | `pytest` + HTTPX | Snapshot comparison of responses |

### Test Execution

- Property tests run with minimum 100 iterations per property
- Snapshot tests are generated once from the pre-refactoring codebase, then validated against post-refactoring output
- Static analysis runs in CI as a pre-merge gate

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Export Preservation

*For any* symbol that was publicly exported from the original `app.ts` module, importing that symbol from the refactored `app.ts` (same path) shall resolve to a function or value with the same TypeScript type signature.

**Validates: Requirements 1.3**

### Property 2: Provider Adapter Protocol Conformance

*For any* provider adapter registered in the provider registry, the adapter shall implement all methods defined by the `ProviderAdapter` protocol with compatible signatures, and calling `get_adapter()` with the corresponding provider name shall return an instance satisfying the protocol.

**Validates: Requirements 2.3**

### Property 3: Configuration Format Round-Trip

*For any* valid `LLMConfig` instance (whether constructed from a flat JSON object or a structured JSON object with `provider_config`/`profile_config` keys), serializing to a dictionary and deserializing back shall produce an equivalent `LLMConfig` with identical field values.

**Validates: Requirements 3.3, 3.4**

### Property 4: Frontend Render Identity

*For any* valid `HermesState`, the DOM output produced by the render pipeline after refactoring shall be structurally identical to the DOM output produced by the pre-refactoring render pipeline for the same state.

**Validates: Requirements 7.1**

### Property 5: Backend API Response Identity

*For any* valid HTTP request (method, path, headers, body) to a supported API endpoint, the response status code, headers, and JSON body returned by the refactored backend shall be identical to those returned by the pre-refactoring backend given the same application state.

**Validates: Requirements 7.2**
