import { MAX_RECENT_SESSIONS, STORAGE_KEY } from "./config";
import type { HermesState, PersistedWorkspace, PlatformKind } from "./types";

export type ShortcutAction = "palette" | "newSession" | "refreshTools" | "focusPrompt" | "sendPrompt";

export function createState(persistedWorkspace: PersistedWorkspace): HermesState {
  return {
    activeSessionId: persistedWorkspace.activeSessionId,
    sessions: [],
    llmProfiles: [],
    defaultLlmProfileName: null,
    servers: [],
    tools: [],
    telemetry: {},
    inspector: [],
    events: [],
    selectedInspectorId: persistedWorkspace.selectedInspectorId,
    replayCursor: 0,
    replayFrames: [],
    socket: null,
    ui: {
      platform: detectPlatform(),
      recentSessionIds: persistedWorkspace.recentSessionIds,
      conversationQuery: "",
      composerDraft: persistedWorkspace.composerDraft,
      pendingFiles: [],
      consoleView: persistedWorkspace.consoleView,
      sidebarCollapsed: persistedWorkspace.sidebarCollapsed,
      appMode: persistedWorkspace.appMode,
      workspaceView: "chat",
      inspectorOpen: false,
      inspectorTab: persistedWorkspace.inspectorTab,
      mcpInspectorTab: "connections",
      settingsOpen: false,
      settingsTab: "ai",
      renamingSessionId: null,
      renamingSessionDraft: "",
      settingsEditingServerName: null,
      settingsCollapsedMcpGroups: [],
      settingsToolExpanded: null,
      enabledMcpServers: [],
      benchmarkConfigOpen: false,
      benchmarkReportOpen: false,
      benchmarkLeftProfileName: "",
      benchmarkRightProfileName: "",
      benchmarkSort: "latency",
      benchmarkFeedback: {
        tone: "idle",
        message: "Choose one saved AI profile per side, then send one prompt to compare them.",
      },
      benchmarkReport: null,
      toolRunnerTool: "",
      toolRunnerArgs: "{}",
      toolRunnerFeedback: {
        tone: "idle",
        message: "Choose a connected tool and provide JSON arguments to run it manually.",
      },
      toolRunnerResult: null,
      settingsFeedback: {
        tone: "idle",
        message: "Test your setup before saving if you want a live validation.",
      },
      feedback: {
        tone: "idle",
        message: "Ready. Start with a task, then use settings or benchmark when you need to branch out from the chat.",
      },
      paletteOpen: false,
      paletteQuery: "",
      paletteIndex: 0,
      paletteCommands: [],
      contextMenu: null,
      modelConfigured: false,
    },
  };
}

export function persistWorkspaceState(state: HermesState): void {
  const payload: PersistedWorkspace = {
    activeSessionId: state.activeSessionId,
    selectedInspectorId: state.selectedInspectorId,
    recentSessionIds: state.ui.recentSessionIds,
    composerDraft: state.ui.composerDraft,
    consoleView: state.ui.consoleView,
    sidebarCollapsed: state.ui.sidebarCollapsed,
    appMode: state.ui.appMode,
    inspectorOpen: state.ui.inspectorOpen,
    inspectorTab: state.ui.inspectorTab,
  };

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore persistence failures.
  }
}

export function loadPersistedWorkspace(): PersistedWorkspace {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return getDefaultPersistedWorkspace();
    }

    const parsed = JSON.parse(raw) as Partial<PersistedWorkspace>;
    return {
      activeSessionId: typeof parsed.activeSessionId === "string" ? parsed.activeSessionId : null,
      selectedInspectorId: typeof parsed.selectedInspectorId === "string" ? parsed.selectedInspectorId : null,
      recentSessionIds: Array.isArray(parsed.recentSessionIds) ? parsed.recentSessionIds.map(String) : [],
      composerDraft: typeof parsed.composerDraft === "string" ? parsed.composerDraft : "",
      consoleView:
        parsed.consoleView === "tools" || parsed.consoleView === "errors" || parsed.consoleView === "events"
          ? parsed.consoleView
          : "events",
      sidebarCollapsed: parsed.sidebarCollapsed === true,
      appMode:
        parsed.appMode === "chat" ||
        parsed.appMode === "mcp-inspect" ||
        parsed.appMode === "benchmark" ||
        parsed.appMode === "debug-timeline" ||
        parsed.appMode === "lab"
          ? parsed.appMode
          : "chat",
      inspectorOpen: parsed.inspectorOpen === true,
      inspectorTab:
        parsed.inspectorTab === "trace" ||
        parsed.inspectorTab === "tools" ||
        parsed.inspectorTab === "payload" ||
        parsed.inspectorTab === "servers" ||
        parsed.inspectorTab === "logs"
          ? parsed.inspectorTab
          : "trace",
    };
  } catch {
    return getDefaultPersistedWorkspace();
  }
}

export function rememberRecentSession(state: HermesState, sessionId: string | null): void {
  if (!sessionId) {
    return;
  }

  state.ui.recentSessionIds = [sessionId, ...state.ui.recentSessionIds.filter((value) => value !== sessionId)].slice(
    0,
    MAX_RECENT_SESSIONS,
  );
}

export function detectPlatform(): PlatformKind {
  const platform = navigator.platform.toLowerCase();
  const userAgent = navigator.userAgent.toLowerCase();
  if (platform.includes("mac") || userAgent.includes("mac")) {
    return "macos";
  }
  if (platform.includes("win") || userAgent.includes("windows")) {
    return "windows";
  }
  return "linux";
}

export function getShortcutLabel(platform: PlatformKind, action: ShortcutAction): string {
  const isMac = platform === "macos";
  switch (action) {
    case "palette":
      return isMac ? "⌘K" : "Ctrl+K";
    case "newSession":
      return isMac ? "⌘N" : "Ctrl+N";
    case "refreshTools":
      return isMac ? "⌘⇧R" : "Ctrl+Shift+R";
    case "focusPrompt":
      return isMac ? "⌘L" : "Ctrl+L";
    case "sendPrompt":
      return isMac ? "⌘↩" : "Ctrl+Enter";
  }
}

export function getSessionTitle(state: HermesState, sessionId: string): string {
  const session = state.sessions.find((candidate) => candidate.session_id === sessionId);
  return String(session?.title ?? `Session ${sessionId.slice(0, 8)}`);
}

function getDefaultPersistedWorkspace(): PersistedWorkspace {
  return {
    activeSessionId: null,
    selectedInspectorId: null,
    recentSessionIds: [],
    composerDraft: "",
    consoleView: "events",
    sidebarCollapsed: false,
    appMode: "chat",
    inspectorOpen: false,
    inspectorTab: "trace",
  };
}