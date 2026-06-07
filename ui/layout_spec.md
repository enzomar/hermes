# Hermes Layout

Hermes uses a chat-first AI workspace built around a simple loop:

- Ask Hermes to help with a task.
- Watch progress in plain language.
- Review the result and open technical details only when needed.

Left panel:
- Conversation list grouped by recency
- Search and resume recent work
- Quick access to search and settings

Center panel:
- Primary conversation and task flow
- Friendly empty states and guided starting points
- Composer with visible context such as AI mode, files, and connected tools

Right panel:
- Activity view for progress, outcomes, and recent steps
- Connected tools browser and manual tool runner
- Technical details, raw payloads, logs, and replay when the user asks for them

Settings model:
- General
- AI
- Connected Tools
- Advanced
- About

Interaction model:
- Every backend event is pushed to the UI over WebSocket.
- The conversation remains the primary surface.
- Activity stays secondary until the user opens it.
- Replay and branching remain available, but are framed as review and alternative-path tools rather than debugging jargon.
