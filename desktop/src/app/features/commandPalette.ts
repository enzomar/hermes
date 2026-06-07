/**
 * Command palette — open, close, filter, and list palette commands.
 *
 * Extracted from app.ts. Depends on app-level functions injected via initCommandPalette().
 */

import type { HermesState, PaletteCommand } from "../types";
import { renderCommandPalette } from "../components/overlays";
import { getShortcutLabel } from "../state";

// ─── Dependency injection ────────────────────────────────────────────────────

interface CommandPaletteDeps {
  getState(): HermesState;
  executeAction(action: string, payload?: Record<string, unknown>): Promise<void>;
}

let deps: CommandPaletteDeps;

export function initCommandPalette(d: CommandPaletteDeps): void {
  deps = d;
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function renderPalette(): void {
  const state = deps.getState();
  renderCommandPalette(state, getFilteredPaletteCommands(), getShortcutLabel(state.ui.platform, "palette"));
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function getFilteredPaletteCommands(): PaletteCommand[] {
  const state = deps.getState();
  const query = state.ui.paletteQuery.trim().toLowerCase();
  const commands = getPaletteCommands();
  if (!query) return commands.slice(0, 12);
  return commands.filter((c) => [c.title, c.subtitle, ...c.keywords].join(" ").toLowerCase().includes(query)).slice(0, 12);
}

export function getPaletteCommands(): PaletteCommand[] {
  const state = deps.getState();
  const commands: PaletteCommand[] = [
    { id: "new-session", title: "New Conversation", subtitle: "Start a conversation", keywords: ["create", "new", "session", "conversation", "chat"], shortcut: getShortcutLabel(state.ui.platform, "newSession"), run: () => deps.executeAction("create-session") },
    { id: "refresh-tools", title: "Refresh Connected Tools", subtitle: "Reload connected tools and their availability", keywords: ["refresh", "tools", "mcp", "servers", "connections"], shortcut: getShortcutLabel(state.ui.platform, "refreshTools"), run: () => deps.executeAction("refresh-tools") },
    { id: "focus-prompt", title: "Focus Prompt", subtitle: "Jump to the composer", keywords: ["focus", "prompt", "composer"], shortcut: getShortcutLabel(state.ui.platform, "focusPrompt"), run: () => deps.executeAction("focus-composer") },
    { id: "open-benchmark", title: "Benchmark Prompt", subtitle: "Compare the next prompt across multiple AI targets", keywords: ["benchmark", "compare", "models", "llm"], run: () => deps.executeAction("open-benchmark") },
    { id: "open-settings", title: "Settings", subtitle: "Configure AI, connected tools, and preferences", keywords: ["settings", "config", "llm", "model", "api", "tools"], shortcut: "⌘,", run: () => deps.executeAction("open-settings") },
    { id: "open-tools", title: "Connected Tools", subtitle: "Open tool connections and capability settings", keywords: ["tools", "mcp", "connections"], run: () => deps.executeAction("open-mcp-settings") },
  ];

  for (const sessionId of state.ui.recentSessionIds) {
    const session = state.sessions.find((s) => s.session_id === sessionId);
    if (!session) continue;
    commands.push({
      id: `session-${sessionId}`,
      title: String(session.title ?? "Untitled"),
      subtitle: `Open conversation ${String(sessionId).slice(0, 8)}`,
      keywords: ["session", "conversation", String(session.title ?? ""), sessionId],
      run: () => deps.executeAction("switch-session", { sessionId }),
    });
  }

  return commands;
}

export function openCommandPalette(initialQuery = ""): void {
  const state = deps.getState();
  state.ui.paletteOpen = true;
  state.ui.paletteQuery = initialQuery;
  state.ui.paletteIndex = 0;
  renderPalette();
  requestAnimationFrame(() => document.querySelector<HTMLInputElement>("#command-input")?.focus());
}

export function closeCommandPalette(): void {
  const state = deps.getState();
  if (!state.ui.paletteOpen) return;
  state.ui.paletteOpen = false;
  state.ui.paletteQuery = "";
  state.ui.paletteIndex = 0;
  renderPalette();
}
