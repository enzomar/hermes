# Hermes Production-Ready Improvements

This document tracks the progress of making Hermes production-ready with deterministic startup, observability, complete MCP operator experience, repository context, permissions, and quality polish.

## ✅ Completed: Deterministic Startup

### Scripts Added
- **`scripts/check-deps.sh`** - Comprehensive dependency checker with:
  - Python 3.9+ version validation
  - Node.js 18+ version validation  
  - Rust/Cargo detection in common locations
  - macOS Xcode Command Line Tools check
  - Virtual environment and package validation
  - Config file JSON validation
  - Port availability check
  - Color-coded output with clear error messages
  - Exit codes for CI/CD integration

### Makefile Integration
- Added `make check-deps` target
- Integrated dependency check into `make start`
- All checks run before launch with clear failure messages

### Documentation
- **`SETUP.md`** - Complete setup guide with:
  - Prerequisites list
  - Step-by-step installation for macOS/Linux/Windows
  - Troubleshooting section
  - Configuration examples
  - Development workflow

### Key Improvements
- **No hidden manual steps** - Everything documented
- **Explicit dependency validation** - Clear error messages
- **Clean machine support** - Works from scratch
- **Multiple OS support** - macOS, Linux, Windows covered

---

## ✅ Completed: Structured Logging & Crash Recovery

### Core Logging Module (`core/logging.py`)
- **StructuredFormatter** - JSON logging for machine parsing
- **ConsoleFormatter** - Human-readable colored console output
- **TraceAdapter** - Automatic trace_id injection for request tracking
- **Rotating file handlers**:
  - `hermes.log` - Main log (10MB, 5 backups)
  - `hermes-errors.log` - Errors only (5MB, 3 backups)
- **Startup diagnostics** - System info capture on every start
- **Global exception handler** - Unhandled exceptions logged

### Session Recovery
- **`SessionStore.validate_session()`** - Corruption detection
- **`SessionStore.recover_or_create_session()`** - Automatic recovery
- **`SessionStore.cleanup_corrupted_sessions()`** - Startup validation
- Recovery metadata tracked (recovered_from, recovery_reason)

### WebSocket Reconnection
- **Exponential backoff** - 1s → 2s → 4s → 8s → 16s → 30s (max)
- **Connection state tracking** - Attempt counter, status display
- **Graceful degradation** - User-visible reconnection status
- **Error handling** - Try/catch around message parsing
- **Automatic cleanup** - Socket state cleared on disconnect

### Main.py Enhancements
- Structured logging initialization
- Startup diagnostics capture with unique startup_id
- Config validation before server start
- Graceful KeyboardInterrupt handling
- Critical error logging on fatal exceptions
- Log level and log directory CLI arguments

### Logs Location
```
.hermes/logs/
├── hermes.log              # JSON structured logs
├── hermes-errors.log       # Errors only
└── startup-*.json          # Startup diagnostics
```

---

## 🚧 In Progress: MCP Server Management UI

### Planned Features
- ✅ Server health cards with status indicators (completed in inspector)
- ⏳ Edit server configuration in UI
- ⏳ Enable/disable toggle per server
- ⏳ Delete server from UI
- ⏳ Restart individual server
- ⏳ Visual config editor with validation
- ⏳ Test connection before saving

### Current State
- Settings → MCP Servers shows configured servers
- Can add new servers via UI
- Inspector → Servers tab shows live health
- Need CRUD operations (update, delete, disable)

---

## 🚧 Planned: Manual Tool Runner

### Requirements
- First-class tool execution UI
- Generated input forms from JSON schema
- Support all schema types (string, number, boolean, object, array, enum)
- Request history/saved requests
- Replay from UI
- Response visualization

### Design
- New "Tools" section in main UI
- Tool browser with search/filter
- Click tool → auto-generate form
- Save requests with names
- History panel for replays
- Diff view for comparing responses

---

## 🚧 Planned: File Context Ingestion

### Requirements
- Replace filename-only attachments with content
- Workspace selection/switching
- File-aware prompting
- Context provenance tracking (which files influenced response)
- Token budgets per file
- Syntax highlighting in prompts

### Design
- File picker → read content → include in context
- Context metadata: {file_path, tokens, hash, timestamp}
- Provenance trail in events
- Workspace config in hermes.local.json
- .gitignore respecting
- Binary file detection/exclusion

---

## 🚧 Planned: Permissions & Sandboxing

### Requirements
- Approval boundaries for destructive actions
- Filesystem access controls
- Network access limits
- Profile-level policies
- User confirmation dialogs
- Security metadata in tool definitions

### Design
```json
{
  "tool_permissions": {
    "filesystem": {
      "allowed_paths": ["/workspace"],
      "forbidden_paths": ["~/.ssh", "~/.aws"],
      "require_approval": ["delete", "write"]
    },
    "network": {
      "allowed_hosts": ["api.openai.com"],
      "require_approval": ["external"]
    }
  }
}
```

- Pre-execution permission checks
- User approval modal for dangerous ops
- Audit log of permission grants/denials

---

## 🚧 Planned: UX Polish

### Responsive Design
- Single-screen optimization
- Mobile/tablet layouts
- Proper breakpoints
- Touch-friendly controls

### Layout Persistence
- Remember panel sizes
- Persist sidebar collapsed state
- Save inspector tab preference
- Remember window size/position

### Keyboard Navigation
- Full shortcut coverage
- Tab order optimization
- Visible focus indicators
- Escape key handling
- Keyboard hints in UI

### Accessibility
- ARIA labels everywhere
- Semantic HTML
- Screen reader support
- Color contrast WCAG AA
- Reduced motion support
- Keyboard-only operation

---

## 🚧 Planned: Documentation

### Guides Needed
- ✅ SETUP.md (completed)
- ⏳ ARCHITECTURE.md - System design, data flow
- ⏳ MCP-INTEGRATION.md - Adding new servers
- ⏳ API.md - REST API reference
- ⏳ DEBUGGING.md - Common issues, log analysis
- ⏳ CONTRIBUTING.md - Dev setup, code standards
- ⏳ SECURITY.md - Threat model, permissions

---

## Implementation Priorities

### Phase 1: Foundation (✅ Complete)
1. ✅ Deterministic startup with dependency checks
2. ✅ Structured logging and diagnostics
3. ✅ Crash recovery and WebSocket reconnection

### Phase 2: Core Functionality (Next)
4. MCP server CRUD operations in UI
5. Manual tool runner with schema-based forms
6. File context ingestion with provenance

### Phase 3: Safety & Control
7. Permission system and sandboxing
8. Approval flows for destructive operations
9. Audit logging

### Phase 4: Polish
10. Responsive design improvements
11. Keyboard navigation and accessibility
12. Comprehensive documentation

---

## Testing Strategy

### Manual Testing Checklist
- [ ] Clean install on macOS
- [ ] Clean install on Linux (Ubuntu/Debian)
- [ ] Clean install on Windows
- [ ] Dependency checker catches all missing deps
- [ ] Logs rotate properly
- [ ] WebSocket reconnects after backend restart
- [ ] Corrupted session recovery works
- [ ] MCP server health monitoring accurate
- [ ] All keyboard shortcuts work
- [ ] Screen reader navigation works
- [ ] Mobile layout usable

### Automated Testing Needs
- [ ] Backend unit tests
- [ ] Frontend component tests
- [ ] E2E tests with Playwright
- [ ] MCP integration tests
- [ ] Permission system tests

---

## Metrics for Success

### Reliability
- ✅ 100% deterministic startup from clean machine
- ✅ Structured logs with trace IDs for debugging
- ✅ Automatic recovery from common failures
- ⏳ No data loss from crashes
- ⏳ All errors user-visible with actionable messages

### Usability
- ⏳ <5 min setup time for new users
- ⏳ All features keyboard-accessible
- ⏳ WCAG AA accessibility compliance
- ⏳ Mobile/tablet support

### Completeness
- ⏳ Full CRUD for MCP servers
- ⏳ Manual tool execution without code
- ⏳ File context with provenance
- ⏳ Permission system operational
- ⏳ Comprehensive docs for all features

---

## Notes

### Design Decisions
- **Logging format**: JSON for logs, human-readable for console
- **Reconnection**: Exponential backoff prevents server overload
- **Session recovery**: Create new on corruption rather than repair
- **Dependency check**: Shell script for zero Python dependency

### Known Limitations
- Session recovery creates new session (doesn't repair corrupted data)
- WebSocket reconnection doesn't replay missed events
- No encrypted log storage yet
- File context limited by LLM context window

### Future Enhancements
- Encrypted session storage
- Multi-user support with auth
- Remote workspace support
- Plugin system for extensions
- Telemetry dashboards
