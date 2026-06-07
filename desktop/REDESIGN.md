# Hermes Desktop Redesign

## North Star

Hermes is an AI workspace, not an observability dashboard.

The primary experience is conversation. Tooling, logs, payloads, and replay stay available, but they only surface when the user asks for them.

Design references:

- Linear
- Cursor
- Raycast
- Notion Calendar
- Arc Browser
- Apple Pro Apps

Design anti-patterns to avoid:

- telemetry walls
- metric cards
- permanent console docks
- nested bordered containers
- multi-column dashboards competing with chat

## Desktop Layout

Three-area layout:

1. Left sidebar: 240px, collapsible to 92px
2. Center workspace: dominant chat surface, 70–80% of visual focus
3. Right inspector: 420px, hidden by default, slides in on demand

Layout rules:

- The center panel owns the title, context, timeline, and composer.
- The sidebar holds conversations, MCP servers, search, and lightweight settings.
- The inspector is not persistent. It opens only for trace, payload, tool, and log inspection.
- Logs never occupy the main workspace by default.

## Design System

Core tokens:

- Background: `#101214`
- Elevated surface: `#15181b`
- Soft surface: `#1a1d21`
- Border: `rgba(255,255,255,0.08)`
- Primary text: `#f3f5f7`
- Secondary text: `#c7cdd6`
- Muted text: `#8a929d`
- Accent: `#79a8ff`
- Success: `#7fb3a3`
- Danger: `#d59698`

Surface rules:

- Default to near-black neutral surfaces.
- Use borders only when they clarify structure.
- Prefer typography and spacing over boxes.
- Keep shadows soft and broad, never glossy.

Typography:

- Font stack: `Avenir Next`, `IBM Plex Sans`, `Segoe UI Variable`
- Mono stack: `IBM Plex Mono`, `SF Mono`, `Monaco`
- Conversation title: `32–45px`
- Section and message titles: `15–16px`
- Metadata and chrome: `11–12px`

## Spacing Scale

Use a tight but breathable scale:

- `4px`
- `8px`
- `12px`
- `16px`
- `20px`
- `24px`
- `32px`
- `40px`
- `48px`

Usage:

- Message interior padding: `18–20px`
- Section spacing: `20–24px`
- Major panel padding: `32px`
- Header-to-content spacing: `24px`

## Component Hierarchy

### Primary

- Conversation title
- Chat timeline
- Composer

### Secondary

- Current conversation context strip
- Inline tool execution rows
- Sidebar conversation list

### Tertiary

- Inspector tabs
- Logs
- Replay frames
- MCP server inventory

Hierarchy rules:

- Chat messages should feel like the default reading path.
- Tool activity should be skimmable in one line and expandable only when needed.
- Inspector content should always feel optional.

## Interaction Patterns

Conversation:

- Messages appear as calm bubbles with generous spacing.
- User messages align right.
- Assistant messages align left.
- Tool calls render inline as compact activity rows.

Tool inspection:

- Default state: collapsed summary
- Expanded state: request, response, timing, replay, raw JSON
- Inspect action opens the right-side inspector to the relevant trace

Inspector:

- Opens contextually
- Tabs: `Trace`, `Tool Calls`, `Payload`, `Logs`
- Closing the inspector should return visual priority to chat immediately

Composer:

- Fixed to the bottom of the workspace
- Large multiline input
- Minimal toolbar for files, slash commands, MCP entry point, and model context
- Send button is the only strong accent CTA

Sidebar:

- Lightweight conversation rows, no large cards
- MCP servers listed as short status rows
- Search is a single prominent trigger tied to command search

## Dark Mode Specification

Dark mode should feel quiet, not cinematic.

Rules:

- 95% of the interface stays within neutral dark values.
- Accent appears only on active states, send CTA, selected items, and live status.
- Error color is reserved for actual failure states.
- Avoid bright green and orange as always-on status decoration.
- Backgrounds should remain matte, with only subtle atmospheric lighting.

Contrast targets:

- Main text: high readability on dark surfaces
- Secondary text: readable but clearly subordinate
- Borders: almost invisible at rest
- Active surface: noticeable through tint, not glow

## Wireframes

Expanded desktop:

```text
+--------------------------------------------------------------------------------------+
| Sidebar 240                     | Conversation                                       |
| Hermes                          | Conversation title                                |
| Search                          | Context strip                                     |
|                                  --------------------------------------------------- |
| Conversations                   |                                                   |
|  Active chat                    |   User message                                    |
|  Branch chat                    |                                                   |
|  Earlier chat                   |   Assistant message                               |
|                                 |                                                   |
| MCP Servers                     |   MCP: Jira Search     Completed in 340ms         |
|  Connected server               |   [Expand] [Inspect] [Branch]                     |
|  Offline server                 |                                                   |
|                                 |                                                   |
| Settings                        |                                                   |
|  Focus composer                 |                                                   |
|  Toggle inspector               |                                                   |
|                                 |                                                   |
|                                 | Composer toolbar                                  |
|                                 | [Files] [/ Slash] [MCP] [Model] [Send]            |
|                                 |                                                   |
|                                 |                               Inspector 420        |
|                                 |                               Trace | Tools | ...  |
|                                 |                               Selected payload      |
+--------------------------------------------------------------------------------------+
```

Inspector closed:

```text
+------------------------------------------------------------------------+
| Sidebar 240                     | Conversation                        |
| Search                          | Title                               |
| Conversations                   | Context                             |
| MCP Servers                     | Messages                            |
| Settings                        | Inline tool activity                |
|                                 | Composer                            |
+------------------------------------------------------------------------+
```

Collapsed sidebar:

```text
+-------------------------------------------------------------------+
| H | Chat title                                                    |
| ? | Context                                                       |
| C | Messages                                                      |
| M | Inline tool rows                                              |
| S | Composer                                                      |
+-------------------------------------------------------------------+
```

## Tailwind Implementation Guidance

Tailwind theme mapping:

```ts
export default {
  theme: {
    extend: {
      colors: {
        canvas: "#101214",
        panel: "#15181b",
        soft: "#1a1d21",
        border: "rgba(255,255,255,0.08)",
        text: "#f3f5f7",
        muted: "#8a929d",
        accent: "#79a8ff",
        success: "#7fb3a3",
        danger: "#d59698",
      },
      borderRadius: {
        xl: "28px",
        lg: "22px",
        md: "18px",
        sm: "14px",
      },
      boxShadow: {
        soft: "0 14px 30px rgba(0,0,0,0.2)",
        float: "0 24px 60px rgba(0,0,0,0.28)",
      },
      spacing: {
        4.5: "18px",
      },
    },
  },
};
```

Recommended component layers:

```css
@layer components {
  .panel-surface {
    @apply rounded-[28px] border border-white/10 bg-white/[0.03] backdrop-blur-xl;
  }

  .message-bubble {
    @apply rounded-[24px] border border-white/10 bg-white/[0.03] px-5 py-4;
  }

  .message-bubble-user {
    @apply border-accent/20 bg-accent/10;
  }

  .tool-row {
    @apply rounded-[20px] border border-white/10 bg-white/[0.02] px-4 py-4;
  }

  .chip-muted {
    @apply rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] uppercase tracking-[0.08em] text-muted;
  }
}
```

Tailwind composition rules:

- Keep the number of surfaces low.
- Do not create card-inside-card-inside-card layouts.
- Use `divide-y` and whitespace before introducing another border.
- Prefer `max-w-*` constraints on messages instead of extra containers.
- Use `sticky bottom-0` for the composer and `fixed right-0` for the inspector sheet.

## Implementation Notes

The current coded redesign lives in:

- [desktop/src/main.ts](desktop/src/main.ts)
- [desktop/src/styles.css](desktop/src/styles.css)

This implementation removes the telemetry-first presentation and establishes a calmer chat-first foundation while preserving inline tool inspection and replay access.