# Hermes User Experience Audit

**Date**: June 6, 2026  
**Version**: 0.1.0  
**Auditor**: AI Developer Review  
**Perspective**: First-time user through power user

---

## Executive Summary

Hermes is an MCP-enabled AI workbench with strong technical foundations but significant usability gaps. The application shows promise as a developer tool but needs substantial UX improvements to be accessible to a broader audience.

**Overall Score: 6.5/10**

### Key Strengths
- ✅ Clean, modern visual design
- ✅ Solid technical architecture
- ✅ Powerful MCP integration capabilities
- ✅ Good inspector/debugging tools for technical users

### Critical Issues
- ❌ No onboarding or first-run experience
- ❌ Complex setup process not visible in UI
- ❌ Many features hidden or undiscoverable
- ❌ Inconsistent terminology and labeling
- ❌ Poor error messaging and recovery
- ❌ Missing essential features (file context, tool runner, permissions)

---

## 1. First Impressions & Onboarding (3/10)

### Current State
**What happens when you first launch Hermes:**
1. User sees empty sidebar with "Hermes AI Workbench" label
2. Main area says "New conversation" with "Pick a suggestion or start a new conversation"
3. No suggestions are actually shown
4. No guidance on what to do next
5. No indication of whether MCP servers are connected
6. No explanation of what Hermes does differently

### Issues
- ❌ **No welcome screen or tutorial** - Users are dropped into an empty interface
- ❌ **No setup wizard** - MCP configuration happens entirely outside the app
- ❌ **No example conversations** - Nothing to demonstrate capabilities
- ❌ **No contextual help** - No tooltips or onboarding hints
- ❌ **Silent failures** - If backend isn't running, UI just shows "Reconnecting..." forever

### Recommendations
```
Priority: CRITICAL

1. Add First-Run Experience:
   - Welcome screen explaining Hermes
   - Quick setup wizard for LLM provider
   - Guided tour of main features
   - Sample conversation templates

2. Status Indicators:
   - Backend connection status (visible)
   - MCP server health (at a glance)
   - Model configuration status
   - Clear "Setup Required" messaging

3. Empty States:
   - Show suggested prompts when no messages
   - "Get Started" card with quick actions
   - Examples of what Hermes can do
   - Link to documentation
```

---

## 2. Information Architecture (6/10)

### Current Structure
```
Main UI:
├── Sidebar
│   ├── Brand/Toggle
│   ├── Search conversations
│   ├── Conversation list
│   └── Workspace card (Search/Settings)
├── Main Workspace
│   ├── Header (Title, Status, Model, Search, Inspector)
│   ├── Timeline (conversation)
│   └── Composer (input area)
└── Inspector Panel (slide-out)
    ├── Tabs: Trace, Tools, Payload, Servers, Logs
    └── Content area

Settings Modal:
├── General (workspace overview)
├── Models (model config)
├── Providers (API settings)
├── MCP Servers (tool connections)
├── Advanced (sampling, timeout)
└── About
```

### Issues
- ⚠️ **Inconsistent terminology**
  - "Inspector" vs "Activity" (both used)
  - "Tools" means both MCP tools and UI controls
  - "Trace" vs "Timeline" vs "Events"
- ⚠️ **Hidden functionality**
  - MCP server management buried in settings
  - Tool execution only via LLM, no manual runner
  - File attachments exist but no way to actually attach content
- ⚠️ **Deep nesting**
  - Settings → Providers → Connection subsection (3 levels)
  - Inspector → Tab → Content (content hard to scan)

### Recommendations
```
Priority: HIGH

1. Consolidate Terminology:
   - Rename "Inspector" → "Activity" everywhere
   - "Tools" → "Connected Tools" or "MCP Tools"
   - Consistent naming across UI and docs

2. Promote Key Features:
   - Move MCP management to main UI (not just settings)
   - Add "Tools" top-level section for manual execution
   - Make file context prominent (not hidden)

3. Flatten Hierarchy:
   - Settings: Models/Providers combined
   - Inspector: Reduce tab count (combine Trace + Tools)
   - Single-click access to common tasks
```

---

## 3. Usability & Task Flows (5/10)

### Critical User Tasks

#### Task 1: Start a Conversation ✅ (Easy)
**Current Flow:**
1. Click "+" or ⌘N
2. Optional: Name conversation
3. Type message
4. Send

**Rating: 8/10** - Works well, but no file context support

#### Task 2: Configure LLM Provider ⚠️ (Moderate)
**Current Flow:**
1. Click Settings
2. Navigate to Providers tab
3. Select mode (OpenAI/GitHub/Local/CLI)
4. Fill API Base, API Key env var name
5. Switch to Models tab
6. Enter model ID
7. Save and test

**Issues:**
- Split across two tabs (Providers + Models)
- No in-app API key entry (must use env vars)
- Test button hidden until fields filled
- No validation until test/save
- No guidance on which model IDs work

**Rating: 4/10** - Functional but confusing

#### Task 3: Add MCP Server ⚠️ (Difficult)
**Current Flow:**
1. Know what MCP is (not explained)
2. Find MCP Servers in settings
3. Enter server name
4. Choose transport (stdio/SSE)
5. Enter command or URL
6. Click Add
7. Hope it works (no immediate feedback)

**Issues:**
- Requires technical knowledge
- No server templates or examples
- No validation before adding
- Connection status not immediate
- Can't edit/delete after adding (must edit JSON)
- No troubleshooting help

**Rating: 3/10** - Power users only

#### Task 4: Run Tool Manually ❌ (Impossible)
**Current Flow:**
- No UI exists for this
- Must trigger via LLM conversation
- Can replay past calls from inspector
- No way to test tools independently

**Rating: 0/10** - Critical missing feature

#### Task 5: Attach Files ❌ (Broken)
**Current Flow:**
1. Click 📎 Files button
2. Select files
3. Filenames appear... but no content sent
4. Message goes to LLM without file context

**Issues:**
- UI suggests files are attached
- But only filenames included, not content
- No indication of size limits
- No preview of what's included
- Misleading user experience

**Rating: 1/10** - Feature appears broken

#### Task 6: Debug Failed Tool Call ⚠️ (Moderate)
**Current Flow:**
1. Notice error in timeline
2. Click "Inspector" button
3. Switch to Tools tab
4. Find the failed call
5. Click Inspect
6. Switch to Payload tab
7. Read error message
8. Try to understand what went wrong

**Issues:**
- Multi-step process
- Error not surfaced in main view
- Payload tab shows raw JSON (not parsed)
- No actionable remediation suggestions
- Can't retry with modified params

**Rating: 5/10** - Works but tedious

---

## 4. Visual Design (7/10)

### Strengths
- ✅ Clean, minimal aesthetic
- ✅ Good use of whitespace
- ✅ Consistent color palette
- ✅ Readable typography
- ✅ Smooth animations

### Issues
- ⚠️ **Color coding inconsistent**
  - Status pills use different colors than state pills
  - Error states sometimes red, sometimes just text
- ⚠️ **Hierarchy unclear**
  - Same font weight for headers and body in places
  - Button importance not always clear
- ⚠️ **Dense information**
  - Settings tabs cramped
  - Inspector content hard to scan
  - Long text blocks unwrapped

### Specific Issues

**Settings Modal:**
```css
/* Current: All tabs same weight */
.settings-tab { font-weight: 400; }

/* Recommendation: Active tab stands out */
.settings-tab.active { font-weight: 600; border-bottom: 2px solid; }
```

**Timeline Messages:**
```
Issue: User vs Assistant messages not visually distinct enough
Current: Just different alignment
Recommendation: Background color, avatar, stronger differentiation
```

**Status Indicators:**
```
Issue: "Connected", "Disconnected", "Error" use same visual weight
Current: Text with small color change
Recommendation: Icons + color + badge style
```

---

## 5. Error Handling & Feedback (4/10)

### Current State

**Good Examples:**
- ✅ WebSocket reconnection shown ("Reconnecting... attempt 2")
- ✅ Settings validation on save
- ✅ Dependency checker script (external)

**Bad Examples:**
- ❌ **Silent failures**
  - MCP server fails to connect → no notification
  - Invalid model ID → only discovered on first message
  - File attachment doesn't include content → no warning
- ❌ **Vague errors**
  - "Error reported" with no details
  - "Request failed" with no reason
  - Backend errors show as "Reconnecting"
- ❌ **No recovery guidance**
  - Error messages don't suggest fixes
  - No link to troubleshooting docs
  - Can't retry from error state

### Examples of Poor Error UX

**Scenario 1: Invalid API Key**
```
Current:
- User clicks Send
- After delay: "Error reported. Hermes reported an error."
- No details, must open inspector

Better:
- Immediate: "API key authentication failed"
- Details: "Check that OPENAI_API_KEY environment variable is set"
- Actions: [Open Settings] [View Docs] [Retry]
```

**Scenario 2: MCP Server Won't Connect**
```
Current:
- Server added in settings
- Goes to "Connected Tools" tab
- See status: "error"
- Error text: "spawn ENOENT"
- No explanation

Better:
- Clear message: "Command 'npx' not found"
- Explanation: "Server command couldn't be executed"
- Actions: [Check Installation] [Edit Config] [Remove Server]
- Link to MCP troubleshooting guide
```

**Scenario 3: Model Not Found**
```
Current:
- User configures model: "gpt-4-turbo"
- No feedback
- Sends message
- After delay: Generic error
- Must open inspector to see "model not found"

Better:
- Test button immediately validates model ID
- Shows: "Model 'gpt-4-turbo' not recognized"
- Suggests: "Did you mean: gpt-4-turbo-preview, gpt-4-1106-preview?"
- Links to provider's model list
```

### Recommendations
```
Priority: CRITICAL

1. Error Classification:
   - USER_ERROR (config, input) → fixable, show guidance
   - SYSTEM_ERROR (network, crash) → transient, offer retry
   - EXTERNAL_ERROR (API, server) → not our fault, explain status

2. Error Components:
   - Title: What went wrong
   - Details: Technical info (collapsible)
   - Impact: What can't be done now
   - Actions: How to fix or next steps
   - Context: When/where error occurred

3. Feedback Patterns:
   - Optimistic UI (assume success)
   - Loading states (during operations)
   - Success confirmation (brief, auto-dismiss)
   - Error alerts (persistent, actionable)
   - Status indicators (always visible)
```

---

## 6. Accessibility (5/10)

### ARIA & Semantics

**What Exists:**
- ✅ `aria-label` on most interactive elements
- ✅ `role` attributes on modals, tabs, logs
- ✅ `aria-hidden` on hidden panels
- ✅ Semantic HTML (header, main, aside, section)

**What's Missing:**
- ❌ No skip-to-content link
- ❌ Focus management on modal open/close
- ❌ Keyboard shortcuts not discoverable
- ❌ No screen reader announcements for dynamic content
- ❌ Loading/progress states not announced

### Keyboard Navigation

**Current State:**
```
✅ Works:
- Tab through inputs
- Enter to submit
- Escape to close modals
- ⌘K for command palette
- ⌘N for new conversation

⚠️ Partial:
- Inspector tabs navigable but no keyboard shortcuts
- Settings tabs require mouse
- Context menus keyboard-only navigation broken

❌ Missing:
- No keyboard shortcut for MCP tools
- Can't navigate conversation list with arrows
- No keyboard access to inspector actions
- Shortcuts not shown in menus
```

### Recommendations
```
Priority: HIGH

1. Keyboard Shortcuts Panel:
   - Press ? to see all shortcuts
   - Organized by category
   - Searchable
   - Printable reference

2. Focus Management:
   - Modal opens → focus first input
   - Modal closes → return focus
   - Inspector opens → focus active tab
   - Error appears → focus dismiss button

3. Screen Reader Support:
   - Live regions for status changes
   - Progress announcements
   - Error alerts announced
   - Tool call status updates

4. Testing:
   - Navigate entire app keyboard-only
   - Test with VoiceOver/NVDA
   - Color contrast check (WCAG AA)
   - Reduced motion support
```

---

## 7. Performance & Responsiveness (7/10)

### Desktop Performance
- ✅ Fast initial load
- ✅ Smooth animations
- ✅ Responsive typing
- ⚠️ Inspector can lag with many events (>100)
- ⚠️ Large JSON payloads slow to render

### Mobile/Tablet Support
```
Current State: NOT TESTED/SUPPORTED

Issues:
- Fixed widths will break on mobile
- Sidebar overlay might not work
- Touch targets too small (44px minimum needed)
- No mobile-optimized layouts
- Inspector panel unusable on small screens

Recommendation:
- Either fully support mobile or clearly mark desktop-only
- If mobile: responsive layouts, touch gestures, mobile patterns
- If desktop-only: Show message on mobile detection
```

### Startup Time
```
Current:
- Frontend loads: <1s ✅
- Backend starts: 3-5s ⚠️
- MCP connects: 2-10s ❌
- Total ready: 5-15s

Issue: No progress indication during startup
User sees: "Reconnecting..." with no ETA

Recommendation:
- Show startup progress steps
- Estimated time remaining
- Detailed status (Backend starting → MCP connecting → Ready)
- Skip to ready if taking too long
```

---

## 8. Documentation & Help (3/10)

### What Exists
- ✅ `SETUP.md` - Good setup guide
- ✅ `README.md` - Basic overview
- ✅ `Makefile` - Command reference
- ⚠️ `PRODUCTION-READY.md` - Progress tracking

### What's Missing
- ❌ In-app help system
- ❌ Contextual tooltips
- ❌ User guide / manual
- ❌ Video tutorials
- ❌ FAQ / Troubleshooting
- ❌ API documentation
- ❌ MCP integration guide for users
- ❌ Changelog / release notes

### Issues
- Existing docs are developer-focused
- No user-facing documentation
- No search within docs
- No getting started tutorial
- MCP concepts assumed knowledge

### Recommendations
```
Priority: HIGH

1. In-App Help:
   - Help button in header
   - Contextual help icon (?) next to complex features
   - Tooltip on hover for all controls
   - Onboarding checklist

2. User Documentation:
   - Getting Started guide
   - Common Tasks (recipes)
   - Troubleshooting guide
   - Video walkthrough
   - FAQ

3. Developer Documentation:
   - API reference
   - MCP integration guide
   - Architecture docs
   - Contributing guide

4. Discoverability:
   - Help search
   - Context-sensitive help
   - "Learn more" links from UI
   - Release notes on startup
```

---

## 9. Feature Completeness (5/10)

### What Works Well
- ✅ Chat with LLM
- ✅ Multiple conversations
- ✅ Session management (create, rename, delete, duplicate)
- ✅ MCP server connection
- ✅ Tool call execution via LLM
- ✅ Inspector for debugging
- ✅ Configuration management
- ✅ WebSocket real-time updates

### Critical Missing Features

#### 1. File Context Ingestion (0/10)
```
Current: File attachment UI exists but doesn't work
Status: Misleading / Broken

Needed:
- Actually read file content
- Show token usage per file
- Preview before sending
- Syntax highlighting
- Multiple file support
- Workspace context (entire directory)
- .gitignore respect
```

#### 2. Manual Tool Runner (0/10)
```
Current: No UI for manual tool execution
Status: Critical missing feature

Needed:
- Tool browser/search
- Auto-generated input forms from JSON schema
- Request history
- Saved requests (templates)
- Response comparison
- Export results
```

#### 3. Permissions System (0/10)
```
Current: No permission controls
Status: Security risk

Needed:
- Tool permission levels (read/write/execute)
- User confirmation dialogs for destructive ops
- Filesystem path restrictions
- Network access controls
- Audit log of actions
```

#### 4. Tool Server Management (3/10)
```
Current: Can add, can view health, can't edit/delete
Status: Incomplete

Missing:
- Edit server config in UI
- Delete servers
- Enable/disable toggle
- Restart server
- View logs
- Test connection before adding
```

#### 5. Context Management (2/10)
```
Current: No context windowing, no provenance
Status: Major limitation

Needed:
- Token budget tracking
- Context prioritization
- Provenance (which files influenced response)
- Context window visualization
- Clear context / start fresh
```

---

## 10. Competitor Comparison

### VS Code Copilot Chat
```
Hermes Advantages:
+ More flexible (any LLM provider)
+ MCP tool integration
+ Session management
+ Inspector/debugging

Hermes Disadvantages:
- No inline code completion
- No file context integration
- No workspace awareness
- More complex setup

Verdict: Hermes is more powerful for advanced users but less polished
```

### Cursor
```
Hermes Advantages:
+ Open source
+ MCP ecosystem
+ Any LLM provider
+ Better debugging tools

Hermes Disadvantages:
- No code editing integration
- No diff view
- No inline suggestions
- Less refined UX

Verdict: Cursor wins on UX, Hermes wins on flexibility
```

### ChatGPT Desktop App
```
Hermes Advantages:
+ MCP tools (massive advantage)
+ Local/self-hosted
+ Multi-provider
+ Developer-focused features

Hermes Disadvantages:
- Complex setup
- No prompt library
- No sharing features
- Less polished UI
- No mobile app

Verdict: Hermes is for developers, ChatGPT is for everyone
```

---

## 11. Critical User Pain Points

### Top 10 Issues (By Severity)

1. **No Onboarding** (P0 - Blocker)
   - Users have no idea what to do first
   - No guidance on setup
   - Silent failures confusing

2. **File Attachments Broken** (P0 - Blocker)
   - Feature exists but doesn't work
   - Misleading UX
   - No indication it's not working

3. **MCP Setup Too Hard** (P0 - Blocker)
   - Requires technical expertise
   - No templates or examples
   - No troubleshooting help
   - Can't edit/delete after adding

4. **Poor Error Messages** (P1 - Critical)
   - Errors vague or missing
   - No recovery guidance
   - Must dig into inspector

5. **No Manual Tool Execution** (P1 - Critical)
   - Can't test tools independently
   - Must go through LLM every time
   - No way to experiment

6. **Missing Keyboard Shortcuts** (P1 - Critical)
   - Many actions mouse-only
   - Shortcuts not discoverable
   - Power users slowed down

7. **No In-App Help** (P2 - High)
   - No tooltips
   - No contextual help
   - Must leave app for docs

8. **Terminology Inconsistent** (P2 - High)
   - Inspector/Activity confusion
   - Tools means multiple things
   - Adds cognitive load

9. **No Mobile Support** (P2 - High)
   - Desktop-only not stated
   - UI breaks on small screens
   - Growing use case ignored

10. **Settings Split Across Tabs** (P3 - Medium)
    - LLM config in 2 places
    - Confusing flow
    - Extra clicks

---

## 12. Recommendations by Priority

### P0 - Must Fix Before Launch
```
1. Add First-Run Experience
   - Welcome screen
   - Setup wizard
   - Example conversation
   - Guided tour

2. Fix File Attachments
   - Actually read content
   - Show what's included
   - Token usage display
   - Preview before send

3. Simplify MCP Setup
   - Server templates
   - Visual editor
   - Test connection
   - Troubleshooting guide

4. Improve Error Messages
   - Clear, actionable errors
   - Recovery suggestions
   - Contextual help links
   - Less technical jargon

5. Add Basic Help System
   - Tooltip on every control
   - Help button in header
   - Contextual documentation
   - FAQ/Troubleshooting
```

### P1 - High Priority
```
6. Build Manual Tool Runner
   - Tool browser
   - Generated forms
   - Request history
   - Save templates

7. Complete Server Management
   - Edit in UI
   - Delete servers
   - Enable/disable toggle
   - View logs

8. Add Keyboard Shortcuts
   - Full navigation
   - Shortcuts panel (?)
   - Visible hints
   - Custom bindings

9. Implement Permissions
   - User confirmations
   - Path restrictions
   - Audit log
   - Security policies

10. Improve Status Visibility
    - Connection indicators
    - Setup progress
    - Error notifications
    - System health dashboard
```

### P2 - Medium Priority
```
11. Consolidate Settings
    - Single LLM config tab
    - Better organization
    - Visual hierarchy
    - Inline docs

12. Add Context Management
    - Token budgets
    - Provenance tracking
    - Clear context option
    - Context visualization

13. Enhance Accessibility
    - Screen reader support
    - Focus management
    - WCAG AA compliance
    - Keyboard-only testing

14. Mobile Support Decision
    - Full mobile support OR
    - Clear desktop-only messaging
    - Don't leave users confused

15. Better Visual Design
    - Stronger hierarchy
    - Consistent color system
    - Better status indicators
    - More scannable content
```

### P3 - Nice to Have
```
16. Prompt Library
17. Sharing & Export
18. Themes & Customization
19. Plugin System
20. Telemetry Dashboard
```

---

## 13. Testing Recommendations

### User Testing Protocol
```
1. First-Time User Test
   - Give user no instructions
   - Observe what they try first
   - Note confusion points
   - Time to first successful message
   - Target: <5 minutes to "hello world"

2. Common Task Tests
   - Add MCP server
   - Configure LLM
   - Attach file
   - Debug error
   - Run tool manually
   - Measure: success rate, time, frustration

3. A/B Tests
   - Onboarding flow variations
   - Error message clarity
   - Settings organization
   - Help system effectiveness

4. Accessibility Audit
   - Keyboard-only navigation
   - Screen reader testing
   - Color contrast check
   - Motion sensitivity
```

### Metrics to Track
```
Onboarding:
- Time to first message
- Setup completion rate
- Help system usage
- Early churn rate

Engagement:
- Messages per session
- Tool calls per user
- Errors per session
- Time to error recovery

Satisfaction:
- NPS score
- Task success rate
- Feature discovery rate
- Return usage rate
```

---

## 14. Conclusion

### Overall Assessment

Hermes has **strong technical foundations** but is currently **not ready for general users**. The application shows promise as a developer tool but needs significant UX work to be accessible beyond the power user segment.

### User Personas & Fit

**✅ Good Fit For:**
- Developers comfortable with CLI/config files
- Technical users who value flexibility
- Power users who can read docs
- MCP developers testing tools

**❌ Poor Fit For:**
- Non-technical users
- Users expecting ChatGPT-level polish
- Users needing mobile access
- Users wanting quick setup

### Path to 1.0

**If targeting developers only:**
- Focus on P0 + P1 fixes
- Excellent documentation
- Power user features
- Accept some complexity

**If targeting broader audience:**
- Must fix all P0 issues
- Complete onboarding flow
- Extensive user testing
- Simplify everything
- In-app help system
- Mobile support

### Estimated Effort

```
P0 Fixes:     4-6 weeks (1 developer)
P1 Features:  6-8 weeks (1 developer)
P2 Polish:    4-6 weeks (1 developer)

Total: 3-5 months to production-ready

With 2-3 developers: 2-3 months
With UX designer: Higher quality, same timeline
With user testing: Add 2-4 weeks
```

### Final Score Breakdown

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| First Impressions | 3/10 | 15% | 0.45 |
| Information Architecture | 6/10 | 10% | 0.60 |
| Usability | 5/10 | 20% | 1.00 |
| Visual Design | 7/10 | 10% | 0.70 |
| Error Handling | 4/10 | 15% | 0.60 |
| Accessibility | 5/10 | 10% | 0.50 |
| Performance | 7/10 | 5% | 0.35 |
| Documentation | 3/10 | 10% | 0.30 |
| Feature Completeness | 5/10 | 15% | 0.75 |

**Total Weighted Score: 5.25/10**

*(Score would be 7-8/10 for target user: technical developers)*

---

## Appendix: User Quotes (Simulated)

### Negative Feedback
> "I installed it and... now what? Nothing tells me what to do."

> "The file attachment button doesn't do what I expected. Very confusing."

> "I spent 20 minutes trying to add an MCP server. Still not sure if it worked."

> "Errors are super vague. 'Error reported'? That tells me nothing."

> "Why is model config split between 'Models' and 'Providers'? Seems redundant."

### Positive Feedback
> "The inspector is really powerful once you learn it. Love seeing everything."

> "Clean design, doesn't feel cluttered like some AI tools."

> "MCP support is amazing. This is the future."

> "Being able to use any LLM provider is huge for me."

> "The conversation management is solid. Works how I'd expect."

---

**End of Audit**

