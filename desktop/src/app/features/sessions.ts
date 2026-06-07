/**
 * Session management — CRUD, rename, share, switch.
 *
 * Extracted from app.ts. Depends on app-level functions injected via initSessions().
 */

import type { BootstrapPayload, EventRecord, FeedbackTone, HermesState, WorkspaceView } from "../types";
import { deriveTimeline } from "../components/timeline";
import { renderShellSummary } from "../components/workspace";
import { copyText } from "../utils";

// ─── Dependency injection ────────────────────────────────────────────────────

interface SessionDeps {
  getState(): HermesState;
  requestJson<T = unknown>(path: string, init?: RequestInit): Promise<T>;
  refreshBootstrap(sessionId?: string): Promise<void>;
  setFeedback(message: string, tone: FeedbackTone): void;
  applyBootstrap(payload: BootstrapPayload): void;
  runWithFeedback(start: string, success: string, work: () => Promise<void>): Promise<void>;
  executeAction(action: string, payload?: Record<string, unknown>): Promise<void>;
  setActiveWorkspaceView(view: WorkspaceView): void;
  focusComposer(): void;
}

let deps: SessionDeps;

export function initSessions(d: SessionDeps): void {
  deps = d;
}

// ─── Helpers (internal) ──────────────────────────────────────────────────────

function focusConversationTitleInput(): void {
  requestAnimationFrame(() => {
    const input = document.querySelector<HTMLInputElement>("#conversation-title-input");
    if (!input) {
      return;
    }

    input.focus();
    input.select();
  });
}

export function clearInlineSessionRename(): void {
  const state = deps.getState();
  state.ui.renamingSessionId = null;
  state.ui.renamingSessionDraft = "";
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function createSession(title?: string, focus = false): Promise<void> {
  await deps.runWithFeedback("Creating...", "Conversation created.", async () => {
    const res = await deps.requestJson<{ bootstrap: BootstrapPayload }>("/api/sessions", {
      method: "POST",
      body: JSON.stringify({ title }),
    });
    deps.applyBootstrap(res.bootstrap);
  });
  if (focus) deps.focusComposer();
}

export async function persistSessionTitle(sessionId: string, title: string): Promise<void> {
  await deps.requestJson(`/api/sessions/${encodeURIComponent(sessionId)}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });
}

export async function startInlineSessionRename(sessionId: string): Promise<void> {
  const state = deps.getState();

  if (!sessionId) {
    return;
  }

  if (state.activeSessionId !== sessionId) {
    await deps.refreshBootstrap(sessionId);
  }

  const session = state.sessions.find((entry) => entry.session_id === sessionId);
  if (!session) {
    deps.setFeedback("Conversation not found.", "error");
    return;
  }

  deps.setActiveWorkspaceView("chat");
  state.ui.renamingSessionId = sessionId;
  state.ui.renamingSessionDraft = String(session.title ?? "Untitled session");
  renderShellSummary(state);
  focusConversationTitleInput();
}

export function cancelInlineSessionRename(): void {
  clearInlineSessionRename();
  renderShellSummary(deps.getState());
}

export async function saveInlineSessionRename(): Promise<void> {
  const state = deps.getState();
  const sessionId = state.ui.renamingSessionId;
  if (!sessionId) {
    return;
  }

  const trimmed = state.ui.renamingSessionDraft.trim();
  if (!trimmed) {
    deps.setFeedback("Conversation title is required.", "error");
    focusConversationTitleInput();
    return;
  }

  const currentSession = state.sessions.find((entry) => entry.session_id === sessionId);
  if (String(currentSession?.title ?? "").trim() === trimmed) {
    cancelInlineSessionRename();
    return;
  }

  await deps.runWithFeedback("Renaming...", "Conversation renamed.", async () => {
    await persistSessionTitle(sessionId, trimmed);
    clearInlineSessionRename();
    await deps.refreshBootstrap(sessionId);
  });
}

export async function deleteSession(sessionId: string): Promise<void> {
  const state = deps.getState();
  const session = state.sessions.find((entry) => entry.session_id === sessionId);
  const confirmed = window.confirm(`Delete conversation "${String(session?.title ?? "Untitled session")}"? This removes its stored trace.`);
  if (!confirmed) return;

  await deps.runWithFeedback("Deleting...", "Conversation deleted.", async () => {
    await deps.requestJson(`/api/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
    const nextSessionId = state.activeSessionId === sessionId ? undefined : state.activeSessionId ?? undefined;
    await deps.refreshBootstrap(nextSessionId);
  });
}

export async function duplicateSession(sessionId: string): Promise<void> {
  const state = deps.getState();
  const session = state.sessions.find((entry) => entry.session_id === sessionId);
  const title = window.prompt("Duplicate conversation as", `Copy of ${String(session?.title ?? "Conversation")}`);
  if (title === null) return;

  await deps.runWithFeedback("Duplicating...", "Conversation duplicated.", async () => {
    const res = await deps.requestJson<{ bootstrap: BootstrapPayload }>(`/api/sessions/${encodeURIComponent(sessionId)}/duplicate`, {
      method: "POST",
      body: JSON.stringify({ title: title.trim() || undefined }),
    });
    deps.applyBootstrap(res.bootstrap);
  });
}

export async function shareSession(sessionId: string): Promise<void> {
  const state = deps.getState();
  const session = state.sessions.find((entry) => entry.session_id === sessionId);
  const response = await deps.requestJson<{ events: EventRecord[] }>(`/api/sessions/${encodeURIComponent(sessionId)}/events`);
  const transcript = deriveTimeline(response.events)
    .map((entry) => {
      const header = entry.kind === "tool" ? `### Tool: ${entry.title}` : `### ${entry.title}`;
      const meta = entry.meta.length ? `_${entry.meta.join(" • ")}_\n\n` : "";
      return `${header}\n\n${meta}${entry.body || entry.preview || ""}`.trim();
    })
    .join("\n\n");
  const payload = [`# ${String(session?.title ?? "Conversation")}`, transcript].filter(Boolean).join("\n\n");
  await copyText(payload);
  deps.setFeedback("Conversation transcript copied.", "success");
}

export async function switchRelativeSession(direction: 1 | -1): Promise<void> {
  const state = deps.getState();
  if (!state.ui.recentSessionIds.length || !state.activeSessionId) return;
  const available = state.ui.recentSessionIds.filter((id) => state.sessions.some((s) => s.session_id === id));
  const idx = available.indexOf(state.activeSessionId);
  if (idx === -1) return;
  const next = (idx + direction + available.length) % available.length;
  await deps.executeAction("switch-session", { sessionId: available[next] });
}
