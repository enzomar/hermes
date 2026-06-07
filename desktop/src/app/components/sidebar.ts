import type { HermesState } from "../types";
import { escapeHtml, formatTime } from "../utils";

export function renderSessions(state: HermesState): void {
  const list = document.querySelector<HTMLElement>("#session-list");
  const count = document.querySelector<HTMLElement>("#sidebar-session-count");
  const debugList = document.querySelector<HTMLElement>("#debug-session-list");
  if (!list) {
    return;
  }

  const sessions = [...state.sessions].sort((left, right) => {
    const leftTime = new Date(String(left.updated_at ?? left.created_at ?? 0)).getTime();
    const rightTime = new Date(String(right.updated_at ?? right.created_at ?? 0)).getTime();
    return rightTime - leftTime;
  });

  const query = state.ui.conversationQuery.trim().toLowerCase();
  const filtered = query
    ? sessions.filter((session) => {
        const title = String(session.title ?? "Untitled session").toLowerCase();
        const sessionId = String(session.session_id).toLowerCase();
        return title.includes(query) || sessionId.includes(query);
      })
    : sessions;

  if (count) {
    count.textContent = query ? `${filtered.length}/${sessions.length}` : String(sessions.length);
  }

  const groups = buildSessionGroups(filtered);

  list.innerHTML = filtered.length
    ? groups
        .map(
          ([label, entries]) => `
            <section class="conversation-group" aria-label="${escapeHtml(label)}">
              <h3 class="conversation-group-label">${escapeHtml(label)}</h3>
              <div class="conversation-group-list">
                ${entries.map((session) => renderConversationItem(state, session)).join("")}
              </div>
            </section>
          `,
        )
        .join("")
    : query
      ? `<p class="sidebar-empty">No conversations match “${escapeHtml(query)}”.</p>`
      : `<p class="sidebar-empty">No conversations yet. Start a new chat to begin.</p>`;

  if (debugList) {
    debugList.innerHTML = sessions.length
      ? renderDebugSessionList(state, sessions)
      : `<p class="sidebar-empty">No traces yet. Start a conversation to generate one.</p>`;
  }
}

function renderConversationItem(state: HermesState, session: HermesState["sessions"][number]): string {
  return renderSessionItem(state, session);
}

function renderSessionItem(state: HermesState, session: HermesState["sessions"][number]): string {
  const active = session.session_id === state.activeSessionId;
  const updatedAt = String(session.updated_at ?? session.created_at ?? "");
  const timestamp = formatTime(updatedAt) || String(session.session_id).slice(0, 8);
  const title = String(session.title ?? "Untitled session");
  const isBranch = session.parent_session_id;
  const metric = state.telemetry[String(session.session_id)] ?? {};
  const llmCalls = Number(metric.llm_calls ?? 0);
  const toolCalls = Number(metric.tool_calls ?? 0);
  const errorCount = Number(metric.error_count ?? 0);
  const hasTelemetry = llmCalls > 0 || toolCalls > 0;

  return `
    <div class="session-item-row${active ? " active" : ""}" data-context="session" data-session-id="${escapeHtml(String(session.session_id))}">
      <button
        type="button"
        class="session-item${active ? " active" : ""}"
        data-action="switch-session"
        data-session-id="${escapeHtml(String(session.session_id))}"
        title="${escapeHtml(title)}"
      >
        <div class="session-item-main">
          <strong class="session-item-title">${isBranch ? '<span class="branch-indicator">↳</span> ' : ''}${escapeHtml(title)}</strong>
          <span class="session-item-time">${escapeHtml(timestamp)}</span>
        </div>
        ${hasTelemetry ? `
          <div class="session-item-stats">
            ${llmCalls ? `<span class="session-item-stat">${llmCalls} LLM</span>` : ""}
            ${toolCalls ? `<span class="session-item-stat">${toolCalls} tools</span>` : ""}
            ${errorCount ? `<span class="session-item-stat error">${errorCount} err</span>` : ""}
          </div>
        ` : ""}
      </button>
      <button
        type="button"
        class="session-item-delete"
        data-action="delete-session"
        data-session-id="${escapeHtml(String(session.session_id))}"
        title="Delete"
        aria-label="Delete ${escapeHtml(title)}"
      >×</button>
    </div>
  `;
}

function renderConversationRailItem(state: HermesState, session: HermesState["sessions"][number]): string {
  const title = String(session.title ?? "Untitled session");
  const active = session.session_id === state.activeSessionId;
  const glyph = getConversationGlyph(title);
  const meta = session.parent_session_id ? "Branch" : "Conversation";

  return `
    <button
      type="button"
      class="conversation-rail-item${active ? " active" : ""}"
      data-action="switch-session"
      data-session-id="${escapeHtml(String(session.session_id))}"
      title="${escapeHtml(`${title} • ${meta}`)}"
      aria-label="Open ${escapeHtml(title)}"
    >
      <span class="conversation-rail-glyph" aria-hidden="true">${escapeHtml(glyph)}</span>
      ${active ? `<span class="conversation-rail-indicator" aria-hidden="true"></span>` : ""}
    </button>
  `;
}

function buildSessionGroups(sessions: HermesState["sessions"]): Array<[string, HermesState["sessions"]]> {
  const groups = new Map<string, HermesState["sessions"]>();
  for (const session of sessions) {
    const label = getSessionGroupLabel(String(session.updated_at ?? session.created_at ?? ""));
    const current = groups.get(label) ?? [];
    current.push(session);
    groups.set(label, current);
  }
  return Array.from(groups.entries());
}

function renderDebugSessionList(state: HermesState, sessions: HermesState["sessions"]): string {
  return sessions.map((session) => renderSessionItem(state, session)).join("");
}

function getSessionGroupLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Older";
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const candidate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayDelta = Math.round((today.getTime() - candidate.getTime()) / 86400000);

  if (dayDelta <= 0) return "Today";
  if (dayDelta === 1) return "Yesterday";
  if (dayDelta < 7) return "This Week";
  return "Older";
}

function getConversationGlyph(title: string): string {
  const words = title
    .split(/\s+/)
    .map((value) => value.trim())
    .filter(Boolean);

  if (!words.length) {
    return "H";
  }

  if (words.length === 1) {
    return words[0].slice(0, 1).toUpperCase();
  }

  return `${words[0][0] ?? "H"}${words[1][0] ?? ""}`.toUpperCase();
}