# Hermes Global Refactoring — AI Execution Prompt

Use this prompt with any AI coding assistant to systematically refactor the Hermes codebase. Execute tasks one at a time, verifying each step compiles and runs before moving to the next.

---

## Context

Hermes is a local-first AI workbench with:
- **Python backend** (FastAPI, litellm, OpenAI SDK, Pydantic) at repo root
- **TypeScript frontend** (Vite, vanilla TS, no framework) in `desktop/src/`

The codebase was assembled by multiple AI agents, resulting in fragmentation. This refactoring preserves all features while improving structure.

## Spec Location

Full requirements, design, and tasks are at:
- `.kiro/specs/global-refactoring/requirements.md`
- `.kiro/specs/global-refactoring/design.md`
- `.kiro/specs/global-refactoring/tasks.md`

---

## Execution Instructions

For each task below, follow this pattern:
1. Read the relevant source files
2. Make the structural change
3. Verify with `python -m py_compile <file>` (Python) or `npm run build` (frontend)
4. Move to the next task

### TASK 1.1 — Config: Create sub-models

In `config.py`, create two new Pydantic models ABOVE `LLMConfig`:

```python
ProviderType = Literal["openai", "anthropic", "groq", "mistral", "together", "perplexity", "openrouter", "google", "cohere", "fireworks", "deepseek", "local", "local-cli", "github-copilot"]

class LLMProviderConfig(BaseModel):
    """Connectivity: how to reach the LLM provider."""
    provider: ProviderType = "openai"
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
    system_prompt: str = "You are Hermes, an MCP AI IDE workbench assistant. Be concise, prefer tools when they help, and report tool failures explicitly."
    disable_tools: bool = False
```

Keep the existing `LLMConfig` unchanged for now (it still works as-is). These sub-models will be composed in task 1.2.

### TASK 1.2 — Config: Compose LLMConfig from sub-models

Make `LLMConfig` internally delegate to the sub-models while keeping its flat serialization format. Add properties that proxy through to sub-models. The existing `model_dump()` must produce the same flat dict as before.

### TASK 2.1 — Providers: Create package structure

```
llm/providers/__init__.py   — get_adapter() registry
llm/providers/base.py       — ProviderAdapter protocol + CompletionResult
```

### TASK 2.2–2.4 — Extract adapters

Move provider-specific code from `llm/engine.py` into:
- `llm/providers/litellm_adapter.py` — all litellm-based providers (OpenAI, Anthropic, Groq, etc.)
- `llm/providers/github_models.py` — GitHub Models (uses OpenAI SDK directly)
- `llm/providers/local_cli.py` — local CLI subprocess

Each adapter implements `complete()` and `test_connection()`.

### TASK 2.5 — Refactor engine.py

Replace all provider-specific logic in `LLMEngine` with:
```python
adapter = get_adapter(config)
result = await adapter.complete(messages, config, tools=tools, ...)
```

Engine should be ~150 lines: orchestration loop + event publishing only.

### TASK 4.1–4.9 — Frontend decomposition

Break `desktop/src/app/app.ts` (~5000 lines) into feature modules:

```
desktop/src/app/features/
├── actionRouter.ts      — maps data-action strings to handlers
├── sessions.ts          — create, delete, rename, switch, duplicate
├── settings.ts          — open/close settings panel, save, test
├── llmProfiles.ts       — profile CRUD, form sync, draft management
├── chat.ts              — message submit, timeline, WebSocket events
├── benchmark.ts         — benchmark panel, run, report
├── mcpInspector.ts      — MCP tool runner UI
├── mcpSettings.ts       — MCP server add/edit/delete
├── commandPalette.ts    — palette open/close/filter/execute
├── lab.ts               — lab panels
└── attachments.ts       — file reading, MIME detection
```

Pattern for each extraction:
1. Move functions to the feature module
2. Import `state` from `../state`
3. Re-export from `app.ts` for backward compat
4. Verify `npm run build` passes

Final `app.ts` should be ≤300 lines: boot, mount, event delegation, re-exports.

### TASK 6 — CSS consolidation

1. Delete `improvements.css` — redistribute its rules into domain files
2. Fix import order in `styles.css`: base → layout → components → features → responsive
3. Remove duplicate selectors and dead rules

### TASK 7 — Dead code removal

- Python: `ruff check --fix` + `vulture`
- TypeScript: `tsc --noUnusedLocals` + remove unused imports

### TASK 8 — Naming unification

- TS: camelCase for vars/functions, PascalCase for types
- Python: snake_case for vars/functions, PascalCase for classes
- Use semantic rename tools to update all references

---

## Verification After Each Phase

```bash
# Backend
cd /Users/vmarafioti/devel/hermes
python -m py_compile config.py
python -m py_compile llm/engine.py
python -m py_compile ui/bridge.py

# Frontend
cd desktop
npm run build

# Smoke test
curl http://127.0.0.1:8765/api/health
```

---

## Key Constraints

1. **Behavior-preserving** — No user-facing changes
2. **Backward-compatible config** — `hermes.local.json` must load without changes
3. **No new dependencies** — Use existing packages only
4. **Incremental** — System must compile after each task
5. **Re-export everything** — Existing import paths must continue to work
