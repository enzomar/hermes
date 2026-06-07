# Hermes UI Architecture Guidelines

## Overview

Hermes is an AI execution IDE with chat as one interface. The UI architecture is designed to provide clear context switching between different modes of operation while maintaining a consistent, professional layout.

## Core Design Philosophy

### Mental Model
- **Not:** "AI chat app with debugging features"
- **Is:** "AI execution IDE with chat as one interface"

### Key Principle
The UI must commit to ONE mental model at a time. Users should always know: "Am I chatting, debugging, or inspecting a run?"

---

## Layout Architecture

### High-Level Structure

```
┌─────────────────────────────────────────────────────────────┐
│ APP HEADER (Fixed Top)                                      │
│  [Logo + Name]    [Mode Switcher]         [Commands]        │
├──────────────┬──────────────────────────────────────────────┤
│              │                                               │
│  SIDEBAR     │  MAIN CONTENT AREA                           │
│              │                                               │
│  ┌────────┐ │  ┌─────────────────────────────────────────┐ │
│  │Context │ │  │  Workspace (mode-specific views)        │ │
│  │ual     │ │  │                                         │ │
│  │Content │ │  │  • Chat View                            │ │
│  │        │ │  │  • MCP Inspect View                     │ │
│  │        │ │  │  • Benchmark View                       │ │
│  │        │ │  │  • Debug Timeline View                  │ │
│  └────────┘ │  │                                         │ │
│  ┌────────┐ │  │                                         │ │
│  │ Static │ │  │                                         │ │
│  │  Menu  │ │  │                                         │ │
│  └────────┘ │  └─────────────────────────────────────────┘ │
│              │                                               │
├──────────────┴──────────────────────────────────────────────┤
│ APP FOOTER (Fixed Bottom)                                   │
│  Status: Ready    Events: 0    Tools: 0    [Logs]          │
└─────────────────────────────────────────────────────────────┘
```

---

## 1. App Header (Fixed Top Bar)

### Purpose
Global navigation and mode switching. Always visible regardless of current context.

### Components

**Left Section:**
- Hermes logo (H mark with gradient background)
- Brand name ("Hermes" / "AI Workspace")
- Sidebar toggle button

**Center Section:**
- **Mode Switcher** (Primary Navigation)
  - 💬 Chat Mode
  - 🔧 MCP Inspect Mode
  - 📊 Benchmark Mode
  - 🧪 Debug Timeline Mode

**Right Section:**
- Commands button (⌘K / Ctrl+K)

### Implementation
- **Class:** `.app-header`
- **Height:** Fixed 64px
- **Background:** `rgba(0, 0, 0, 0.3)` with subtle border-bottom
- **Z-index:** Above all content

### Design Rules
- ✅ Mode switcher is ALWAYS visible
- ✅ Logo placement is consistent across all modes
- ✅ Quick access to command palette from header
- ❌ Never hide the mode switcher
- ❌ Don't add mode-specific content to header

---

## 2. Sidebar (Left Panel)

### Purpose
Provide contextual navigation based on active mode, plus persistent workspace settings access.

### Structure

The sidebar has TWO sections:

#### A. Contextual Section (Top - Scrollable)
Content changes based on active mode.

**💬 Chat Mode:**
```
┌─────────────────┐
│ 🔍 Search       │
├─────────────────┤
│ [+ New Chat]    │
├─────────────────┤
│ Conversations   │
│ • Session 1     │
│ • Session 2     │
│ • Session 3     │
└─────────────────┘
```

**🔧 MCP Inspect Mode:**
```
┌─────────────────┐
│ MCP Servers (3) │
│ ● Filesystem    │
│ ● Database      │
│ ○ Remote Demo   │
└─────────────────┘
```

**📊 Benchmark Mode:**
```
┌─────────────────┐
│ AI Profiles     │
│ • GPT-4 Mini    │
│ • Claude Sonnet │
│ • Local Llama   │
└─────────────────┘
```

**🧪 Debug Timeline Mode:**
```
┌─────────────────┐
│ Timeline Runs   │
│ • Run #45       │
│ • Run #44       │
│ • Run #43       │
└─────────────────┘
```

#### B. Static Section (Bottom - Always Visible)
Never changes, regardless of mode.

```
┌─────────────────┐
│ System          │
├─────────────────┤
│ ⚙️  Settings    │
│    AI + MCP     │
└─────────────────┘
```

Selecting `Settings` opens a shared workspace settings page with horizontal tabs:
- `AI Profiles`
- `MCP Connectors`

### Implementation
- **Contextual:** `.sidebar-contextual` (flex-grow, scrollable)
- **Static:** `.sidebar-static` (flex-shrink-0, fixed at bottom)
- **Width:** `280px` normal, `92px` collapsed
- **Collapse:** Icon-only mode with tooltips

### Design Rules
- ✅ Contextual section MUST change when mode changes
- ✅ Static section MUST always be visible (no scrolling out of view)
- ✅ Collapsed mode shows icons + tooltips only
- ❌ Never show chat conversations in MCP Inspect mode
- ❌ Never hide the shared Settings entry
- ❌ Don't mix contextual and static content

---

## 3. Main Content Area (Center/Right)

### Purpose
Display the active mode's primary workspace.

### Views

Each mode has a DEDICATED view section. The workspace also hosts a shared Settings surface opened from the sidebar.

#### 💬 Chat View
- **Header:** Session title (editable), status pill, model switcher
- **Content:** Timeline, composer
- **Footer:** Feedback banner, tool attachments

#### 🔧 MCP Inspect View
- **Header:** "MCP Inspector", refresh button
- **Content:** Server connections, tool call logs, payload inspection
- **Footer:** Real-time event count

#### 📊 Benchmark View
- **Header:** "Benchmark Workspace", exit button
- **Content:** Side-by-side model comparison (split panes)
- **Footer:** Benchmark controls, run button

#### 🧪 Debug Timeline View
- **Header:** "Debug Timeline", export button
- **Content:** Structured execution flow (User → LLM → Tools → Response)
- **Footer:** Timeline filters, replay controls

#### ⚙️ Settings Workspace
- **Header:** "Settings", close button
- **Content:** Horizontal tabs for AI Profiles and MCP Connectors
- **Behavior:** Reuses the current AI profile editor and MCP connector editor inside one shared shell

### Implementation
- **Container:** `#workspace-main`
- **Views:** `#chat-view`, `#mcp-inspect-view`, `#benchmark-view`, `#debug-timeline-view`, `#settings-overlay`
- **Behavior:** Only ONE view visible at a time
- **Transitions:** Instant switch (no animation)

### Design Rules
- ✅ Each view is self-contained with its own header
- ✅ Only show ONE view at a time
- ✅ Headers are mode-specific (no generic "workspace" title)
- ❌ Never show chat timeline in Benchmark view
- ❌ Don't reuse views across modes
- ❌ No "hybrid" views mixing multiple contexts

---

## 4. App Footer (Fixed Bottom Bar)

### Purpose
Display global system status and quick access to logs.

### Components

```
┌──────────────────────────────────────────────────┐
│ Status: Ready │ Events: 0 │ Tools: 3 │ [📋 Logs] │
└──────────────────────────────────────────────────┘
```

### Sections
- **Status:** Current system state (Ready, Running, Error, Streaming)
- **Events:** Total event count from event store
- **Tools:** Connected MCP tools count
- **Logs Button:** Toggle expandable logs panel

### Implementation
- **Class:** `.app-footer`
- **Height:** Fixed 32px
- **Background:** `rgba(0, 0, 0, 0.25)`
- **Font:** Small (10-11px), uppercase labels

### Design Rules
- ✅ Very small and unobtrusive
- ✅ Always visible (no hide/collapse)
- ✅ Read-only status display (no interactive controls except Logs)
- ❌ Don't add mode-specific content
- ❌ Don't exceed 32px height
- ❌ No input fields or forms

---

## 5. Mode System

### Mode Definitions

| Mode | Icon | Purpose | Primary Action |
|------|------|---------|----------------|
| **Chat** | 💬 | Conversational AI interaction | Send messages |
| **MCP Inspect** | 🔧 | Debug tool execution & server health | Inspect tool calls |
| **Benchmark** | 📊 | Compare AI models side-by-side | Run comparisons |
| **Debug Timeline** | 🧪 | Visualize execution flow | Replay & analyze |

### Mode Switching Behavior

When user switches modes:

1. **Update Mode Switcher**
   - Set `aria-selected="true"` on active tab
   - Visual highlight (blue background)

2. **Hide Current View**
   - Set `hidden` attribute on old view

3. **Show New View**
   - Remove `hidden` from new view
   - Ensure proper layout

4. **Update Sidebar Contextual Content**
   - Hide old contextual section
   - Show new contextual section matching mode

5. **Persist State**
   - Save `appMode` to localStorage
   - Restore on page reload

### Implementation Example

```typescript
function setAppMode(mode: AppMode): void {
  state.ui.appMode = mode;

  // Update mode tabs
  document.querySelectorAll('.mode-tab').forEach(tab => {
    tab.setAttribute('aria-selected', 
      String(tab.dataset.mode === mode));
  });

  // Switch workspace view
  hideAllViews();
  showView(`#${mode}-view`);

  // Switch sidebar contextual content
  hideAllSidebarContextual();
  showSidebarContextual(`#sidebar-${mode}-content`);

  persistWorkspaceState(state);
}
```

### Design Rules
- ✅ Mode switch updates BOTH workspace AND sidebar
- ✅ Only one mode active at a time
- ✅ Mode persists across sessions
- ❌ Never show mixed mode content
- ❌ Don't animate mode transitions (instant is better)
- ❌ Don't disable mode tabs (all modes always accessible)

---

## 6. Visual Design System

### Colors

```css
/* Surface Levels */
--surface-base: rgba(17, 20, 23, 0.84);
--surface-raised: rgba(255, 255, 255, 0.04);
--surface-accent: rgba(121, 168, 255, 0.12);

/* Borders */
--border-subtle: rgba(255, 255, 255, 0.06);
--border-strong: rgba(255, 255, 255, 0.12);

/* Text */
--text-primary: #f3f5f7;
--text-secondary: #9ca3af;
```

### Border Radius

```css
--radius-xl: 16px;  /* Large containers */
--radius-lg: 12px;  /* Cards */
--radius-md: 10px;  /* Buttons */
--radius-sm: 8px;   /* Small elements */
```

### Spacing

```css
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-6: 24px;
```

### Typography

```css
--text-base: 0.875rem;  /* 14px - Body text */
--text-sm: 0.8125rem;   /* 13px - Secondary */
--text-xs: 0.75rem;     /* 12px - Labels */
--text-2xs: 0.6875rem;  /* 11px - Metadata */
```

---

## 7. Responsive Behavior

### Sidebar Collapse

**Normal State (280px):**
- Full text labels
- Section headers visible
- Search boxes visible

**Collapsed State (92px):**
- Icon-only buttons
- Tooltips on hover
- No text labels
- Vertical icon alignment

### Breakpoints

```css
/* Desktop First */
@media (max-width: 1280px) {
  /* Reduce spacing */
}

@media (max-width: 1080px) {
  /* Single column layout */
  /* Sidebar becomes overlay */
}

@media (max-width: 860px) {
  /* Mobile optimizations */
}
```

---

## 8. Accessibility

### Keyboard Navigation

- **⌘K / Ctrl+K:** Open command palette
- **⌘N / Ctrl+N:** New chat
- **⌘1-4:** Switch modes (Chat, MCP, Benchmark, Timeline)
- **⌘B:** Toggle sidebar
- **Tab:** Navigate focusable elements
- **Escape:** Close modals/overlays

### ARIA Labels

```html
<!-- Mode Switcher -->
<div role="tablist" aria-label="Application mode">
  <button role="tab" aria-selected="true" 
          aria-controls="chat-view">
    Chat
  </button>
</div>

<!-- Views -->
<section id="chat-view" role="tabpanel" 
         aria-labelledby="chat-mode-tab">
  ...
</section>
```

### Focus Management

- Focus trap in modals
- Focus restoration after close
- Visible focus indicators (blue outline)
- Skip to main content link

---

## 9. File Organization

### Structure

```
desktop/src/
├── app/
│   ├── layout.ts           # Main layout HTML structure
│   ├── app.ts              # Application logic & mode switching
│   ├── types.ts            # TypeScript type definitions
│   ├── state.ts            # State management & persistence
│   └── components/
│       ├── workspace.ts    # Workspace rendering
│       └── sidebar.ts      # Sidebar rendering
└── styles/
    ├── base.css            # Global resets & variables
    ├── layout.css          # Core layout structure
    ├── improvements.css    # UI enhancements & new layout
    └── responsive.css      # Breakpoints & collapsed states
```

### Component Responsibilities

**layout.ts:**
- Define HTML structure (header, sidebar, main, footer)
- Create mode-specific view sections
- Define contextual sidebar sections

**app.ts:**
- Mode switching logic
- View visibility management
- Event handlers
- State persistence

**improvements.css:**
- App header styles
- Mode switcher styles
- Sidebar layout (contextual + static)
- Footer styles

**responsive.css:**
- Sidebar collapse behavior
- Breakpoint adjustments
- Mobile optimizations

---

## 10. Development Guidelines

### Adding a New Mode

1. **Update Types** (`types.ts`)
```typescript
export type AppMode = "chat" | "mcp-inspect" | 
                      "benchmark" | "debug-timeline" | 
                      "your-new-mode";
```

2. **Add Mode Tab** (`layout.ts`)
```html
<button type="button" class="mode-tab" 
        data-action="set-app-mode" 
        data-mode="your-new-mode">
  <span>🎯</span>
  <span>Your Mode</span>
</button>
```

3. **Create View Section** (`layout.ts`)
```html
<section id="your-new-mode-view" class="your-mode-view" hidden>
  <header class="workspace-header">
    <h1>Your Mode Title</h1>
  </header>
  <div class="your-mode-content">
    <!-- Mode-specific content -->
  </div>
</section>
```

4. **Create Sidebar Content** (`layout.ts`)
```html
<div id="sidebar-your-mode-content" 
     class="sidebar-mode-content" hidden>
  <div class="sidebar-section">
    <!-- Contextual sidebar for this mode -->
  </div>
</div>
```

5. **Update Mode Switch Logic** (`app.ts`)
```typescript
case "your-new-mode":
  if (yourModeView) yourModeView.hidden = false;
  if (sidebarYourModeContent) sidebarYourModeContent.hidden = false;
  setActiveWorkspaceView("your-new-mode");
  break;
```

### Best Practices

**DO:**
- ✅ Keep modes fully isolated (no shared state)
- ✅ Create dedicated view sections for each mode
- ✅ Update both workspace AND sidebar on mode change
- ✅ Use semantic HTML (`<header>`, `<section>`, `<footer>`)
- ✅ Add ARIA labels for accessibility
- ✅ Test keyboard navigation
- ✅ Persist mode state to localStorage

**DON'T:**
- ❌ Reuse view sections across modes
- ❌ Mix contextual content from different modes
- ❌ Hide the mode switcher
- ❌ Add mode-specific logic to global header/footer
- ❌ Use inline styles (always use CSS classes)
- ❌ Forget to update sidebar contextual content

---

## 11. Error Handling

### Error Display Strategy

**Inline Errors (In-context):**
- Tool call failures → Show in timeline
- Form validation → Show under field
- Connection issues → Show in header status

**Error Panel (Right-side diagnostic panel):**
- System errors (API failures)
- MCP server crashes
- Configuration issues

**Error Structure:**
```
┌─────────────────────────────┐
│ ⚠ Missing OpenAI API Key    │
├─────────────────────────────┤
│ Cause: No key found in env  │
├─────────────────────────────┤
│ [Set API Key]               │
│ [Open .env Editor]          │
│ [Use Different Profile]     │
└─────────────────────────────┘
```

### Design Rules
- ✅ Errors are actionable (provide fix buttons)
- ✅ Group related errors in diagnostic panel
- ✅ Use inline errors for immediate feedback
- ❌ Don't show large error blocks in timeline
- ❌ Don't block the entire UI with errors
- ❌ Don't use generic error messages

---

## 12. Performance Considerations

### Virtual Scrolling
- Timeline with 1000+ messages should use virtual scrolling
- Conversation list with 100+ sessions should virtualize

### Lazy Loading
- Only render active mode's view
- Defer loading of hidden sidebar sections
- Load MCP inspector data on-demand

### State Management
- Minimize DOM updates (use `hidden` attribute, not display:none)
- Batch updates when switching modes
- Debounce search inputs

---

## 13. Future Enhancements

### Planned Features
1. **Execution Timeline** - Structured run visualization (killer feature)
2. **Error Diagnostic Panel** - Right-side panel with quick fixes
3. **Session Header Redesign** - Git branch metaphor for sessions
4. **Split View for MCP Inspector** - Chat + execution logs side-by-side
5. **Enhanced Command Palette** - Run MCP tools directly from ⌘K

### Design Considerations
- Maintain mode isolation
- Keep header/footer consistent
- Don't add complexity to sidebar
- Preserve keyboard shortcuts
- Ensure accessibility

---

## Conclusion

This layout architecture provides:
- ✅ Clear mental model (mode-first navigation)
- ✅ Contextual sidebar (no confusion about what you're seeing)
- ✅ Professional structure (header, sidebar, main, footer)
- ✅ Scalability (easy to add new modes)
- ✅ Accessibility (keyboard nav, ARIA, focus management)

**Key Takeaway:** The UI commits to ONE mode at a time. Mode switcher in header changes EVERYTHING: workspace view + sidebar content. This eliminates context confusion and provides a clear, IDE-like experience.
