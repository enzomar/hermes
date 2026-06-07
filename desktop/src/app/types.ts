export type JsonObject = Record<string, any>;

export type EventRecord = {
  event_id: string;
  event_type: string;
  timestamp: string;
  session_id: string;
  payload: JsonObject;
};

export type InspectorEntry = JsonObject & {
  event_id: string;
  event_type: string;
  timestamp: string;
  session_id: string;
};

export type BootstrapPayload = {
  active_session_id: string | null;
  sessions: JsonObject[];
  servers: JsonObject[];
  tools: JsonObject[];
  telemetry: Record<string, JsonObject>;
  inspector: InspectorEntry[];
  events: EventRecord[];
};

export type MessageState = "idle" | "streaming" | "waiting_tool" | "error" | "completed";

export type ConsoleView = "events" | "tools" | "errors";

export type TimelineDisclosure = {
  label: string;
  value: unknown;
};

export type PendingAttachment = {
  name: string;
  mimeType: string;
  size: number;
  content: string;
  truncated: boolean;
};

export type BenchmarkSortKey = "model" | "latency" | "tokens" | "errors";

export type BenchmarkEntry = {
  session_id: string;
  title: string;
  updated_at?: string;
  status: string;
  target: {
    label?: string;
    model?: string;
    provider?: string;
  };
  kpis: JsonObject;
  response_text: string;
  error_message: string;
};

export type BenchmarkReport = {
  group_id: string;
  source_session_id: string;
  source_title: string;
  prompt_preview: string;
  completed: boolean;
  entries: BenchmarkEntry[];
};

export type TimelineEntry = {
  kind: "user" | "assistant" | "tool" | "system";
  id: string;
  title: string;
  body: string;
  preview: string;
  meta: string[];
  state: MessageState;
  statusLabel?: string;
  timestamp: string;
  disclosures: TimelineDisclosure[];
  error?: boolean;
  inspectEventId?: string;
  replayEventId?: string;
};

export type ConsoleEntry = {
  id: string;
  title: string;
  summary: string;
  timestamp: string;
  status: string;
  meta: string[];
  error?: boolean;
  inspectEventId?: string;
  replayEventId?: string;
};

export type ContactTone = "info" | "success" | "error";

export type FeedbackTone = "idle" | "info" | "success" | "error";

export type PlatformKind = "macos" | "windows" | "linux";

export type InspectorTab = "trace" | "tools" | "payload" | "servers" | "logs";

export type McpInspectorTab = "connections" | "tools" | "activity";

export type SettingsTab = "ai" | "mcp" | "general";

export type BenchmarkSide = "left" | "right";

export type WorkspaceView = "chat" | "settings" | "benchmark" | "mcp-inspector" | "lab";

export type AppMode = "chat" | "mcp-inspect" | "benchmark" | "debug-timeline" | "lab" | "debug-api";

export type PersistedWorkspace = {
  activeSessionId: string | null;
  selectedInspectorId: string | null;
  recentSessionIds: string[];
  composerDraft: string;
  consoleView: ConsoleView;
  sidebarCollapsed: boolean;
  appMode: AppMode;
  inspectorOpen: boolean;
  inspectorTab: InspectorTab;
};

export type LlmProfileConfig = {
  name: string;
  provider: string;
  model?: string;
  api_base?: string;
  api_key_env?: string;
  api_key_present?: boolean;
  cli_command?: string;
  cli_args?: string[];
  temperature?: number;
  top_p?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  max_tokens?: number;
  timeout_seconds?: number;
  system_prompt?: string;
};

export type PaletteCommand = {
  id: string;
  title: string;
  subtitle: string;
  keywords: string[];
  shortcut?: string;
  run: () => Promise<void> | void;
};

export type ContextMenuItem = {
  label: string;
  action: string;
  shortcut?: string;
  sessionId?: string;
  eventId?: string;
  profileId?: string;
  serverName?: string;
  benchmarkSide?: BenchmarkSide;
};

export type ActionPayload = {
  sessionId?: string;
  eventId?: string;
  commandId?: string;
  timelineId?: string;
  profileId?: string;
  benchmarkSide?: BenchmarkSide;
  prompt?: string;
  consoleView?: ConsoleView;
  inspectorTab?: InspectorTab;
  mcpInspectorTab?: McpInspectorTab;
  settingsTab?: SettingsTab;
  toolName?: string;
  serverName?: string;
  mode?: string;
  labPanel?: string;
};

export type HermesState = {
  activeSessionId: string | null;
  sessions: JsonObject[];
  llmProfiles: LlmProfileConfig[];
  defaultLlmProfileName: string | null;
  servers: JsonObject[];
  tools: JsonObject[];
  telemetry: Record<string, JsonObject>;
  inspector: InspectorEntry[];
  events: EventRecord[];
  selectedInspectorId: string | null;
  replayCursor: number;
  replayFrames: EventRecord[];
  socket: WebSocket | null;
  ui: {
    platform: PlatformKind;
    recentSessionIds: string[];
    conversationQuery: string;
    composerDraft: string;
    pendingFiles: PendingAttachment[];
    consoleView: ConsoleView;
    sidebarCollapsed: boolean;
    appMode: AppMode;
    workspaceView: WorkspaceView;
    inspectorOpen: boolean;
    inspectorTab: InspectorTab;
    mcpInspectorTab: McpInspectorTab;
    settingsOpen: boolean;
    settingsTab: SettingsTab;
    renamingSessionId: string | null;
    renamingSessionDraft: string;
    settingsEditingServerName: string | null;
    settingsCollapsedMcpGroups: string[];
    settingsToolExpanded: string | null;
    enabledMcpServers: string[];  // Empty = all enabled
    benchmarkConfigOpen: boolean;
    benchmarkReportOpen: boolean;
    benchmarkLeftProfileName: string;
    benchmarkRightProfileName: string;
    benchmarkSort: BenchmarkSortKey;
    benchmarkFeedback: {
      tone: FeedbackTone;
      message: string;
    };
    benchmarkReport: BenchmarkReport | null;
    toolRunnerTool: string;
    toolRunnerArgs: string;
    toolRunnerFeedback: {
      tone: FeedbackTone;
      message: string;
    };
    toolRunnerResult: unknown | null;
    settingsFeedback: {
      tone: FeedbackTone;
      message: string;
    };
    feedback: {
      tone: FeedbackTone;
      message: string;
    };
    paletteOpen: boolean;
    paletteQuery: string;
    paletteIndex: number;
    paletteCommands: PaletteCommand[];
    contextMenu: { x: number; y: number; items: ContextMenuItem[] } | null;
    modelConfigured: boolean;
  };
};


// ─── LLM Settings Types (shared across app, settings, benchmarks) ────────────

export type LlmProviderMode = "openai" | "anthropic" | "groq" | "mistral" | "together" | "perplexity" | "openrouter" | "google" | "cohere" | "fireworks" | "deepseek" | "local" | "local-cli" | "github-copilot";

export type LlmSettingsForm = {
  provider: LlmProviderMode;
  model: string;
  api_base?: string;
  api_key_env?: string;
  cli_command?: string;
  cli_args: string[];
  temperature: number;
  top_p?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  max_tokens: number;
  timeout_seconds: number;
  system_prompt?: string;
};

export type LlmProfileDraft = LlmSettingsForm & {
  id: string;
  name: string;
  api_key_present?: boolean;
};

export type BenchmarkTargetForm = LlmSettingsForm & {
  label?: string;
};

export type BenchmarkRunResponse = {
  group_id: string;
  source_session_id: string;
  sessions: JsonObject[];
  report: BenchmarkReport;
};

export type PublicConfigPayload = {
  llm?: Record<string, unknown>;
  llm_profiles?: Record<string, Record<string, unknown>>;
  default_llm_profile?: string | null;
};
