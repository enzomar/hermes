import { getShortcutLabel } from "../state";
import type { HermesState } from "../types";
import { escapeHtml, formatTime, setText } from "../utils";

export function applyShortcutHints(state: HermesState): void {
  const hints: Array<[string, string]> = [
    ["#palette-shortcut", getShortcutLabel(state.ui.platform, "palette")],
    ["#new-session-shortcut", getShortcutLabel(state.ui.platform, "newSession")],
    ["#send-shortcut", getShortcutLabel(state.ui.platform, "sendPrompt")],
  ];

  for (const [selector, value] of hints) {
    setText(selector, value);
  }
}

export function renderShellSummary(state: HermesState): void {
  const activeSession = state.sessions.find((s) => s.session_id === state.activeSessionId);
  const shell = document.querySelector<HTMLElement>(".app-shell");
  const workspace = document.querySelector<HTMLElement>(".workspace");
  const modeTabs = document.querySelectorAll<HTMLButtonElement>(".sidebar-nav-item[data-mode]");
  const chatView = document.querySelector<HTMLElement>("#chat-view");
  const benchmarkSplitView = document.querySelector<HTMLElement>("#benchmark-split-view");
  const mcpInspectView = document.querySelector<HTMLElement>("#mcp-inspect-view");
  const debugTimelineView = document.querySelector<HTMLElement>("#debug-timeline-view");
  const labView = document.querySelector<HTMLElement>("#lab-view");
  const workspaceFooterPanel = document.querySelector<HTMLElement>(".workspace-footer-panel");
  const benchmarkFooterControls = document.querySelector<HTMLElement>("#benchmark-footer-controls");
  const conversationTitleTrigger = document.querySelector<HTMLButtonElement>("#conversation-title-trigger");
  const conversationTitleEditor = document.querySelector<HTMLFormElement>("#conversation-title-editor");
  const conversationTitleInput = document.querySelector<HTMLInputElement>("#conversation-title-input");
  const settingsView = document.querySelector<HTMLElement>("#settings-overlay");
  const workspaceStatus = document.querySelector<HTMLElement>("#workspace-status");
  const modelTrigger = document.querySelector<HTMLButtonElement>(".model-trigger");
  const composerInput = document.querySelector<HTMLTextAreaElement>("#composer-input");
  const composerSubmit = document.querySelector<HTMLButtonElement>('#composer-form button[type="submit"]');
  const composerContext = document.querySelector<HTMLElement>("#composer-context");
  const activeModelLabel = getActiveModelLabel(state);
  const activeModelMeta = getActiveModelMeta(state);
  const latestEvent = [...state.events].reverse().find((event) => !state.activeSessionId || event.session_id === state.activeSessionId);
  const activeView = state.ui.workspaceView;
  const appMode = state.ui.appMode;
  const panelOpen = activeView !== "chat";
  const conversationTitle = activeSession ? String(activeSession.title ?? "Untitled session") : "New conversation";
  const renamingCurrentSession = Boolean(activeSession && state.ui.renamingSessionId === activeSession.session_id);

  shell?.classList.toggle("sidebar-collapsed", state.ui.sidebarCollapsed);
  shell?.classList.toggle("panel-open", panelOpen);
  shell?.classList.toggle("settings-open", activeView === "settings");
  shell?.classList.toggle("benchmark-open", activeView === "benchmark");
  shell?.classList.toggle("mcp-open", activeView === "mcp-inspector");
  workspace?.classList.toggle("panel-open", panelOpen);
  workspace?.classList.toggle("settings-open", activeView === "settings");
  workspace?.classList.toggle("benchmark-open", activeView === "benchmark");
  workspace?.classList.toggle("mcp-open", activeView === "mcp-inspector");

  modeTabs.forEach((tab) => {
    const active = tab.dataset.mode === appMode;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", active ? "true" : "false");
  });

  // Update topbar mode label
  const modeLabels: Record<string, string> = {
    chat: "Chat",
    "mcp-inspect": "MCP Inspector",
    benchmark: "Compare",
    "debug-timeline": "Debug Timeline",
    lab: "Lab",
    "debug-api": "Debug API",
  };
  setText("#app-topbar-mode", activeView === "settings" ? "Settings" : (modeLabels[appMode] ?? ""));

  if (chatView) {
    chatView.hidden = !(appMode === "chat" && activeView === "chat");
  }
  if (benchmarkSplitView) {
    benchmarkSplitView.hidden = !(appMode === "benchmark" && activeView === "benchmark");
  }
  if (mcpInspectView) {
    mcpInspectView.hidden = appMode !== "mcp-inspect" || activeView === "settings";
  }
  if (debugTimelineView) {
    debugTimelineView.hidden = appMode !== "debug-timeline" || activeView === "settings";
  }
  if (labView) {
    labView.hidden = appMode !== "lab" || activeView === "settings";
  }
  const debugApiView = document.querySelector<HTMLElement>("#debug-api-view");
  if (debugApiView) {
    debugApiView.hidden = appMode !== "debug-api" || activeView === "settings";
  }
  // Always hide home view when any mode is active
  const homeView = document.querySelector<HTMLElement>("#home-view");
  if (homeView) {
    homeView.hidden = true;
  }
  if (workspaceFooterPanel) {
    workspaceFooterPanel.hidden = activeView === "benchmark";
  }
  if (benchmarkFooterControls) {
    benchmarkFooterControls.hidden = activeView !== "benchmark";
  }
  if (settingsView) {
    settingsView.hidden = activeView !== "settings";
    settingsView.setAttribute("aria-hidden", activeView === "settings" ? "false" : "true");
  }

  setViewActionState("#sidebar-settings-trigger", activeView === "settings");
  setText("#app-footer-events", String(state.events.length));
  setText("#app-footer-tools", String(state.tools.length));

  setText("#conversation-title", conversationTitle);
  if (conversationTitleTrigger) {
    conversationTitleTrigger.hidden = !activeSession || renamingCurrentSession;
    conversationTitleTrigger.disabled = !activeSession;
    const label = activeSession ? `Rename conversation ${conversationTitle}` : "Open or start a conversation first";
    conversationTitleTrigger.title = label;
    conversationTitleTrigger.setAttribute("aria-label", label);
  }
  if (conversationTitleEditor) {
    conversationTitleEditor.hidden = !renamingCurrentSession;
  }
  if (conversationTitleInput) {
    const nextValue = renamingCurrentSession ? state.ui.renamingSessionDraft : conversationTitle;
    if (conversationTitleInput.value !== nextValue) {
      conversationTitleInput.value = nextValue;
    }
  }
  setText("#chat-subtitle", activeSession
    ? [
        activeSession.parent_session_id ? "Alternative path" : "Conversation",
        activeSession.updated_at ? `Updated ${formatTime(String(activeSession.updated_at))}` : "",
      ].filter(Boolean).join(" • ")
    : "Start with a task or choose a guided action."
  );
  setText("#active-model-chip", activeModelLabel);
  if (modelTrigger) {
    const title = activeModelMeta
      ? `Switch default AI profile. Current: ${activeModelMeta}`
      : "Switch default AI profile";
    modelTrigger.title = title;
    modelTrigger.setAttribute("aria-label", title);
  }

  if (workspaceStatus) {
    if (!activeSession) {
      workspaceStatus.textContent = "Setup";
      workspaceStatus.dataset.tone = "idle";
    } else if (latestEvent?.event_type === "error") {
      workspaceStatus.textContent = "Needs attention";
      workspaceStatus.dataset.tone = "error";
    } else if (latestEvent?.event_type === "llm_start") {
      workspaceStatus.textContent = "Thinking";
      workspaceStatus.dataset.tone = "live";
    } else if (latestEvent?.event_type === "tool_call_start") {
      workspaceStatus.textContent = "Using tools";
      workspaceStatus.dataset.tone = "live";
    } else {
      workspaceStatus.textContent = "Ready";
      workspaceStatus.dataset.tone = "live";
    }
  }
  setText("#app-footer-status", workspaceStatus?.textContent ?? "Ready");

  if (composerInput) {
    composerInput.disabled = !activeSession;
    composerInput.placeholder = activeSession ? "Ask Hermes to help with a task..." : "Start or open a conversation to begin.";
  }
  if (composerSubmit) composerSubmit.disabled = !activeSession;

  if (composerContext) {
    const contextChips = [
      `<span class="subtle-chip">${state.tools.length} connected tool${state.tools.length === 1 ? "" : "s"}</span>`,
      state.ui.pendingFiles.length
        ? `<span class="subtle-chip">${state.ui.pendingFiles.length} file${state.ui.pendingFiles.length === 1 ? "" : "s"} ready</span>`
        : `<span class="subtle-chip">No file context</span>`,
    ];
    composerContext.innerHTML = contextChips.join("");
  }

  document.querySelectorAll<HTMLButtonElement>(".composer-tool").forEach((btn) => {
    btn.disabled = !activeSession;
  });
}

function setViewActionState(selector: string, active: boolean): void {
  const button = document.querySelector<HTMLButtonElement>(selector);
  if (!button) {
    return;
  }

  button.classList.toggle("active", active);
  button.setAttribute("aria-pressed", active ? "true" : "false");
}

function humanizeSidebarView(state: HermesState, view: HermesState["ui"]["workspaceView"]): string {
  switch (view) {
    case "settings":
      return state.ui.settingsTab === "mcp" ? "Connectors" : "Settings";
    case "benchmark":
      return "Benchmark";
    case "mcp-inspector":
      return "MCP Inspector";
    default:
      return "Chat";
  }
}

export function renderFeedback(state: HermesState): void {
  const banner = document.querySelector<HTMLElement>("#feedback-banner");
  if (!banner) return;
  banner.textContent = state.ui.feedback.message;
  banner.dataset.tone = state.ui.feedback.tone;

  // Update session token usage
  const tokenEl = document.querySelector<HTMLElement>("#session-token-usage");
  if (!tokenEl) return;
  const sessionId = (state as any).activeSessionId;
  const metric = sessionId ? state.telemetry[sessionId] : null;
  if (!metric || !Number(metric.total_tokens)) {
    tokenEl.textContent = "";
    return;
  }
  const promptTokens = Number(metric.prompt_tokens ?? 0);
  const completionTokens = Number(metric.completion_tokens ?? 0);
  const toolCalls = Number(metric.tool_calls ?? 0);
  tokenEl.textContent = `↑${promptTokens} ↓${completionTokens}${toolCalls ? ` · ${toolCalls} tool${toolCalls > 1 ? "s" : ""}` : ""}`;
}

export function renderComposerAttachments(state: HermesState): void {
  const container = document.querySelector<HTMLElement>("#composer-attachments");
  if (!container) return;

  if (!state.ui.pendingFiles.length) {
    container.hidden = true;
    container.innerHTML = "";
    return;
  }

  container.hidden = false;
  container.innerHTML = `
    <div class="attachment-strip">
      ${state.ui.pendingFiles.map((attachment) => `<span class="attachment-pill">${escapeHtml(attachment.name)}</span>`).join("")}
      <button type="button" class="inline-action" data-action="clear-attachments">Clear</button>
    </div>
  `;
}

function getActiveModelLabel(state: HermesState): string {
  const configuredProfile = getConfiguredProfile(state);
  if (configuredProfile) {
    return configuredProfile.name || configuredProfile.model || configuredProfile.cli_command || "Choose AI";
  }

  const event = [...state.events]
    .reverse()
    .find((e) =>
      (!state.activeSessionId || e.session_id === state.activeSessionId) &&
      ["llm_start", "llm_end"].includes(e.event_type) &&
      Boolean(e.payload.model),
    );
  return event ? String(event.payload.model) : "Choose AI";
}

function getActiveModelMeta(state: HermesState): string {
  const configuredProfile = getConfiguredProfile(state);
  if (configuredProfile) {
    const provider = humanizeProvider(configuredProfile.provider);
    const target = configuredProfile.provider === "local-cli"
      ? configuredProfile.cli_command || "CLI runtime"
      : configuredProfile.model || "Model pending";
    return `${configuredProfile.name} • ${provider} • ${target}`;
  }

  const event = [...state.events]
    .reverse()
    .find((e) =>
      (!state.activeSessionId || e.session_id === state.activeSessionId) &&
      ["llm_start", "llm_end"].includes(e.event_type) &&
      Boolean(e.payload.model),
    );
  return event ? String(event.payload.model) : "";
}

function getConfiguredProfile(state: HermesState): HermesState["llmProfiles"][number] | null {
  if (!state.llmProfiles.length) return null;
  return state.llmProfiles.find((profile) => profile.name === state.defaultLlmProfileName) ?? state.llmProfiles[0] ?? null;
}

function humanizeProvider(value: string): string {
  switch (value) {
    case "github-copilot":
      return "GitHub Models";
    case "local-cli":
      return "Local CLI";
    case "local":
      return "Local API";
    case "anthropic":
      return "Anthropic";
    case "groq":
      return "Groq";
    case "mistral":
      return "Mistral AI";
    case "together":
      return "Together AI";
    case "perplexity":
      return "Perplexity";
    case "openrouter":
      return "OpenRouter";
    case "google":
      return "Google Gemini";
    case "cohere":
      return "Cohere";
    case "fireworks":
      return "Fireworks AI";
    case "deepseek":
      return "DeepSeek";
    case "openai":
      return "OpenAI";
    default:
      return "Hosted API";
  }
}

