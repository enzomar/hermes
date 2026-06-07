# Hermes Development Guidelines

This file provides context for AI assistants working on the Hermes codebase.

## Project Overview

Hermes is an **AI Execution IDE** (not just a chat app). It combines:
- Streaming AI chat interface
- Multi-server MCP runtime
- Protocol inspection (Postman-style)
- Replayable event sourcing
- Model benchmarking

**Tech Stack:**
- **Backend:** Python (FastAPI, LiteLLM, MCP SDK)
- **Frontend:** TypeScript, Vite, Vanilla JS
- **Desktop:** Tauri (Rust shell)
- **Database:** SQLite (event store)

## UI/UX Philosophy

Read `UI_ARCHITECTURE.md` for complete details. Key principles:

### Mental Model
**"AI execution IDE with chat as one interface"** (not "chat app with tools")

### Mode-First Architecture
The app has 4 primary modes, each with its own complete interface:
- 💬 **Chat Mode** - Conversational AI
- 🔧 **MCP Inspect Mode** - Debug tool execution
- 📊 **Benchmark Mode** - Compare models
- 🧪 **Debug Timeline Mode** - Execution flow visualization

### Layout Structure
```
┌────────────────────────────────────────┐
│ Header: Logo | Mode Switcher | Actions │
├─────────────┬──────────────────────────┤
│ Sidebar:    │ Main: Mode-Specific View │
│ Contextual  │                          │
│ + Static    │                          │
├─────────────┴──────────────────────────┤
│ Footer: Status | Events | Tools | Logs │
└────────────────────────────────────────┘
```

## File Organization

### Backend (`/`)
```
main.py              # Entry point
config.py            # Configuration loader
core/
  event_bus.py       # Event system
  store.py           # SQLite event store
llm/
  engine.py          # LiteLLM orchestration
  streaming.py       # Token streaming
mcp/
  client.py          # MCP client manager
  transport_*.py     # STDIO/SSE transports
```

### Frontend (`/desktop/src`)
```
app/
  layout.ts          # HTML structure (header, sidebar, views)
  app.ts             # Mode switching, event handlers
  types.ts           # TypeScript types (AppMode, HermesState)
  state.ts           # State management & persistence
  components/
    workspace.ts     # Workspace rendering logic
    sidebar.ts       # Sidebar rendering (sessions, servers)
styles/
  base.css           # Variables, resets
  layout.css         # Core layout grid
  improvements.css   # New layout (app-header, app-footer)
  responsive.css     # Breakpoints, collapsed states
```

## Critical Development Rules

### 1. Mode Isolation
✅ **DO:**
- Each mode has its own view section (`#chat-view`, `#mcp-inspect-view`, etc.)
- Each mode has its own sidebar content (`#sidebar-chat-content`, etc.)
- Only ONE view visible at a time

❌ **DON'T:**
- Mix mode content (e.g., showing chat sessions in Benchmark mode)
- Reuse view components across modes
- Show mode-specific UI in global header/footer

### 2. Layout Modifications
✅ **DO:**
- Use `.app-shell` for main container (not `.shell`)
- Keep mode switcher in `.app-header` (always visible)
- Split sidebar into `.sidebar-contextual` and `.sidebar-static`
- Keep footer at fixed 32px height

❌ **DON'T:**
- Move mode switcher inside workspace
- Change header/footer structure without updating guidelines
- Mix contextual and static sidebar content
- Add mode-specific content to app header

### 3. Mode Switching
When switching modes, update:
1. Mode tab `aria-selected` attributes
2. Hide all workspace views, show target view
3. Hide all sidebar contextual content, show target content
4. Persist `state.ui.appMode` to localStorage

Example:
```typescript
function setAppMode(mode: AppMode): void {
  // Update UI
  updateModeTabs(mode);
  
  // Switch workspace view
  hideAllViews();
  showView(`#${mode}-view`);
  
  // Switch sidebar content
  hideAllSidebarContextual();
  showSidebarContextual(`#sidebar-${mode}-content`);
  
  // Persist
  state.ui.appMode = mode;
  persistWorkspaceState(state);
}
```

### 4. CSS Class Naming
✅ **Use:**
- `.app-shell` - Main application container
- `.app-header` - Top bar with logo + mode switcher
- `.app-main` - Layout container (sidebar + main content)
- `.app-footer` - Bottom status bar
- `.sidebar-contextual` - Mode-specific sidebar content
- `.sidebar-static` - Always-visible sidebar section
- `.mode-tab` - Mode switcher button
- `.workspace-main` - Main content area container

❌ **Don't use:**
- `.shell` (deprecated, use `.app-shell`)
- Mode-specific classes in global layout

### 5. State Management
```typescript
// State structure (types.ts)
type HermesState = {
  activeSessionId: string | null;
  sessions: JsonObject[];
  ui: {
    appMode: AppMode;              // Current mode
    workspaceView: WorkspaceView;  // Internal view state
    sidebarCollapsed: boolean;
    // ...
  };
};

// Persist to localStorage
persistWorkspaceState(state);

// Load on boot
const persisted = loadPersistedWorkspace();
```

## Adding New Features

### Adding a New Mode

1. **Update Type** (`app/types.ts`):
```typescript
export type AppMode = "chat" | "mcp-inspect" | 
                      "benchmark" | "debug-timeline" | 
                      "your-mode";
```

2. **Add Mode Tab** (`app/layout.ts` in `app-header`):
```html
<button type="button" class="mode-tab" 
        data-action="set-app-mode" 
        data-mode="your-mode">
  <span>🎯</span>
  <span>Your Mode</span>
</button>
```

3. **Create View** (`app/layout.ts` in `workspace-main`):
```html
<section id="your-mode-view" class="your-mode-view" hidden>
  <header class="workspace-header">
    <h1>Your Mode Title</h1>
  </header>
  <div><!-- Content --></div>
</section>
```

4. **Create Sidebar Content** (`app/layout.ts` in `sidebar-contextual`):
```html
<div id="sidebar-your-mode-content" 
     class="sidebar-mode-content" hidden>
  <!-- Contextual sidebar items -->
</div>
```

5. **Update Switch Logic** (`app/app.ts` in `setAppMode`):
```typescript
case "your-mode":
  if (yourModeView) yourModeView.hidden = false;
  if (sidebarContent) sidebarContent.hidden = false;
  setActiveWorkspaceView("your-mode");
  break;
```

### Adding a UI Component

1. Create HTML in `layout.ts`
2. Add rendering logic in `components/`
3. Add styles in `styles/improvements.css`
4. Update TypeScript types if needed
5. Add event handlers in `app.ts`

### Backend Event Flow

```
User Action → Event Emission → EventBus → Projections
                                    ↓
                              EventStore (SQLite)
                                    ↓
                            Inspector/Telemetry
```

Example:
```python
# Emit event
await self.bus.emit(Event(
    event_id=str(uuid.uuid4()),
    event_type="user_message",
    session_id=self.session_id,
    timestamp=datetime.now(timezone.utc).isoformat(),
    payload={"content": message}
))
```

## Common Tasks

### Update Sidebar for a Mode

1. Find contextual section in `layout.ts`:
```html
<div id="sidebar-your-mode-content" class="sidebar-mode-content" hidden>
```

2. Update content structure
3. Add rendering logic in `components/sidebar.ts` if dynamic
4. Test mode switching

### Add Status to Footer

1. Update footer in `layout.ts`:
```html
<div class="app-footer-section">
  <span class="app-footer-label">Your Label</span>
  <span id="your-value" class="app-footer-value">0</span>
</div>
```

2. Update value in JavaScript:
```typescript
setText("#your-value", newValue);
```

### Style a Component

1. Add styles to `styles/improvements.css`:
```css
.your-component {
  display: flex;
  gap: var(--space-3);
  padding: var(--space-4);
  background: var(--surface-raised);
  border-radius: var(--radius-md);
}
```

2. Use design tokens (see `styles/base.css` and `styles/improvements.css`)

## Design Tokens

### Colors
```css
--surface-base: rgba(17, 20, 23, 0.84);
--surface-raised: rgba(255, 255, 255, 0.04);
--surface-accent: rgba(121, 168, 255, 0.12);
--border-subtle: rgba(255, 255, 255, 0.06);
--border-strong: rgba(255, 255, 255, 0.12);
--text-primary: #f3f5f7;
--text-secondary: #9ca3af;
```

### Spacing
```css
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-6: 24px;
```

### Border Radius
```css
--radius-xl: 16px;
--radius-lg: 12px;
--radius-md: 10px;
--radius-sm: 8px;
```

### Typography
```css
--text-base: 0.875rem;  /* 14px */
--text-sm: 0.8125rem;   /* 13px */
--text-xs: 0.75rem;     /* 12px */
--text-2xs: 0.6875rem;  /* 11px */
```

## Testing Changes

### Frontend
```bash
cd desktop
npm run dev  # Development server with hot reload
```

### Backend
```bash
make start-backend  # Python backend only
```

### Full Stack
```bash
make start  # Backend + Tauri desktop app
```

## Common Pitfalls

### ❌ Wrong: Moving mode switcher inside workspace
```html
<!-- DON'T -->
<section id="chat-view">
  <header>
    <div class="mode-switcher">...</div>
  </header>
</section>
```

### ✅ Right: Mode switcher in app header
```html
<!-- DO -->
<header class="app-header">
  <div class="mode-switcher">...</div>
</header>
```

### ❌ Wrong: Mixing mode content
```typescript
// DON'T show chat sessions in benchmark sidebar
if (mode === "benchmark") {
  showSidebarContent("#sidebar-chat-content"); // WRONG
}
```

### ✅ Right: Contextual content per mode
```typescript
// DO show appropriate content per mode
if (mode === "benchmark") {
  showSidebarContent("#sidebar-benchmark-content"); // RIGHT
}
```

### ❌ Wrong: Inline styles
```html
<!-- DON'T -->
<div style="display: flex; gap: 10px;">...</div>
```

### ✅ Right: CSS classes
```html
<!-- DO -->
<div class="flex-row gap-3">...</div>
```

## Keyboard Shortcuts

Implement in `app.ts`:
- **⌘K / Ctrl+K** - Command palette
- **⌘N / Ctrl+N** - New chat
- **⌘1-4** - Switch modes
- **⌘B** - Toggle sidebar
- **Escape** - Close modals

## Accessibility Requirements

- Add `aria-label` to interactive elements
- Use `role="tablist"` for mode switcher
- Use `aria-selected` for active mode
- Provide keyboard navigation
- Test with screen readers
- Ensure focus indicators are visible

## Performance Considerations

- Virtualize long lists (1000+ items)
- Use `hidden` attribute (not `display: none`) for views
- Debounce search inputs
- Lazy load inactive mode content
- Batch DOM updates during mode switches

## Questions to Ask Before Coding

1. **Does this change affect mode isolation?**
   - If yes, ensure all modes remain independent

2. **Does this change the layout structure?**
   - If yes, update `UI_ARCHITECTURE.md`

3. **Is this a new mode?**
   - Follow "Adding a New Mode" checklist

4. **Does this add global UI (header/footer)?**
   - Ensure it's not mode-specific content

5. **Does this change sidebar content?**
   - Ensure contextual/static split is maintained

## Resources

- **UI Architecture:** `UI_ARCHITECTURE.md`
- **Project README:** `README.md`
- **Backend Events:** `core/event_bus.py`
- **Frontend Types:** `desktop/src/app/types.ts`
- **Main Layout:** `desktop/src/app/layout.ts`

## Git Commit Style

```
type(scope): description

- Added X
- Fixed Y
- Updated Z

Types: feat, fix, refactor, style, docs, test
Scopes: ui, backend, mcp, llm, layout, mode
```

Example:
```
feat(mode): add debug timeline mode

- Added new debug-timeline mode to mode switcher
- Created debug timeline view section
- Added sidebar contextual content for timeline runs
- Updated setAppMode to handle new mode
```

## Final Notes

- **Always** read `UI_ARCHITECTURE.md` before modifying layout
- **Never** break mode isolation
- **Test** mode switching after every change
- **Update** documentation when adding features
- **Ask** if unclear about architecture decisions
