# Requirements Document

## Introduction

This specification defines a behavior-preserving structural refactoring of the Hermes dual-stack application (Python/FastAPI backend + TypeScript/Vite frontend). The goal is to decompose monolithic files, eliminate redundancy, unify patterns, and improve maintainability without changing any user-facing behavior.

## Glossary

- **Frontend**: The TypeScript desktop application located in `desktop/src/`
- **Backend**: The Python FastAPI application at the repository root, including `llm/`, `core/`, and `config.py`
- **App_Module**: The monolithic file `desktop/src/app/app.ts` (~4948 lines)
- **Feature_Module**: A self-contained TypeScript module responsible for a single UI domain (e.g., settings, chat, benchmark)
- **Engine**: The LLM orchestration class in `llm/engine.py`
- **Provider_Adapter**: A module encapsulating provider-specific LLM communication logic (API formatting, auth, CLI wrappers)
- **Orchestration_Layer**: The portion of Engine responsible for conversation flow, tool calling, and session management
- **Config_Module**: The configuration system in `config.py`
- **LLM_Provider_Config**: Configuration related to LLM provider connectivity (API keys, endpoints, model names)
- **AI_Profile_Config**: Configuration related to AI behavior (system prompt, temperature, token limits, penalties)
- **CSS_Architecture**: The organized set of stylesheets in `desktop/src/styles/`
- **Dead_Code**: Functions, classes, CSS rules, or imports that are unreachable or unused at runtime
- **Naming_Convention**: The project-wide rules for identifier naming (camelCase for TS, snake_case for Python)

## Requirements

### Requirement 1: Frontend Module Decomposition

**User Story:** As a developer, I want app.ts broken into focused feature modules, so that I can navigate, understand, and modify individual features without reading thousands of unrelated lines.

#### Acceptance Criteria

1. WHEN the refactoring is complete, THE Frontend SHALL have the App_Module reduced to an initialization entry point of fewer than 300 lines that delegates to Feature_Modules.
2. THE Frontend SHALL organize Feature_Modules into separate files for settings management, chat/messaging, session management, benchmark operations, LLM profile management, and WebSocket handling.
3. THE Frontend SHALL preserve all existing exports from App_Module such that external call sites continue to function without modification.
4. WHEN a Feature_Module is loaded, THE Frontend SHALL share application state through an explicit import of the state module rather than through module-level closures.
5. IF a circular dependency is introduced during decomposition, THEN THE Frontend SHALL resolve the cycle by extracting shared logic into a dedicated utility module.

### Requirement 2: Backend Engine Separation

**User Story:** As a developer, I want the LLM engine separated into orchestration and provider-specific layers, so that adding or modifying a provider does not require changes to the conversation flow logic.

#### Acceptance Criteria

1. WHEN the refactoring is complete, THE Engine SHALL contain only Orchestration_Layer logic: conversation flow, tool-call dispatch, and session management.
2. THE Backend SHALL extract provider-specific logic (GitHub Models completion, local CLI execution, litellm model naming, API key resolution, API header construction) into one or more Provider_Adapter modules within the `llm/` directory.
3. THE Engine SHALL interact with Provider_Adapters through a consistent interface (function signature or protocol class) so that new providers can be added without modifying Orchestration_Layer code.
4. WHEN a Provider_Adapter is called, THE Engine SHALL pass a LLM_Provider_Config object rather than requiring the adapter to access global configuration.

### Requirement 3: Configuration Separation

**User Story:** As a developer, I want LLM provider configuration separated from AI behavior configuration, so that I can reason about connectivity and behavior independently.

#### Acceptance Criteria

1. THE Config_Module SHALL define LLM_Provider_Config as a distinct model containing provider, model name, API base URL, API key reference, custom LLM provider tag, CLI command, and CLI arguments.
2. THE Config_Module SHALL define AI_Profile_Config as a distinct model containing temperature, top_p, presence_penalty, frequency_penalty, max_tokens, timeout_seconds, system_prompt, and disable_tools flag.
3. THE Config_Module SHALL compose the existing LLMConfig from LLM_Provider_Config and AI_Profile_Config such that serialization remains backward-compatible with existing `hermes.local.json` files.
4. WHEN a configuration file is loaded, THE Config_Module SHALL accept both the current flat format and the new structured format without error.

### Requirement 4: CSS Consolidation

**User Story:** As a developer, I want the CSS architecture cleaned up so that styles are predictable, non-overlapping, and free of dead rules.

#### Acceptance Criteria

1. WHEN the refactoring is complete, THE CSS_Architecture SHALL contain no duplicate selectors across separate files that apply conflicting declarations to the same element.
2. THE CSS_Architecture SHALL remove the `improvements.css` file by redistributing its valid rules into the appropriate domain-specific CSS files (layout, components, inspector, settings, etc.).
3. THE CSS_Architecture SHALL remove all CSS rules whose selectors do not match any element rendered by the Frontend.
4. THE Frontend SHALL import styles through a single entry point (`styles.css`) that defines a clear ordering of layer imports (base, layout, components, features, responsive).

### Requirement 5: Dead Code Removal

**User Story:** As a developer, I want unused code removed, so that the codebase accurately represents the running system and does not mislead future readers.

#### Acceptance Criteria

1. THE Frontend SHALL contain no TypeScript functions or exported symbols that are unreachable from the application entry point (`main.ts`).
2. THE Backend SHALL contain no Python functions, classes, or module-level variables that are unreachable from the application entry point (`main.py`) or its test suite.
3. THE Frontend SHALL contain no unused import statements.
4. THE Backend SHALL contain no unused import statements.

### Requirement 6: Naming Convention Unification

**User Story:** As a developer, I want consistent naming across the codebase, so that I can predict identifier style without checking each file individually.

#### Acceptance Criteria

1. THE Frontend SHALL use camelCase for all local variables, function names, and parameters.
2. THE Frontend SHALL use PascalCase for all type aliases, interfaces, and class names.
3. THE Backend SHALL use snake_case for all local variables, function names, parameters, and module names.
4. THE Backend SHALL use PascalCase for all class names.
5. WHEN a naming inconsistency is corrected, THE system SHALL update all references to the renamed symbol so that no broken references remain.

### Requirement 7: Behavior Preservation

**User Story:** As a user, I want the refactoring to produce no observable change in application behavior, so that I can trust the refactored code is equivalent to the original.

#### Acceptance Criteria

1. THE Frontend SHALL produce identical DOM output for all UI states before and after refactoring.
2. THE Backend SHALL respond with identical HTTP responses and WebSocket messages for all supported API endpoints before and after refactoring.
3. WHEN the application starts, THE system SHALL load configuration files, connect to MCP servers, and restore sessions in the same order and with the same results as the pre-refactoring version.
4. THE system SHALL pass all existing tests without modification (apart from import path updates).
