import { API_BASE, FORMSPREE_CONFIGURED, FORMSPREE_ENDPOINT, MAX_RECENT_SESSIONS, PAYPAL_CONFIGURED, PAYPAL_URL, STORAGE_KEY, WS_URL } from "./config";
import { renderBenchmarkReportOverlay, renderBenchmarkSplitView, renderBenchmarkWorkspace } from "./components/benchmark";
import { buildDebugTimelineExport, renderDebugTimeline } from "./components/debugTimeline";
import { renderConsole, renderInspector, renderManualToolRunner, renderReplay } from "./components/inspector";
import { dismissOnboarding, renderOnboarding, shouldShowOnboarding } from "./components/onboarding";
import { renderCommandPalette, renderContextMenu } from "./components/overlays";
import { renderTools } from "./components/panels";
import { renderSessions } from "./components/sidebar";
import { deriveTimeline, getTimelineEntry, renderTimeline } from "./components/timeline";
import {
  applyShortcutHints,
  renderComposerAttachments,
  renderFeedback,
  renderShellSummary,
} from "./components/workspace";
import { renderAppLayout } from "./layout";
import {
  createState,
  detectPlatform,
  getShortcutLabel,
  getSessionTitle,
  loadPersistedWorkspace,
  persistWorkspaceState,
  rememberRecentSession,
} from "./state";
import type {
  ActionPayload,
  AppMode,
  BenchmarkReport,
  BenchmarkSide,
  BootstrapPayload,
  ConsoleView,
  ContextMenuItem,
  EventRecord,
  FeedbackTone,
  HermesState,
  InspectorTab,
  LlmProfileConfig,
  McpInspectorTab,
  PaletteCommand,
  PendingAttachment,
  SettingsTab,
  WorkspaceView,
} from "./types";
import { clamp, copyText, escapeHtml, formatTime, getErrorMessage, sleep } from "./utils";

const persistedWorkspace = loadPersistedWorkspace();
const state: HermesState = createState(persistedWorkspace);

// Initialize session feature module with app-level dependencies
initSessions({
  getState: () => state,
  requestJson,
  refreshBootstrap,
  setFeedback,
  applyBootstrap,
  runWithFeedback,
  executeAction,
  setActiveWorkspaceView,
  focusComposer,
});

const GITHUB_MODELS_API_BASE = "https://models.github.ai/inference";
const GITHUB_MODELS_PAT_SCOPE = "models:read";
const DEFAULT_LLM_PROFILE_NAME = "Primary AI";
const MAX_CHAT_ATTACHMENTS = 6;
const MAX_ATTACHMENT_BYTES = 64 * 1024;
type LlmProviderMode = "openai" | "anthropic" | "groq" | "mistral" | "together" | "perplexity" | "openrouter" | "google" | "cohere" | "fireworks" | "deepseek" | "local" | "local-cli" | "github-copilot";

type LlmSettingsForm = {
  provider: LlmProviderMode;
  model: string;
  api_base?: string;
  api_key_env?: string;
  custom_llm_provider?: string;  // For litellm routing (e.g., "openai" for GitHub Models)
  disable_tools?: boolean;  // Disable MCP tool calling for this profile
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

type LlmProfileDraft = LlmSettingsForm & {
  id: string;
  name: string;
  api_key_present?: boolean;
};

type BenchmarkTargetForm = LlmSettingsForm & {
  label?: string;
};

type BenchmarkRunResponse = {
  group_id: string;
  source_session_id: string;
  sessions: Record<string, any>[];
  report: BenchmarkReport;
};

type PublicConfigPayload = {
  llm?: Record<string, unknown>;
  llm_profiles?: Record<string, Record<string, unknown>>;
  default_llm_profile?: string | null;
};

const LLM_PROVIDER_COPY: Record<LlmProviderMode, {
  hint: string;
  modelLabel: string;
  modelPlaceholder: string;
  modelNote?: string;
  apiBaseLabel: string;
  apiBasePlaceholder: string;
  apiKeyLabel: string;
  apiKeyPlaceholder: string;
  connectionNote?: string;
  testLabel: string;
  saveLabel: string;
}> = {
  openai: {
    hint: "Use OpenAI models directly. Configure the model, API endpoint, and API key environment variable.",
    modelLabel: "Model Identifier",
    modelPlaceholder: "e.g. gpt-4.1-mini, gpt-4o, o3-mini",
    apiBaseLabel: "API Base (Optional)",
    apiBasePlaceholder: "https://api.openai.com/v1",
    apiKeyLabel: "API Key Env Variable",
    apiKeyPlaceholder: "e.g. OPENAI_API_KEY",
    connectionNote: "Leave API Base empty to use the default OpenAI endpoint.",
    testLabel: "Test OpenAI",
    saveLabel: "Save OpenAI",
  },
  anthropic: {
    hint: "Use Anthropic Claude models. Configure your model identifier and API key.",
    modelLabel: "Model Identifier",
    modelPlaceholder: "e.g. claude-sonnet-4-20250514, claude-3-5-haiku-20241022",
    apiBaseLabel: "API Base (Optional)",
    apiBasePlaceholder: "https://api.anthropic.com/v1",
    apiKeyLabel: "API Key Env Variable",
    apiKeyPlaceholder: "e.g. ANTHROPIC_API_KEY",
    connectionNote: "Leave API Base empty to use the default Anthropic endpoint.",
    testLabel: "Test Anthropic",
    saveLabel: "Save Anthropic",
  },
  groq: {
    hint: "Use Groq's ultra-fast inference for open-source models. Configure your model and API key.",
    modelLabel: "Model Identifier",
    modelPlaceholder: "e.g. llama-3.3-70b-versatile, mixtral-8x7b-32768",
    apiBaseLabel: "API Base (Optional)",
    apiBasePlaceholder: "https://api.groq.com/openai/v1",
    apiKeyLabel: "API Key Env Variable",
    apiKeyPlaceholder: "e.g. GROQ_API_KEY",
    connectionNote: "Leave API Base empty to use the default Groq endpoint.",
    testLabel: "Test Groq",
    saveLabel: "Save Groq",
  },
  mistral: {
    hint: "Use Mistral AI models. Configure your model and API key.",
    modelLabel: "Model Identifier",
    modelPlaceholder: "e.g. mistral-large-latest, codestral-latest",
    apiBaseLabel: "API Base (Optional)",
    apiBasePlaceholder: "https://api.mistral.ai/v1",
    apiKeyLabel: "API Key Env Variable",
    apiKeyPlaceholder: "e.g. MISTRAL_API_KEY",
    connectionNote: "Leave API Base empty to use the default Mistral endpoint.",
    testLabel: "Test Mistral",
    saveLabel: "Save Mistral",
  },
  together: {
    hint: "Use Together AI for open-source models with fast inference. Configure your model and API key.",
    modelLabel: "Model Identifier",
    modelPlaceholder: "e.g. meta-llama/Llama-3.3-70B-Instruct-Turbo",
    apiBaseLabel: "API Base (Optional)",
    apiBasePlaceholder: "https://api.together.xyz/v1",
    apiKeyLabel: "API Key Env Variable",
    apiKeyPlaceholder: "e.g. TOGETHER_API_KEY",
    connectionNote: "Leave API Base empty to use the default Together AI endpoint.",
    testLabel: "Test Together",
    saveLabel: "Save Together",
  },
  perplexity: {
    hint: "Use Perplexity AI models with built-in web search capabilities. Configure your model and API key.",
    modelLabel: "Model Identifier",
    modelPlaceholder: "e.g. sonar-pro, sonar",
    apiBaseLabel: "API Base (Optional)",
    apiBasePlaceholder: "https://api.perplexity.ai",
    apiKeyLabel: "API Key Env Variable",
    apiKeyPlaceholder: "e.g. PERPLEXITY_API_KEY",
    connectionNote: "Leave API Base empty to use the default Perplexity endpoint.",
    testLabel: "Test Perplexity",
    saveLabel: "Save Perplexity",
  },
  openrouter: {
    hint: "Use OpenRouter to access 200+ models through a single API. Configure your model and API key.",
    modelLabel: "Model Identifier",
    modelPlaceholder: "e.g. anthropic/claude-sonnet-4, openai/gpt-4o",
    apiBaseLabel: "API Base (Optional)",
    apiBasePlaceholder: "https://openrouter.ai/api/v1",
    apiKeyLabel: "API Key Env Variable",
    apiKeyPlaceholder: "e.g. OPENROUTER_API_KEY",
    connectionNote: "Leave API Base empty to use the default OpenRouter endpoint.",
    testLabel: "Test OpenRouter",
    saveLabel: "Save OpenRouter",
  },
  google: {
    hint: "Use Google Gemini models. Configure your model and API key.",
    modelLabel: "Model Identifier",
    modelPlaceholder: "e.g. gemini-2.5-pro, gemini-2.5-flash",
    apiBaseLabel: "API Base (Optional)",
    apiBasePlaceholder: "https://generativelanguage.googleapis.com/v1beta/openai",
    apiKeyLabel: "API Key Env Variable",
    apiKeyPlaceholder: "e.g. GOOGLE_API_KEY",
    connectionNote: "Leave API Base empty to use the default Google AI endpoint.",
    testLabel: "Test Google",
    saveLabel: "Save Google",
  },
  cohere: {
    hint: "Use Cohere models for enterprise AI. Configure your model and API key.",
    modelLabel: "Model Identifier",
    modelPlaceholder: "e.g. command-r-plus, command-r",
    apiBaseLabel: "API Base (Optional)",
    apiBasePlaceholder: "https://api.cohere.ai/v1",
    apiKeyLabel: "API Key Env Variable",
    apiKeyPlaceholder: "e.g. COHERE_API_KEY",
    connectionNote: "Leave API Base empty to use the default Cohere endpoint.",
    testLabel: "Test Cohere",
    saveLabel: "Save Cohere",
  },
  fireworks: {
    hint: "Use Fireworks AI for fast inference of open-source models. Configure your model and API key.",
    modelLabel: "Model Identifier",
    modelPlaceholder: "e.g. accounts/fireworks/models/llama-v3p3-70b-instruct",
    apiBaseLabel: "API Base (Optional)",
    apiBasePlaceholder: "https://api.fireworks.ai/inference/v1",
    apiKeyLabel: "API Key Env Variable",
    apiKeyPlaceholder: "e.g. FIREWORKS_API_KEY",
    connectionNote: "Leave API Base empty to use the default Fireworks endpoint.",
    testLabel: "Test Fireworks",
    saveLabel: "Save Fireworks",
  },
  deepseek: {
    hint: "Use DeepSeek models for coding and reasoning. Configure your model and API key.",
    modelLabel: "Model Identifier",
    modelPlaceholder: "e.g. deepseek-chat, deepseek-coder",
    apiBaseLabel: "API Base (Optional)",
    apiBasePlaceholder: "https://api.deepseek.com/v1",
    apiKeyLabel: "API Key Env Variable",
    apiKeyPlaceholder: "e.g. DEEPSEEK_API_KEY",
    connectionNote: "Leave API Base empty to use the default DeepSeek endpoint.",
    testLabel: "Test DeepSeek",
    saveLabel: "Save DeepSeek",
  },
  "github-copilot": {
    hint: `Use GitHub Models with a fine-grained personal access token that has ${GITHUB_MODELS_PAT_SCOPE} scope. Configure the model identifier and PAT environment variable.`,
    modelLabel: "GitHub Model Identifier",
    modelPlaceholder: "e.g. openai/gpt-4.1 or openai/gpt-5-chat",
    modelNote: `Use a model id from the GitHub Models catalog. Your GitHub PAT must include the ${GITHUB_MODELS_PAT_SCOPE} permission.`,
    apiBaseLabel: "GitHub Models Endpoint (Fixed)",
    apiBasePlaceholder: GITHUB_MODELS_API_BASE,
    apiKeyLabel: "GitHub PAT Env Variable (Required)",
    apiKeyPlaceholder: "e.g. GITHUB_TOKEN",
    connectionNote: `Hermes automatically connects to ${GITHUB_MODELS_API_BASE}. Only the model identifier and PAT environment variable are required.`,
    testLabel: "Test GitHub Models",
    saveLabel: "Save GitHub Provider",
  },
  local: {
    hint: "Use a local OpenAI-compatible server such as Ollama, LocalAI, LM Studio, or GPT4All's API server. Configure the model, local endpoint URL, and optional API key.",
    modelLabel: "Local Model Identifier",
    modelPlaceholder: "e.g. ollama/llama3.1 or qwen2.5-coder",
    apiBaseLabel: "API Base (Required)",
    apiBasePlaceholder: "e.g. http://127.0.0.1:11434/v1",
    apiKeyLabel: "API Key Env Variable (Optional)",
    apiKeyPlaceholder: "Optional, e.g. LOCALAI_API_KEY",
    connectionNote: "Point Hermes at the local OpenAI-compatible endpoint that serves the selected model. API key is only needed if your local server requires authentication.",
    testLabel: "Test Local API",
    saveLabel: "Save Local API",
  },
  "local-cli": {
    hint: "Run a local CLI directly without API endpoints. Configure the CLI command, arguments, and optional model flag. Tool calling is disabled in CLI mode.",
    modelLabel: "Model Flag Value (Optional)",
    modelPlaceholder: "e.g. llama3.1",
    modelNote: "CLI mode treats the model value as optional. If set, Hermes prepends --model unless your CLI args already provide one.",
    apiBaseLabel: "API Base (Ignored)",
    apiBasePlaceholder: "",
    apiKeyLabel: "API Key Env Variable (Ignored)",
    apiKeyPlaceholder: "",
    connectionNote: "CLI mode bypasses API endpoints entirely. Configure the command and arguments in the CLI Runtime section below.",
    testLabel: "Test CLI",
    saveLabel: "Save CLI",
  },
};

const LLM_MODEL_SUGGESTIONS: Record<LlmProviderMode, Array<[string, string]>> = {
  openai: [
    ["gpt-4.1-mini", "GPT-4.1 Mini"],
    ["gpt-4.1", "GPT-4.1"],
    ["gpt-4o", "GPT-4o"],
    ["gpt-4o-mini", "GPT-4o Mini"],
    ["o3-mini", "O3 Mini"],
    ["o1", "O1"],
    ["o1-mini", "O1 Mini"],
  ],
  anthropic: [
    ["claude-sonnet-4-20250514", "Claude Sonnet 4"],
    ["claude-3-5-sonnet-20241022", "Claude 3.5 Sonnet"],
    ["claude-3-haiku-20240307", "Claude 3 Haiku"],
    ["claude-3-opus-20240229", "Claude 3 Opus"],
  ],
  groq: [
    ["llama-3.3-70b-versatile", "Llama 3.3 70B"],
    ["llama-3.1-70b-versatile", "Llama 3.1 70B"],
    ["llama-3.1-8b-instant", "Llama 3.1 8B"],
    ["mixtral-8x7b-32768", "Mixtral 8x7B"],
    ["gemma2-9b-it", "Gemma 2 9B"],
  ],
  mistral: [
    ["mistral-large-latest", "Mistral Large"],
    ["mistral-large-2407", "Mistral Large 2407"],
    ["mistral-small-latest", "Mistral Small"],
    ["codestral-latest", "Codestral"],
    ["mixtral-8x7b-instruct", "Mixtral 8x7B Instruct"],
  ],
  together: [
    ["meta-llama/Llama-3.3-70B-Instruct-Turbo", "Llama 3.3 70B Turbo"],
    ["meta-llama/Llama-3.1-70B-Instruct-Turbo", "Llama 3.1 70B Turbo"],
    ["meta-llama/Llama-3.1-8B-Instruct-Turbo", "Llama 3.1 8B Turbo"],
    ["mistralai/Mixtral-8x7B-Instruct-v0.1", "Mixtral 8x7B"],
    ["Qwen/Qwen2.5-72B-Instruct-Turbo", "Qwen 2.5 72B"],
  ],
  perplexity: [
    ["sonar-pro", "Sonar Pro"],
    ["sonar", "Sonar"],
    ["sonar-reasoning-pro", "Sonar Reasoning Pro"],
    ["sonar-reasoning", "Sonar Reasoning"],
  ],
  openrouter: [
    ["anthropic/claude-sonnet-4", "Claude Sonnet 4"],
    ["openai/gpt-4o", "GPT-4o"],
    ["openai/gpt-4.1", "GPT-4.1"],
    ["google/gemini-2.5-pro", "Gemini 2.5 Pro"],
    ["meta-llama/llama-3.3-70b-instruct", "Llama 3.3 70B"],
    ["deepseek/deepseek-chat", "DeepSeek Chat"],
  ],
  google: [
    ["gemini-2.5-pro", "Gemini 2.5 Pro"],
    ["gemini-2.5-flash", "Gemini 2.5 Flash"],
    ["gemini-2.0-flash", "Gemini 2.0 Flash"],
    ["gemini-1.5-pro", "Gemini 1.5 Pro"],
  ],
  cohere: [
    ["command-r-plus", "Command R Plus"],
    ["command-r", "Command R"],
    ["command-r-08-2024", "Command R (Aug 2024)"],
  ],
  fireworks: [
    ["accounts/fireworks/models/llama-v3p3-70b-instruct", "Llama 3.3 70B"],
    ["accounts/fireworks/models/llama-v3p1-8b-instruct", "Llama 3.1 8B"],
    ["accounts/fireworks/models/mixtral-8x7b-instruct", "Mixtral 8x7B"],
  ],
  deepseek: [
    ["deepseek-chat", "DeepSeek Chat"],
    ["deepseek-coder", "DeepSeek Coder"],
    ["deepseek-reasoner", "DeepSeek Reasoner"],
  ],
  "github-copilot": [
    ["gpt-4o", "GPT-4o"],
    ["gpt-4o-mini", "GPT-4o Mini"],
    ["gpt-4.1", "GPT-4.1"],
    ["gpt-4.1-mini", "GPT-4.1 Mini"],
    ["o1", "O1"],
    ["o1-mini", "O1 Mini"],
    ["o3-mini", "O3 Mini"],
    ["claude-3-5-sonnet", "Claude 3.5 Sonnet"],
    ["claude-3-haiku", "Claude 3 Haiku"],
    ["claude-3-opus", "Claude 3 Opus"],
    ["llama-3.1-70b-instruct", "Llama 3.1 70B"],
    ["llama-3.1-8b-instruct", "Llama 3.1 8B"],
    ["llama-3-70b-instruct", "Llama 3 70B"],
    ["llama-3-8b-instruct", "Llama 3 8B"],
    ["mistral-large", "Mistral Large"],
    ["mistral-large-2407", "Mistral Large 2407"],
    ["mistral-small", "Mistral Small"],
    ["mixtral-8x7b-instruct", "Mixtral 8x7B"],
    ["command-r", "Command R"],
    ["command-r-plus", "Command R Plus"],
  ],
  local: [
    ["ollama/llama3.1", "Llama 3.1 (Ollama)"],
    ["ollama/qwen2.5-coder", "Qwen 2.5 Coder (Ollama)"],
    ["ollama/mistral", "Mistral (Ollama)"],
    ["ollama/codellama", "CodeLlama (Ollama)"],
    ["lm_studio/model", "LM Studio model"],
  ],
  "local-cli": [],
};

let llmProfileCounter = 0;
let debugTraceFocusTimeout = 0;
const settingsLlmState: {
  profiles: LlmProfileDraft[];
  selectedProfileId: string;
  defaultProfileId: string;
} = {
  profiles: [],
  selectedProfileId: "",
  defaultProfileId: "",
};
let settingsConfigSnapshot: Record<string, any> = {};

export function startApp(root: HTMLDivElement): void {
  renderAppLayout(root);
  mountWorkspacePanels();

  root.addEventListener("click", (e) => void handleClick(e));
  root.addEventListener("contextmenu", handleContextMenu);
  root.addEventListener("input", handleDynamicInput);
  root.addEventListener("change", handleDynamicChange);
  document.querySelector<HTMLFormElement>("#composer-form")?.addEventListener("submit", (e) => void handleSubmit(e));  document.querySelector<HTMLFormElement>("#benchmark-composer-form")?.addEventListener("submit", (e) => void handleBenchmarkSubmit(e));
  document.querySelector<HTMLFormElement>("#conversation-title-editor")?.addEventListener("submit", (e) => void handleConversationTitleSubmit(e));
  document.querySelector<HTMLFormElement>("#author-contact-form")?.addEventListener("submit", (e) => void handleAuthorContactSubmit(e));
  document.querySelector<HTMLTextAreaElement>("#composer-input")?.addEventListener("input", handleComposerInput);
  document.querySelector<HTMLInputElement>("#composer-file-input")?.addEventListener("change", handleFileInputChange);
  document.querySelector<HTMLInputElement>("#command-input")?.addEventListener("input", handlePaletteInput);
  document.querySelector<HTMLInputElement>("#conversation-search")?.addEventListener("input", handleConversationSearch);
  document.querySelector<HTMLSelectElement>("#settings-provider")?.addEventListener("change", handleLlmProviderChange);
  document.querySelector<HTMLSelectElement>("#settings-new-server-transport")?.addEventListener("change", handleTransportToggle);
  window.addEventListener("keydown", handleGlobalKeydown);
  window.addEventListener("pointerdown", handleGlobalPointerDown, true);
  window.addEventListener("beforeunload", () => persistWorkspaceState(state));

  hydrateShell();
  void boot();
}

// ─── Boot ────────────────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  await waitForBackend();
  try {
    if (state.activeSessionId) {
      await refreshBootstrap(state.activeSessionId);
      setFeedback("Conversation restored.", "success");
    } else {
      await refreshBootstrap();
      setFeedback("Ready.", "idle");
    }
  } catch (error) {
    if (state.activeSessionId) {
      state.activeSessionId = null;
      state.ui.recentSessionIds = state.ui.recentSessionIds.filter((id) => id !== persistedWorkspace.activeSessionId);
      persistWorkspaceState(state);
      await refreshBootstrap();
      setFeedback(`Could not restore conversation. ${getErrorMessage(error)}`, "error");
    } else {
      throw error;
    }
  }
  await refreshConfigState();
  connectSocket();
}

function hydrateShell(): void {
  applyShortcutHints(state);
  const searchInput = document.querySelector<HTMLInputElement>("#conversation-search");
  if (searchInput) searchInput.value = state.ui.conversationQuery;
  const composerInput = document.querySelector<HTMLTextAreaElement>("#composer-input");
  if (composerInput) composerInput.value = state.ui.composerDraft;

  renderComposerAttachments(state);
  renderFeedback(state);
  renderBenchmarkWorkspace(state);
  renderBenchmarkSplitView(state);
  renderBenchmarkReportOverlay(state);
  renderDebugTimeline(state);
  renderSettingsUI();
  renderSessions(state);
  renderCommandPalette(state, getFilteredPaletteCommands(), getShortcutLabel(state.ui.platform, "palette"));
  renderConsole(state);
  renderContextMenu(state);
  renderShellSummary(state);
}

function mountWorkspacePanels(): void {
  const workspaceMain = document.querySelector<HTMLElement>("#workspace-main");
  if (!workspaceMain) {
    return;
  }

  for (const selector of ["#settings-overlay"]) {
    const panel = document.querySelector<HTMLElement>(selector);
    if (!panel || panel.parentElement === workspaceMain) {
      continue;
    }

    workspaceMain.appendChild(panel);
  }
}

function getActiveWorkspaceView(): WorkspaceView {
  return state.ui.workspaceView;
}

function setActiveWorkspaceView(view: WorkspaceView): void {
  state.ui.workspaceView = view;
  state.ui.settingsOpen = view === "settings";
  state.ui.benchmarkConfigOpen = view === "benchmark";
  state.ui.inspectorOpen = false;
}

function getWorkspaceViewForAppMode(mode: AppMode = state.ui.appMode): WorkspaceView {
  switch (mode) {
    case "benchmark":
      return "benchmark";
    case "mcp-inspect":
      return "mcp-inspector";
    case "lab":
      return "lab";
    default:
      return "chat";
  }
}

function setAppMode(mode: AppMode): void {
  if (mode === "benchmark" && !state.activeSessionId) {
    setFeedback("Open a conversation before starting a benchmark.", "error");
    return;
  }

  state.ui.appMode = mode;
  if (mode === "benchmark") {
    ensureBenchmarkProfileSelections();
  }

  setActiveWorkspaceView(getWorkspaceViewForAppMode(mode));
  renderShellSummary(state);
  if (mode === "benchmark") {
    renderBenchmarkSplitView(state);
  }
  if (mode === "mcp-inspect") {
    renderMcpInspectorView();
  }
  if (mode === "lab") {
    renderLabView("experiments");
  }
  persistWorkspaceState(state);
}

function showHomeView(): void {
  // Hide all views
  document.querySelectorAll<HTMLElement>(".workspace-view").forEach(v => v.hidden = true);
  const home = document.querySelector<HTMLElement>("#home-view");
  if (home) home.hidden = false;
  // Deselect all nav items
  document.querySelectorAll<HTMLElement>(".sidebar-nav-item[data-mode]").forEach(item => {
    item.classList.remove("active");
    item.setAttribute("aria-selected", "false");
  });
}

function normalizeSettingsTab(tab?: SettingsTab | string): SettingsTab {
  if (tab === "mcp") return "mcp";
  if (tab === "general") return "general";
  return "ai";
}

function getAiSettingsIdleMessage(): string {
  return "Review this profile, confirm its provider and model, then save the full profile set.";
}

function getSettingsIdleMessage(tab: SettingsTab = state.ui.settingsTab): string {
  return tab === "mcp"
    ? "Choose a connector, then edit its transport, command, or URL details before you test and save it."
    : getAiSettingsIdleMessage();
}

async function waitForBackend(): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      await requestJson("/api/health");
      return;
    } catch {
      await sleep(400);
    }
  }
  throw new Error("Backend did not start in time.");
}

// ─── API ─────────────────────────────────────────────────────────────────────

async function requestJson<T = any>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!response.ok) throw new Error((await response.text()) || `Request failed: ${path}`);
  return (await response.json()) as T;
}

// ─── WebSocket ───────────────────────────────────────────────────────────────

let reconnectAttempts = 0;
const MAX_RECONNECT_DELAY = 30000; // 30 seconds
const BASE_RECONNECT_DELAY = 1000; // 1 second

function getReconnectDelay(): number {
  // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (max)
  const delay = Math.min(BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY);
  reconnectAttempts++;
  return delay;
}

function connectSocket(): void {
  const socket = new WebSocket(WS_URL);
  state.socket = socket;

  socket.onopen = () => {
    reconnectAttempts = 0; // Reset on successful connection
    setFeedback("Connected.", "success");
  };

  socket.onmessage = (msg) => {
    try {
      const envelope = JSON.parse(msg.data) as { type: string; payload: BootstrapPayload | EventRecord };
      if (envelope.type === "bootstrap") {
        applyBootstrap(envelope.payload as BootstrapPayload);
        return;
      }
      if (envelope.type === "event") {
        applyEvent(envelope.payload as EventRecord);
      }
    } catch (error) {
      console.error("Failed to process WebSocket message:", error);
    }
  };

  socket.onerror = (event) => {
    console.error("WebSocket error:", event);
    socket.close();
  };

  socket.onclose = (event) => {
    state.socket = null;
    const delay = getReconnectDelay();
    const delaySeconds = Math.round(delay / 1000);

    if (event.code === 1000) {
      // Normal closure
      setFeedback("Connection closed.", "info");
      return;
    }

    if (reconnectAttempts === 1) {
      setFeedback("Connection lost. Reconnecting...", "error");
    } else if (reconnectAttempts < 5) {
      setFeedback(`Reconnecting... (attempt ${reconnectAttempts})`, "error");
    } else {
      setFeedback(`Connection failed. Retrying in ${delaySeconds}s...`, "error");
    }

    setTimeout(() => {
      if (state.socket === null) {
        connectSocket();
      }
    }, delay);
  };
}

// ─── State mutations ─────────────────────────────────────────────────────────

async function refreshBootstrap(sessionId?: string): Promise<void> {
  const query = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : "";
  applyBootstrap(await requestJson<BootstrapPayload>(`/api/bootstrap${query}`));
}

function normalizeHeaderLlmProfile(name: string, profile: Record<string, unknown> = {}): LlmProfileConfig {
  return {
    name,
    provider: String(profile.provider ?? "openai"),
    model: typeof profile.model === "string" ? profile.model : undefined,
    api_base: typeof profile.api_base === "string" ? profile.api_base : undefined,
    api_key_env: typeof profile.api_key_env === "string" ? profile.api_key_env : undefined,
    api_key_present: Boolean(profile.api_key_present ?? profile.api_key_env),
    cli_command: typeof profile.cli_command === "string" ? profile.cli_command : undefined,
    cli_args: Array.isArray(profile.cli_args) ? profile.cli_args.map(String) : undefined,
    temperature: typeof profile.temperature === "number" ? profile.temperature : undefined,
    top_p: typeof profile.top_p === "number" ? profile.top_p : undefined,
    presence_penalty: typeof profile.presence_penalty === "number" ? profile.presence_penalty : undefined,
    frequency_penalty: typeof profile.frequency_penalty === "number" ? profile.frequency_penalty : undefined,
    max_tokens: typeof profile.max_tokens === "number" ? profile.max_tokens : undefined,
    timeout_seconds: typeof profile.timeout_seconds === "number" ? profile.timeout_seconds : undefined,
    system_prompt: typeof profile.system_prompt === "string" ? profile.system_prompt : undefined,
  };
}

function applyConfigState(config: PublicConfigPayload): void {
  const configuredProfiles = Object.entries(config.llm_profiles ?? {}).map(([name, profile]) =>
    normalizeHeaderLlmProfile(name, profile),
  );
  const fallbackName = String(config.default_llm_profile ?? DEFAULT_LLM_PROFILE_NAME).trim() || DEFAULT_LLM_PROFILE_NAME;

  state.llmProfiles = configuredProfiles.length
    ? configuredProfiles
    : config.llm
      ? [normalizeHeaderLlmProfile(fallbackName, config.llm)]
      : [];
  state.defaultLlmProfileName =
    state.llmProfiles.find((profile) => profile.name === fallbackName)?.name
    ?? state.llmProfiles[0]?.name
    ?? null;
  ensureBenchmarkProfileSelections();
}

async function refreshConfigState(): Promise<void> {
  applyConfigState(await requestJson<PublicConfigPayload>("/api/config"));
  renderShellSummary(state);
}

function getConfiguredLlmProfile(profileName: string | null | undefined = state.defaultLlmProfileName): LlmProfileConfig | null {
  if (!state.llmProfiles.length) return null;
  if (profileName) {
    const exactMatch = state.llmProfiles.find((profile) => profile.name === profileName);
    if (exactMatch) return exactMatch;
  }
  return state.llmProfiles[0] ?? null;
}

function getConfiguredLlmProfileMeta(profile: LlmProfileConfig): string {
  const provider = normalizeLlmProvider(profile.provider, profile as Record<string, unknown>);
  const target = provider === "local-cli"
    ? profile.cli_command?.trim() || "CLI runtime"
    : profile.model?.trim() || "Model pending";
  return `${getLlmProviderLabel(provider)} • ${target}`;
}

function serializeStoredLlmProfile(profile: LlmProfileConfig): LlmSettingsForm {
  const provider = normalizeLlmProvider(profile.provider, profile as Record<string, unknown>);
  return {
    provider,
    model: String(profile.model ?? "").trim(),
    api_base: provider === "github-copilot"
      ? GITHUB_MODELS_API_BASE
      : provider === "local-cli"
        ? undefined
        : String(profile.api_base ?? "").trim() || undefined,
    api_key_env: provider === "local-cli"
      ? undefined
      : String(profile.api_key_env ?? "").trim() || undefined,
    cli_command: provider === "local-cli" ? String(profile.cli_command ?? "").trim() || undefined : undefined,
    cli_args: provider === "local-cli" ? (profile.cli_args ?? []).map((value) => String(value).trim()).filter(Boolean) : [],
    temperature: Number.isFinite(Number(profile.temperature)) ? Number(profile.temperature) : 0.2,
    top_p: Number.isFinite(Number(profile.top_p)) ? Number(profile.top_p) : undefined,
    presence_penalty: Number.isFinite(Number(profile.presence_penalty)) ? Number(profile.presence_penalty) : undefined,
    frequency_penalty: Number.isFinite(Number(profile.frequency_penalty)) ? Number(profile.frequency_penalty) : undefined,
    max_tokens: Number.isFinite(Number(profile.max_tokens)) ? Number(profile.max_tokens) : 2048,
    timeout_seconds: Number.isFinite(Number(profile.timeout_seconds)) ? Number(profile.timeout_seconds) : 90,
    system_prompt: String(profile.system_prompt ?? "").trim() || undefined,
  };
}

async function openLlmProfileMenu(anchor: HTMLElement): Promise<void> {
  if (!state.llmProfiles.length) {
    try {
      await refreshConfigState();
    } catch (error) {
      setFeedback(`Could not load AI profiles. ${getErrorMessage(error)}`, "error");
      return;
    }
  }

  const currentProfile = getConfiguredLlmProfile();
  const rect = anchor.getBoundingClientRect();
  openContextMenu(rect.left, rect.bottom + 8, [
    ...state.llmProfiles.map((profile) => ({
      label: profile.name === state.defaultLlmProfileName ? `${profile.name} (Default)` : profile.name,
      action: "switch-default-llm-profile",
      profileId: profile.name,
      shortcut: getLlmProviderLabel(normalizeLlmProvider(profile.provider, profile as Record<string, unknown>)),
    })),
    {
      label: currentProfile ? "Manage AI Profiles" : "Open AI Settings",
      action: "open-ai-settings",
      shortcut: "Settings",
    },
  ]);
}

async function openMcpServerMenu(anchor: HTMLElement): Promise<void> {
  const rect = anchor.getBoundingClientRect();
  const servers = state.servers ?? [];
  const enabledServers = new Set<string>(state.ui.enabledMcpServers ?? []);
  const allEnabled = !enabledServers.size; // Empty means all enabled

  const items: ContextMenuItem[] = [
    {
      label: allEnabled ? "✓ All Servers" : "All Servers",
      action: "toggle-mcp-server-filter",
      serverName: "__all__",
      shortcut: `${servers.filter((s: any) => s.connected).length} connected`,
    },
    ...servers.map((server: any) => {
      const name = String(server.name ?? "");
      const active = allEnabled || enabledServers.has(name);
      return {
        label: `${active ? "✓ " : ""}${name}`,
        action: "toggle-mcp-server-filter",
        serverName: name,
        shortcut: server.connected ? `${server.tool_count ?? 0} tools` : "offline",
      };
    }),
    {
      label: "Manage Connections",
      action: "open-mcp-settings",
      shortcut: "Settings",
    },
  ];

  openContextMenu(rect.left, rect.bottom + 8, items);
}

function toggleMcpServerFilter(serverName: string | undefined): void {
  if (!serverName) return;

  if (serverName === "__all__") {
    // Toggle to "all enabled"
    state.ui.enabledMcpServers = [];
  } else {
    const current = new Set(state.ui.enabledMcpServers);
    if (!current.size) {
      // Was "all" — switch to only this server
      const allNames = (state.servers ?? []).map((s: any) => String(s.name ?? ""));
      // Enable all except this one (toggling it off)
      state.ui.enabledMcpServers = allNames.filter((n) => n !== serverName);
    } else if (current.has(serverName)) {
      current.delete(serverName);
      state.ui.enabledMcpServers = [...current];
    } else {
      current.add(serverName);
      state.ui.enabledMcpServers = [...current];
    }
    // If all are now selected, reset to empty (= all)
    const allNames = (state.servers ?? []).map((s: any) => String(s.name ?? ""));
    if (allNames.every((n) => state.ui.enabledMcpServers.includes(n))) {
      state.ui.enabledMcpServers = [];
    }
  }

  updateMcpChip();
  persistWorkspaceState(state);
}

function updateMcpChip(): void {
  const chip = document.querySelector<HTMLElement>("#active-mcp-chip");
  if (!chip) return;
  const enabled = state.ui.enabledMcpServers;
  const connectedCount = (state.servers ?? []).filter((s: any) => s.connected).length;
  if (!enabled.length) {
    chip.textContent = connectedCount ? `${connectedCount} Tools` : "Tools";
  } else {
    chip.textContent = `${enabled.length} of ${(state.servers ?? []).length}`;
  }
}

async function openBenchmarkProfileMenu(anchor: HTMLElement, side: BenchmarkSide): Promise<void> {
  if (!state.llmProfiles.length) {
    try {
      await refreshConfigState();
    } catch (error) {
      setFeedback(`Could not load AI profiles. ${getErrorMessage(error)}`, "error");
      return;
    }
  }

  ensureBenchmarkProfileSelections();
  const currentProfile = getSelectedBenchmarkProfile(side);
  const rect = anchor.getBoundingClientRect();
  openContextMenu(rect.left, rect.bottom + 8, [
    ...state.llmProfiles.map((profile) => ({
      label: profile.name === currentProfile?.name ? `${profile.name} (Selected)` : profile.name,
      action: "select-benchmark-profile",
      profileId: profile.name,
      benchmarkSide: side,
      shortcut: getLlmProviderLabel(normalizeLlmProvider(profile.provider, profile as Record<string, unknown>)),
    })),
    {
      label: "Manage AI Profiles",
      action: "open-ai-settings",
      shortcut: "Settings",
    },
  ]);
}

function ensureBenchmarkProfileSelections(): void {
  if (!state.llmProfiles.length) {
    state.ui.benchmarkLeftProfileName = "";
    state.ui.benchmarkRightProfileName = "";
    return;
  }

  const hasProfile = (name: string | null | undefined) => Boolean(name && state.llmProfiles.some((profile) => profile.name === name));
  const defaultName = getConfiguredLlmProfile()?.name ?? state.llmProfiles[0]?.name ?? "";
  if (!hasProfile(state.ui.benchmarkLeftProfileName)) {
    state.ui.benchmarkLeftProfileName = defaultName;
  }
  if (!hasProfile(state.ui.benchmarkRightProfileName)) {
    state.ui.benchmarkRightProfileName = state.llmProfiles.find((profile) => profile.name !== state.ui.benchmarkLeftProfileName)?.name ?? defaultName;
  }
}

function getSelectedBenchmarkProfile(side: BenchmarkSide): LlmProfileConfig | null {
  ensureBenchmarkProfileSelections();
  const profileName = side === "left" ? state.ui.benchmarkLeftProfileName : state.ui.benchmarkRightProfileName;
  return getConfiguredLlmProfile(profileName);
}

function selectBenchmarkProfile(side: BenchmarkSide, profileName: string): void {
  const profile = getConfiguredLlmProfile(profileName);
  if (!profile || profile.name !== profileName) {
    setBenchmarkFeedback(`AI profile "${profileName}" is no longer available.`, "error");
    return;
  }

  const currentName = side === "left" ? state.ui.benchmarkLeftProfileName : state.ui.benchmarkRightProfileName;
  if (currentName === profile.name) {
    return;
  }

  if (side === "left") {
    state.ui.benchmarkLeftProfileName = profile.name;
  } else {
    state.ui.benchmarkRightProfileName = profile.name;
  }

  state.ui.benchmarkReport = null;
  state.ui.benchmarkReportOpen = false;
  renderBenchmarkSplitView(state);
  const leftProfile = getSelectedBenchmarkProfile("left");
  const rightProfile = getSelectedBenchmarkProfile("right");
  if (leftProfile && rightProfile) {
    setBenchmarkFeedback(`Benchmark ready: ${leftProfile.name} vs ${rightProfile.name}.`, "idle");
  }
}

function buildBenchmarkTargetsFromProfiles(): BenchmarkTargetForm[] {
  ensureBenchmarkProfileSelections();
  const leftProfile = getSelectedBenchmarkProfile("left");
  const rightProfile = getSelectedBenchmarkProfile("right");
  const selectedProfiles = [leftProfile, rightProfile].filter((profile): profile is LlmProfileConfig => Boolean(profile));
  return selectedProfiles.map((profile) => ({
    label: profile.name,
    ...serializeStoredLlmProfile(profile),
  }));
}

async function switchDefaultHeaderLlmProfile(profileName: string): Promise<void> {
  const profile = getConfiguredLlmProfile(profileName);
  if (!profile || profile.name !== profileName) {
    setFeedback(`AI profile \"${profileName}\" is no longer available.`, "error");
    return;
  }

  if (state.defaultLlmProfileName === profile.name) {
    setFeedback(`${profile.name} is already the default AI profile.`, "info");
    return;
  }

  setFeedback(`Switching default AI profile to ${profile.name}...`, "info");
  try {
    const config = await requestJson<PublicConfigPayload>("/api/config", {
      method: "PUT",
      body: JSON.stringify({
        llm: serializeStoredLlmProfile(profile),
        default_llm_profile: profile.name,
      }),
    });
    applyConfigState(config);
    renderShellSummary(state);
    setFeedback(`Default AI profile set to ${profile.name}.`, "success");
  } catch (error) {
    setFeedback(getErrorMessage(error), "error");
  }
}

function applyBootstrap(payload: BootstrapPayload): void {
  state.activeSessionId = payload.active_session_id;
  state.sessions = payload.sessions;
  state.servers = payload.servers;
  state.tools = payload.tools;
  state.telemetry = payload.telemetry;
  state.inspector = payload.inspector;
  state.events = payload.events;

  const inspectorStillExists = payload.inspector.some((e) => e.event_id === state.selectedInspectorId);
  state.selectedInspectorId = inspectorStillExists ? state.selectedInspectorId : payload.inspector.at(-1)?.event_id ?? null;
  if (state.ui.renamingSessionId && state.ui.renamingSessionId !== state.activeSessionId) {
    clearInlineSessionRename();
  }
  state.replayCursor = 0;
  state.replayFrames = [];

  // Detect if model is configured by checking if any event has a model
  state.ui.modelConfigured = state.events.some(
    (e) => ["llm_start", "llm_end"].includes(e.event_type) && e.payload.model
  );

  rememberRecentSession(state, state.activeSessionId);
  render();
  void refreshBenchmarkReport();
}

function applyEvent(event: EventRecord): void {
  applyTelemetry(event);
  if (
    state.ui.benchmarkReport &&
    (event.session_id === state.ui.benchmarkReport.source_session_id ||
      state.ui.benchmarkReport.entries.some((entry) => entry.session_id === event.session_id))
  ) {
    void refreshBenchmarkReport(state.ui.benchmarkReport.source_session_id, state.ui.benchmarkReport.group_id);
  }

  if (state.activeSessionId && event.session_id !== state.activeSessionId) {
    renderShellSummary(state);
    persistWorkspaceState(state);
    return;
  }

  state.events.push(event);
  if (["mcp_request", "mcp_response", "tool_call_end", "error"].includes(event.event_type)) {
    state.inspector.push({
      event_id: event.event_id,
      event_type: event.event_type,
      timestamp: event.timestamp,
      session_id: event.session_id,
      ...event.payload,
    });
    state.selectedInspectorId = event.event_id;
  }

  if (event.event_type === "error") {
    setFeedback(String(event.payload.message ?? "Error reported."), "error");
  }

  render();
}

function applyTelemetry(event: EventRecord): void {
  const metric = state.telemetry[event.session_id] ??
    (state.telemetry[event.session_id] = {
      llm_calls: 0, tool_calls: 0, prompt_tokens: 0, completion_tokens: 0,
      total_tokens: 0, llm_latency_ms: 0, tool_latency_ms: 0, error_count: 0,
      avg_llm_latency_ms: 0, avg_tool_latency_ms: 0,
    });

  if (event.event_type === "llm_end") {
    const usage = event.payload.usage ?? {};
    metric.llm_calls += 1;
    metric.prompt_tokens += Number(usage.prompt_tokens ?? 0);
    metric.completion_tokens += Number(usage.completion_tokens ?? 0);
    metric.total_tokens += Number(usage.total_tokens ?? 0);
    metric.llm_latency_ms += Number(event.payload.latency_ms ?? 0);
    metric.avg_llm_latency_ms = metric.llm_calls ? metric.llm_latency_ms / metric.llm_calls : 0;
  }

  if (event.event_type === "tool_call_end") {
    metric.tool_calls += 1;
    metric.tool_latency_ms += Number(event.payload.latency_ms ?? 0);
    if (event.payload.is_error) metric.error_count += 1;
    metric.avg_tool_latency_ms = metric.tool_calls ? metric.tool_latency_ms / metric.tool_calls : 0;
  }

  if (event.event_type === "error") metric.error_count += 1;
}

// ─── Render ──────────────────────────────────────────────────────────────────

function render(): void {
  renderShellSummary(state);
  renderSessions(state);
  renderTools(state);
  syncToolRunnerState();
  renderMcpInspectorView();
  renderSettingsMcpList(settingsConfigSnapshot);
  renderSettingsMcpFormState(settingsConfigSnapshot);
  renderBenchmarkWorkspace(state);
  renderBenchmarkSplitView(state);
  renderTimeline(state);
  renderDebugTimeline(state);
  renderTraceTree(state);
  // Update the collapsible chat trace panel if open
  const tracePanel = document.querySelector<HTMLElement>("#chat-trace-panel");
  if (tracePanel && !tracePanel.hidden) renderChatTracePanel();
  renderInspector(state);
  renderReplay(state);
  renderConsole(state);
  renderComposerAttachments(state);
  renderFeedback(state);
  renderBenchmarkReportOverlay(state);
  renderCommandPalette(state, getFilteredPaletteCommands(), getShortcutLabel(state.ui.platform, "palette"));
  renderContextMenu(state);
  renderOnboardingOverlay();
  persistWorkspaceState(state);
}

function renderOnboardingOverlay(): void {
  const overlay = document.getElementById("onboarding-overlay");
  const content = document.getElementById("onboarding-content");
  if (!overlay || !content) return;

  if (shouldShowOnboarding(state)) {
    content.innerHTML = renderOnboarding(state);
    overlay.hidden = false;
    overlay.setAttribute("aria-hidden", "false");
  } else {
    overlay.hidden = true;
    overlay.setAttribute("aria-hidden", "true");
  }
}

// ─── Event handlers ──────────────────────────────────────────────────────────

function buildChatRequestPayload(sessionId: string, message: string, attachments: any[]): Record<string, unknown> {
  return {
    session_id: sessionId,
    message,
    attachments,
  };
}

async function handleSubmit(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  const input = document.querySelector<HTMLTextAreaElement>("#composer-input");
  if (!input || !state.activeSessionId) {
    setFeedback("Open a conversation first.", "error");
    return;
  }
  const message = input.value.trim();
  const attachments = state.ui.pendingFiles.map((attachment) => ({
    name: attachment.name,
    mime_type: attachment.mimeType,
    size_bytes: attachment.size,
    content: attachment.content,
    truncated: attachment.truncated,
  }));
  if (!message && !attachments.length) {
    return;
  }

  setFeedback("Sending...", "info");
  try {
    await requestJson("/api/chat", {
      method: "POST",
      body: JSON.stringify(buildChatRequestPayload(state.activeSessionId, message, attachments)),
    });
    input.value = "";
    state.ui.composerDraft = "";
    state.ui.pendingFiles = [];
    const fileInput = document.querySelector<HTMLInputElement>("#composer-file-input");
    if (fileInput) fileInput.value = "";
    renderComposerAttachments(state);
    renderShellSummary(state);
    persistWorkspaceState(state);
    setFeedback("Sent.", "success");
  } catch (error) {
    setFeedback(getErrorMessage(error), "error");
  }
}

async function handleBenchmarkSubmit(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  await runBenchmark();
}

async function handleConversationTitleSubmit(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  await saveInlineSessionRename();
}

async function handleAuthorContactSubmit(event: SubmitEvent): Promise<void> {
  event.preventDefault();

  if (!FORMSPREE_CONFIGURED) {
    setContactFeedback("Contact form is not configured yet. Set VITE_HERMES_FORMSPREE_ENDPOINT first.", "error");
    return;
  }

  const form = event.currentTarget as HTMLFormElement;
  const formData = new FormData(form);
  setContactFeedback("Sending your message...", "info");

  try {
    const response = await fetch(FORMSPREE_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
      body: formData,
    });

    if (!response.ok) {
      let message = `Request failed with ${response.status}.`;
      try {
        const payload = await response.json() as { errors?: Array<{ message?: string }> };
        if (payload.errors?.length) {
          message = payload.errors.map((entry) => String(entry.message ?? "Unknown error")).join(" ");
        }
      } catch {
        // Keep the fallback message.
      }
      throw new Error(message);
    }

    form.reset();
    setContactFeedback("Message sent. Thanks for reaching out.", "success");
  } catch (error) {
    setContactFeedback(`Could not send the message. ${getErrorMessage(error)}`, "error");
  }
}

async function handleClick(event: Event): Promise<void> {
  const target = (event.target as HTMLElement).closest<HTMLElement>("[data-action]");
  if (!target) return;
  if ((target.dataset.action ?? "") === "open-llm-profile-menu") {
    await openLlmProfileMenu(target);
    return;
  }
  if ((target.dataset.action ?? "") === "open-mcp-server-menu") {
    await openMcpServerMenu(target);
    return;
  }
  if ((target.dataset.action ?? "") === "open-benchmark-model-menu") {
    const side = target.dataset.benchmarkSide === "right" ? "right" : "left";
    await openBenchmarkProfileMenu(target, side);
    return;
  }
  await executeAction(target.dataset.action ?? "", {
    sessionId: target.dataset.sessionId,
    eventId: target.dataset.eventId,
    commandId: target.dataset.commandId,
    timelineId: target.dataset.timelineId,
    profileId: target.dataset.profileId,
    benchmarkSide: target.dataset.benchmarkSide === "right" ? "right" : target.dataset.benchmarkSide === "left" ? "left" : undefined,
    serverName: target.dataset.serverName ?? target.dataset.server,
    toolName: target.dataset.toolName ?? target.dataset.tool,
    prompt: target.dataset.prompt,
    mode: target.dataset.mode,
    labPanel: target.dataset.labPanel,
    consoleView: target.dataset.consoleView as ConsoleView | undefined,
    inspectorTab: target.dataset.inspectorTab as InspectorTab | undefined,
    mcpInspectorTab: target.dataset.mcpInspectorTab as McpInspectorTab | undefined,
    settingsTab: target.dataset.settingsTab as SettingsTab | undefined,
  });
}

function handleComposerInput(event: Event): void {
  const input = event.currentTarget as HTMLTextAreaElement;
  state.ui.composerDraft = input.value;
  persistWorkspaceState(state);
}

function handlePaletteInput(event: Event): void {
  const input = event.currentTarget as HTMLInputElement;
  state.ui.paletteQuery = input.value;
  state.ui.paletteIndex = 0;
  renderCommandPalette(state, getFilteredPaletteCommands(), getShortcutLabel(state.ui.platform, "palette"));
}

function handleDynamicInput(event: Event): void {
  const target = event.target;
  if (target instanceof HTMLInputElement && target.id === "conversation-title-input") {
    state.ui.renamingSessionDraft = target.value;
    return;
  }

  if (isSettingsToolArgumentElement(target)) {
    syncSettingsToolArgumentField(target);
    return;
  }

  if (isLlmSettingsElement(target)) {
    syncSelectedLlmProfileDraft(
      target.id === "settings-llm-profile-name" || target.id === "settings-model" || target.id === "settings-provider",
    );
    renderSettingsOverview();
    return;
  }

  if (target instanceof HTMLInputElement && target.classList.contains("mcp-form-input") ||
      target instanceof HTMLTextAreaElement && target.classList.contains("mcp-form-input")) {
    syncFormFieldsToJson();
    return;
  }

  if (!(target instanceof HTMLTextAreaElement)) {
    return;
  }

  if (target.id === "tool-runner-args") {
    state.ui.toolRunnerArgs = target.value;
    return;
  }

  if (target.id === "mcp-runner-args") {
    mcpRunner.args = target.value;
    return;
  }

  if (target instanceof HTMLInputElement && target.id === "mcp-sidebar-search") {
    renderMcpToolSidebar();
    return;
  }

  // Sync range slider outputs
  if (target instanceof HTMLInputElement && target.type === "range") {
    const output = document.querySelector<HTMLOutputElement>(`#${target.id}-output`);
    if (output) output.textContent = target.value;
  }
}

function handleDynamicChange(event: Event): void {
  const target = event.target;

  if (isSettingsToolArgumentElement(target)) {
    syncSettingsToolArgumentField(target);
    return;
  }

  if (isLlmSettingsElement(target)) {
    syncSelectedLlmProfileDraft(
      target.id === "settings-llm-profile-name" || target.id === "settings-model" || target.id === "settings-provider",
    );
    renderSettingsOverview();
    return;
  }

  if (target instanceof HTMLSelectElement) {
    if (target.id === "tool-runner-tool") {
      selectToolRunnerTool(target.value);
      renderMcpInspectorView();
      renderInspector(state);
      renderTools(state);
      return;
    }

    if (target.id === "benchmark-sort") {
      state.ui.benchmarkSort = target.value as HermesState["ui"]["benchmarkSort"];
      renderBenchmarkWorkspace(state);
      renderBenchmarkReportOverlay(state);
    }

    if (target.id === "debug-api-url") {
      const selected = target.value;
      const spaceIdx = selected.indexOf(" ");
      if (spaceIdx > 0) {
        const method = selected.slice(0, spaceIdx);
        const methodEl = document.querySelector<HTMLSelectElement>("#debug-api-method");
        if (methodEl) methodEl.value = method;
        // Show/hide body editor based on method
        const bodyEl = document.querySelector<HTMLTextAreaElement>("#debug-api-body");
        const bodySection = bodyEl?.closest(".debug-api-body-section") as HTMLElement | null;
        if (bodySection) bodySection.style.display = (method === "GET" || method === "DELETE") ? "none" : "";
      }
    }
  }
}

function handleConversationSearch(event: Event): void {
  const input = event.currentTarget as HTMLInputElement;
  state.ui.conversationQuery = input.value;
  renderSessions(state);
}

async function handleFileInputChange(event: Event): Promise<void> {
  const input = event.currentTarget as HTMLInputElement;
  const files = Array.from(input.files ?? []).slice(0, MAX_CHAT_ATTACHMENTS);

  if (!files.length) {
    state.ui.pendingFiles = [];
    renderComposerAttachments(state);
    renderShellSummary(state);
    return;
  }

  try {
    state.ui.pendingFiles = await Promise.all(files.map(readPendingAttachment));
    if ((input.files?.length ?? 0) > MAX_CHAT_ATTACHMENTS) {
      setFeedback(`Only the first ${MAX_CHAT_ATTACHMENTS} attachments were added.`, "info");
    } else {
      setFeedback(`${state.ui.pendingFiles.length} file${state.ui.pendingFiles.length === 1 ? "" : "s"} ready.`, "success");
    }
  } catch (error) {
    state.ui.pendingFiles = [];
    setFeedback(`Could not read attachments. ${getErrorMessage(error)}`, "error");
  }

  renderComposerAttachments(state);
  renderShellSummary(state);
  persistWorkspaceState(state);
}

function handleTransportToggle(): void {
  const transport = document.querySelector<HTMLSelectElement>("#settings-new-server-transport")?.value;
  const stdioField = document.querySelector<HTMLElement>("#settings-new-server-stdio");
  const sseField = document.querySelector<HTMLElement>("#settings-new-server-sse");
  const streamableField = document.querySelector<HTMLElement>("#settings-new-server-streamable-http");
  const hint = document.querySelector<HTMLElement>("#settings-mcp-transport-hint");

  if (stdioField) stdioField.hidden = transport !== "stdio";
  if (sseField) sseField.hidden = transport !== "sse";
  if (streamableField) streamableField.hidden = transport !== "streamable-http";

  if (hint) {
    switch (transport) {
      case "stdio":
        hint.textContent = "Launches a local process. Hermes communicates via stdin/stdout.";
        break;
      case "streamable-http":
        hint.textContent = "Connects to a remote HTTP endpoint. Recommended for production servers.";
        break;
      case "sse":
        hint.textContent = "Legacy transport. Use Streamable HTTP for new servers.";
        break;
    }
  }
}

// Attachment handling delegated to features/attachments.ts
import { readPendingAttachment } from "./features/attachments";

function handleLlmProviderChange(): void {
  syncSelectedLlmProfileDraft(true);
  renderLlmProviderSettings();
  renderSettingsOverview();
}

function handleGlobalKeydown(event: KeyboardEvent): void {
  const mod = event.metaKey || event.ctrlKey;
  const key = event.key.toLowerCase();

  if (event.key === "Escape" && event.target instanceof HTMLInputElement && event.target.id === "conversation-title-input") {
    event.preventDefault();
    cancelInlineSessionRename();
    return;
  }

  if (state.ui.paletteOpen) {
    if (event.key === "Escape") { event.preventDefault(); closeCommandPalette(); return; }
    if (event.key === "ArrowDown") { event.preventDefault(); state.ui.paletteIndex = clamp(state.ui.paletteIndex + 1, 0, Math.max(state.ui.paletteCommands.length - 1, 0)); renderCommandPalette(state, getFilteredPaletteCommands(), getShortcutLabel(state.ui.platform, "palette")); return; }
    if (event.key === "ArrowUp") { event.preventDefault(); state.ui.paletteIndex = clamp(state.ui.paletteIndex - 1, 0, Math.max(state.ui.paletteCommands.length - 1, 0)); renderCommandPalette(state, getFilteredPaletteCommands(), getShortcutLabel(state.ui.platform, "palette")); return; }
    if (event.key === "Enter") { event.preventDefault(); const cmd = state.ui.paletteCommands[state.ui.paletteIndex]; if (cmd) void executeAction("palette-command", { commandId: cmd.id }); return; }
  }

  if (state.ui.contextMenu && event.key === "Escape") { closeContextMenu(); return; }

  const onboardingOverlay = document.querySelector<HTMLElement>("#onboarding-overlay");
  if (onboardingOverlay && !onboardingOverlay.hidden && event.key === "Escape") { void executeAction("skip-onboarding"); return; }

  const supportOverlay = document.querySelector<HTMLElement>("#support-overlay");
  if (supportOverlay && !supportOverlay.hidden && event.key === "Escape") { void executeAction("close-support"); return; }

  const contactOverlay = document.querySelector<HTMLElement>("#contact-overlay");
  if (contactOverlay && !contactOverlay.hidden && event.key === "Escape") { void executeAction("close-contact"); return; }

  const benchmarkReportOverlay = document.querySelector<HTMLElement>("#benchmark-report-overlay");
  if (benchmarkReportOverlay && !benchmarkReportOverlay.hidden && event.key === "Escape") { void executeAction("close-benchmark-report"); return; }

  if (getActiveWorkspaceView() === "benchmark" && event.key === "Escape") { void executeAction("close-benchmark"); return; }

  const settingsOverlay = document.querySelector<HTMLElement>("#settings-overlay");
  if (settingsOverlay && !settingsOverlay.hidden && event.key === "Escape") { void executeAction("close-settings"); return; }

  if (state.ui.appMode === "mcp-inspect" && event.key === "Escape") { void executeAction("close-mcp-inspector"); return; }

  if (mod && key === "k") { event.preventDefault(); openCommandPalette(); return; }
  if (mod && event.shiftKey && key === "p") { event.preventDefault(); openCommandPalette(); return; }
  if (mod && key === "n") { event.preventDefault(); void executeAction("create-session"); return; }
  if (mod && event.shiftKey && key === "r") { event.preventDefault(); void executeAction("refresh-tools"); return; }
  if (mod && key === "l") { event.preventDefault(); focusComposer(); return; }
  if (mod && key === ",") { event.preventDefault(); void executeAction("open-settings"); return; }
  if (mod && event.key === "Enter") {
    const active = document.activeElement as HTMLElement | null;
    if (active?.closest("#composer-form")) { event.preventDefault(); document.querySelector<HTMLFormElement>("#composer-form")?.requestSubmit(); return; }
  }
  if (event.altKey && event.key === "ArrowRight") { event.preventDefault(); void switchRelativeSession(1); return; }
  if (event.altKey && event.key === "ArrowLeft") { event.preventDefault(); void switchRelativeSession(-1); }
}

function handleGlobalPointerDown(event: PointerEvent): void {
  const target = event.target;
  if (!(target instanceof Node)) return;

  const contextMenu = document.querySelector<HTMLElement>("#context-menu");
  if (state.ui.contextMenu && contextMenu && !contextMenu.contains(target)) closeContextMenu();

  const palettePanel = document.querySelector<HTMLElement>("#command-palette-panel");
  const trigger = target instanceof Element ? target.closest('[data-action="open-command-palette"]') : null;
  if (state.ui.paletteOpen && palettePanel && !palettePanel.contains(target) && !trigger) closeCommandPalette();

  const supportOverlay = document.querySelector<HTMLElement>("#support-overlay");
  const supportPanel = document.querySelector<HTMLElement>("#support-overlay .utility-modal");
  if (supportOverlay && !supportOverlay.hidden && supportPanel && !supportPanel.contains(target)) closeSupport();

  const contactOverlay = document.querySelector<HTMLElement>("#contact-overlay");
  const contactPanel = document.querySelector<HTMLElement>("#contact-overlay .utility-modal");
  if (contactOverlay && !contactOverlay.hidden && contactPanel && !contactPanel.contains(target)) closeContact();

  const benchmarkReportOverlay = document.querySelector<HTMLElement>("#benchmark-report-overlay");
  const benchmarkReportPanel = document.querySelector<HTMLElement>("#benchmark-report-overlay .benchmark-panel");
  if (benchmarkReportOverlay && !benchmarkReportOverlay.hidden && benchmarkReportPanel && !benchmarkReportPanel.contains(target)) closeBenchmarkReport();

  const onboardingOverlay = document.querySelector<HTMLElement>("#onboarding-overlay");
  const onboardingPanel = document.querySelector<HTMLElement>("#onboarding-overlay .onboarding-panel");
  if (onboardingOverlay && !onboardingOverlay.hidden && onboardingPanel && !onboardingPanel.contains(target)) {
    void executeAction("skip-onboarding");
  }
}

function handleContextMenu(event: MouseEvent): void {
  const target = event.target as HTMLElement;

  const sessionCard = target.closest<HTMLElement>('[data-context="session"]');
  if (sessionCard?.dataset.sessionId) {
    event.preventDefault();
    openContextMenu(event.clientX, event.clientY, [
      { label: "Open", action: "switch-session", sessionId: sessionCard.dataset.sessionId },
      { label: "Rename", action: "rename-session", sessionId: sessionCard.dataset.sessionId },
      { label: "Duplicate", action: "duplicate-session", sessionId: sessionCard.dataset.sessionId },
      { label: "Share", action: "share-session", sessionId: sessionCard.dataset.sessionId },
      { label: "Delete", action: "delete-session", sessionId: sessionCard.dataset.sessionId },
      { label: "Copy ID", action: "copy-session-id", sessionId: sessionCard.dataset.sessionId },
    ]);
    return;
  }

  const inspectorCard = target.closest<HTMLElement>('[data-context="inspector"]');
  if (inspectorCard?.dataset.eventId) {
    event.preventDefault();
    openContextMenu(event.clientX, event.clientY, [
      { label: "Details", action: "select-inspector", eventId: inspectorCard.dataset.eventId },
      { label: "Try Again", action: "replay-tool", eventId: inspectorCard.dataset.eventId },
      { label: "Alternative", action: "branch-session", eventId: inspectorCard.dataset.eventId },
      { label: "Copy ID", action: "copy-event-id", eventId: inspectorCard.dataset.eventId },
    ]);
    return;
  }

  const traceCard = target.closest<HTMLElement>('[data-context="trace"]');
  if (traceCard?.dataset.eventId) {
    event.preventDefault();
    openContextMenu(event.clientX, event.clientY, [
      { label: "Try Again", action: "replay-tool", eventId: traceCard.dataset.eventId },
      { label: "Alternative", action: "branch-session", eventId: traceCard.dataset.eventId },
    ]);
  }
}

// ─── Actions ─────────────────────────────────────────────────────────────────

async function executeAction(action: string, payload: ActionPayload = {}): Promise<void> {
  if (!action) return;
  if (action !== "open-command-palette") closeContextMenu();

  switch (action) {
    case "open-command-palette": openCommandPalette(); return;
    case "focus-session-search":
    case "focus-conversation-search":
      focusConversationSearch();
      return;
    case "toggle-settings-tool-group":
      if (payload.serverName) {
        toggleSettingsToolGroup(payload.serverName);
      }
      return;
    case "toggle-settings-tool":
      if (payload.toolName) {
        toggleSettingsTool(payload.toolName);
      }
      return;
    case "open-mcp-palette": openMcpSettings(); return;
    case "open-benchmark": openBenchmark(); return;
    case "close-benchmark": closeBenchmark(); return;
    case "open-benchmark-report": openBenchmarkReport(); return;

    case "close-onboarding":
    case "skip-onboarding":
      dismissOnboarding();
      renderOnboardingOverlay();
      return;

    case "toggle-sidebar":
      showHomeView();
      return;

    case "set-app-mode":
      if (payload.mode) {
        setAppMode(payload.mode as AppMode);
      }
      return;

    case "open-support":
      openSupport();
      return;

    case "close-support":
      closeSupport();
      return;

    case "open-contact":
      openContact();
      return;

    case "close-contact":
      closeContact();
      return;

    case "open-help":
      window.open("https://github.com/nicolo-ama/hermes#readme", "_blank");
      return;

    case "open-paypal-support":
      openPaypalSupport();
      return;

    case "begin-inline-rename":
    case "rename-session":
      if (payload.sessionId ?? state.activeSessionId) {
        await startInlineSessionRename(payload.sessionId ?? state.activeSessionId ?? "");
      }
      return;

    case "cancel-inline-rename":
      cancelInlineSessionRename();
      return;

    case "palette-command": {
      const cmd = state.ui.paletteCommands.find((c) => c.id === payload.commandId);
      if (!cmd) return;
      closeCommandPalette();
      await cmd.run();
      return;
    }

    case "focus-composer": focusComposer(); return;
    case "scroll-timeline-bottom": {
      const tl = document.querySelector<HTMLElement>("#timeline");
      if (tl) { tl.scrollTop = tl.scrollHeight; }
      const pill = document.querySelector<HTMLElement>("#timeline-scroll-pill");
      if (pill) pill.hidden = true;
      return;
    }
    case "attach-files": document.querySelector<HTMLInputElement>("#composer-file-input")?.click(); return;
    case "clear-attachments":
      state.ui.pendingFiles = [];
      const fi = document.querySelector<HTMLInputElement>("#composer-file-input");
      if (fi) fi.value = "";
      renderComposerAttachments(state);
      renderShellSummary(state);
      return;

    case "copy-timeline-entry": {
      const item = payload.timelineId ? getTimelineEntry(state, payload.timelineId) : undefined;
      if (!item) return;
      await copyText(item.body || item.preview || item.title);
      setFeedback("Copied.", "success");
      return;
    }

    case "jump-debug-step":
      if (payload.timelineId) {
        focusDebugTraceStep(payload.timelineId);
      }
      return;

    case "export-debug-timeline":
      await copyText(buildDebugTimelineExport(state));
      setFeedback("Debug trace copied.", "success");
      return;

    case "retry-timeline-entry": {
      const item = payload.timelineId ? getTimelineEntry(state, payload.timelineId) : undefined;
      if (!item) return;
      if (item.kind === "tool" && item.replayEventId) { await executeAction("replay-tool", { eventId: item.replayEventId }); return; }
      if (item.kind === "user" && state.activeSessionId) {
        const originalEvent = state.events.find((event) => event.event_id === item.id && event.event_type === "user_message");
        const originalMessage = String(originalEvent?.payload.content ?? item.body);
        const originalAttachments = Array.isArray(originalEvent?.payload.attachments) ? originalEvent?.payload.attachments : [];
        await runWithFeedback("Retrying...", "Retried.", async () => {
          await requestJson("/api/chat", {
            method: "POST",
            body: JSON.stringify(buildChatRequestPayload(state.activeSessionId!, originalMessage, originalAttachments)),
          });
        });
      }
      return;
    }

    case "run-tool":
      await runSelectedTool();
      return;

    case "select-tool-runner":
      if (payload.toolName) {
        state.ui.mcpInspectorTab = "tools";
        selectToolRunnerTool(payload.toolName);
        renderMcpInspectorView();
        renderInspector(state);
        renderTools(state);
      }
      return;

    case "run-settings-tool":
      if (payload.toolName) {
        state.ui.settingsToolExpanded = payload.toolName;
        selectToolRunnerTool(payload.toolName, { forceSeed: false });
      }
      await runSelectedTool();
      return;

    case "run-benchmark":
      await runBenchmark();
      return;

    case "copy-session-id":
      if (payload.sessionId) { await copyText(payload.sessionId); setFeedback("Conversation ID copied.", "success"); }
      return;

    case "copy-event-id":
      if (payload.eventId) { await copyText(payload.eventId); setFeedback("Event ID copied.", "success"); }
      return;

    case "delete-session":
      if (payload.sessionId) {
        await deleteSession(payload.sessionId);
      }
      return;

    case "duplicate-session":
      if (payload.sessionId) {
        await duplicateSession(payload.sessionId);
      }
      return;

    case "share-session":
      if (payload.sessionId) {
        await shareSession(payload.sessionId);
      }
      return;

    case "use-suggested-prompt":
      if (payload.prompt) {
        await applySuggestedPrompt(payload.prompt);
      }
      return;

    case "create-session": {
      closeCommandPalette();
      await createSession(undefined, true);
      return;
    }

    case "switch-session":
      if (payload.sessionId) {
        closeCommandPalette();
        await runWithFeedback("Switching...", "Switched.", async () => {
          await refreshBootstrap(payload.sessionId);
        });
      }
      return;

    case "refresh-tools":
      closeCommandPalette();
      await runWithFeedback("Refreshing connected tools...", "Connected tools refreshed.", async () => {
        await requestJson("/api/mcp/refresh", { method: "POST" });
        await refreshBootstrap(state.activeSessionId ?? undefined);
      });
      return;

    case "select-inspector":
      if (payload.eventId) {
        state.selectedInspectorId = payload.eventId;
        persistWorkspaceState(state);
      }
      return;

    case "replay-tool":
      if (payload.eventId) {
        closeCommandPalette();
        await runWithFeedback("Running again...", "Run completed.", async () => {
          await requestJson("/api/replay/tool", {
            method: "POST",
            body: JSON.stringify({ event_id: payload.eventId, session_id: state.activeSessionId }),
          });
        });
      }
      return;

    case "branch-session":
      if (payload.eventId && state.activeSessionId) {
        closeCommandPalette();
        const title = window.prompt("Alternative conversation title", "Alternative path");
        if (title === null) return;
        await runWithFeedback("Creating alternative...", "Alternative created.", async () => {
          const res = await requestJson<{ bootstrap: BootstrapPayload }>("/api/replay/branch", {
            method: "POST",
            body: JSON.stringify({ source_session_id: state.activeSessionId, event_id: payload.eventId, title: title.trim() || undefined }),
          });
          applyBootstrap(res.bootstrap);
        });
      }
      return;

    case "replay-step":
      if (state.activeSessionId) {
        const sid = state.activeSessionId;
        closeCommandPalette();
        await runWithFeedback("Stepping...", "Stepped.", async () => {
          const res = await requestJson<{ events: EventRecord[]; cursor: number }>(
            `/api/replay/step?session_id=${encodeURIComponent(sid)}&cursor=${state.replayCursor}&step=1`,
          );
          state.replayFrames.push(...res.events);
          state.replayCursor = res.cursor;
          renderReplay(state);
        });
      }
      return;

    case "replay-reset":
      state.replayCursor = 0;
      state.replayFrames = [];
      renderReplay(state);
      return;

    case "set-settings-tab":
      if (payload.settingsTab) {
        state.ui.settingsTab = normalizeSettingsTab(payload.settingsTab);
        setSettingsFeedback(getSettingsIdleMessage(state.ui.settingsTab), "idle");
        renderSettingsUI();
        requestAnimationFrame(() => focusInitialSettingsField());
      }
      return;
    case "set-mcp-inspector-tab":
      if (payload.mcpInspectorTab) {
        state.ui.mcpInspectorTab = payload.mcpInspectorTab;
        renderMcpInspectorView();
      }
      return;

    case "open-ai-settings":
      openSettings("ai");
      return;
    case "open-settings": openSettings(payload.settingsTab); return;
    case "close-settings": closeSettings(); return;
    case "save-general-settings": await saveGeneralSettings(); return;
    case "open-mcp-inspector": openMcpInspector(); return;
    case "close-mcp-inspector": closeMcpInspector(); return;
    case "refresh-mcp-inspector": await refreshMcpInspector(); return;
    case "lab-nav":
      if (state.ui.appMode !== "lab") setAppMode("lab");
      renderLabView(payload.labPanel ?? "experiments");
      return;
    case "mcp-runner-select-server":
      if (payload.serverName) selectMcpRunnerServer(String(payload.serverName));
      return;
    case "mcp-runner-select-tool":
      if (payload.toolName) selectMcpRunnerTool(String(payload.toolName));
      return;
    case "mcp-runner-run": await runMcpTool(); return;
    case "mcp-runner-mode-form": {
      document.querySelector("#mcp-runner-mode-form-btn")?.classList.add("active");
      document.querySelector("#mcp-runner-mode-json-btn")?.classList.remove("active");
      const ff = document.querySelector<HTMLElement>("#mcp-runner-form-fields");
      const jt = document.querySelector<HTMLTextAreaElement>("#mcp-runner-args");
      if (ff) ff.hidden = false;
      if (jt) jt.hidden = true;
      return;
    }
    case "mcp-runner-mode-json": {
      document.querySelector("#mcp-runner-mode-json-btn")?.classList.add("active");
      document.querySelector("#mcp-runner-mode-form-btn")?.classList.remove("active");
      const ff2 = document.querySelector<HTMLElement>("#mcp-runner-form-fields");
      const jt2 = document.querySelector<HTMLTextAreaElement>("#mcp-runner-args");
      if (ff2) ff2.hidden = true;
      if (jt2) jt2.hidden = false;
      return;
    }
    case "mcp-runner-reset-args":
      mcpRunner.args = "{}";
      { const a = document.querySelector<HTMLTextAreaElement>("#mcp-runner-args"); if (a) a.value = "{}"; }
      return;
    case "mcp-runner-copy-result":
      { const r = document.querySelector<HTMLElement>("#mcp-runner-result"); if (r) void copyText(r.textContent ?? ""); }
      return;
    case "mcp-runner-clear-result":
      { const w = document.querySelector<HTMLElement>("#mcp-runner-result-wrap"); if (w) w.hidden = true; }
      { const ph = document.querySelector<HTMLElement>("#mcp-runner-result-empty"); if (ph) ph.hidden = false; }
      setMcpRunnerFeedback("", "idle");
      return;
    case "open-mcp-settings": openMcpSettings(); return;
    case "toggle-mcp-server-filter": toggleMcpServerFilter(params.serverName); return;
    case "close-mcp-settings": closeMcpSettings(); return;
    case "debug-api-send": await debugApiSend(); return;
    case "debug-api-mode-form":
      document.querySelector("#debug-api-mode-form-btn")?.classList.add("active");
      document.querySelector("#debug-api-mode-json-btn")?.classList.remove("active");
      { const ff = document.querySelector<HTMLElement>("#debug-api-form-fields"); if (ff) ff.hidden = false; }
      { const jt = document.querySelector<HTMLTextAreaElement>("#debug-api-body"); if (jt) jt.hidden = true; }
      return;
    case "debug-api-mode-json":
      document.querySelector("#debug-api-mode-json-btn")?.classList.add("active");
      document.querySelector("#debug-api-mode-form-btn")?.classList.remove("active");
      { const ff = document.querySelector<HTMLElement>("#debug-api-form-fields"); if (ff) ff.hidden = true; }
      { const jt = document.querySelector<HTMLTextAreaElement>("#debug-api-body"); if (jt) jt.hidden = false; }
      return;
    case "debug-api-copy":
      { const r = document.querySelector<HTMLElement>("#debug-api-response"); if (r) void copyText(r.textContent ?? ""); }
      return;
    case "debug-api-clear":
      { const r = document.querySelector<HTMLElement>("#debug-api-response"); if (r) r.textContent = "Send a request to see the response here."; }
      { const l = document.querySelector<HTMLElement>("#debug-api-latency"); if (l) l.textContent = ""; }
      { const s = document.querySelector<HTMLElement>("#debug-api-status"); if (s) { s.textContent = ""; s.className = "debug-api-status"; } }
      return;
    case "toggle-benchmark-split": toggleBenchmarkSplit(); return;
    case "toggle-trace-panel": toggleChatTracePanel(); return;
    case "close-benchmark-split": closeBenchmarkSplit(); return;
    case "generate-benchmark-report": generateBenchmarkReport(); return;
    case "close-benchmark-report": closeBenchmarkReport(); return;
    case "export-benchmark-report": exportBenchmarkReport(); return;
    case "switch-default-llm-profile":
      if (payload.profileId) await switchDefaultHeaderLlmProfile(payload.profileId);
      return;
    case "add-llm-profile": addLlmProfile(); return;
    case "select-llm-profile":
      if (payload.profileId) selectLlmProfile(payload.profileId);
      return;
    case "set-default-llm-profile":
      if (payload.profileId) setDefaultLlmProfile(payload.profileId);
      return;
    case "select-benchmark-profile":
      if (payload.profileId && payload.benchmarkSide) {
        selectBenchmarkProfile(payload.benchmarkSide, payload.profileId);
      }
      return;
    case "delete-llm-profile":
      if (payload.profileId) deleteLlmProfile(payload.profileId);
      return;
    case "save-settings": await saveSettings(); return;
    case "test-llm": await testLlm(); return;
    case "test-mcp": await testMcp(); return;
    case "add-mcp-server": await addMcpServer(); return;
    case "cancel-edit-mcp-server":
      clearMcpServerForm();
      setSettingsFeedback("Connection form reset.", "idle");
      return;
    case "edit-mcp-server":
      if (payload.serverName) await editMcpServer(payload.serverName);
      return;
    case "delete-mcp-server":
      if (payload.serverName) await deleteMcpServer(payload.serverName);
      return;
    case "toggle-mcp-server":
      if (payload.serverName) await toggleMcpServer(payload.serverName);
      return;
  }
}

// ─── Settings ────────────────────────────────────────────────────────────────

function openSettings(tab: SettingsTab | string = "ai"): void {
  setActiveWorkspaceView("settings");
  state.ui.settingsTab = normalizeSettingsTab(typeof tab === "string" && tab.length ? tab : state.ui.settingsTab);
  setSettingsFeedback(getSettingsIdleMessage(state.ui.settingsTab), "idle");
  renderShellSummary(state);
  renderSettingsUI();
  void populateSettings();
  requestAnimationFrame(() => focusInitialSettingsField());
}

function closeSettings(): void {
  if (state.ui.settingsTab === "mcp") {
    clearMcpServerForm();
  }
  setActiveWorkspaceView(getWorkspaceViewForAppMode());
  renderShellSummary(state);
}

function openMcpInspector(): void {
  setAppMode("mcp-inspect");
}

function closeMcpInspector(): void {
  setAppMode("chat");
}

function openMcpSettings(): void {
  openSettings("mcp");
}

function closeMcpSettings(): void {
  closeSettings();
}

function toggleBenchmarkSplit(): void {
  if (getActiveWorkspaceView() === "benchmark") {
    closeBenchmark();
    return;
  }
  openBenchmark();
}

function toggleChatTracePanel(): void {
  const panel = document.querySelector<HTMLElement>("#chat-trace-panel");
  if (!panel) return;
  panel.hidden = !panel.hidden;
  if (!panel.hidden) {
    renderChatTracePanel();
  }
}

function renderChatTracePanel(): void {
  const body = document.querySelector<HTMLElement>("#chat-trace-tree-body");
  const durationEl = document.querySelector<HTMLElement>("#chat-trace-duration");
  const tokensEl = document.querySelector<HTMLElement>("#chat-trace-tokens");
  const toolsEl = document.querySelector<HTMLElement>("#chat-trace-tools");
  if (!body) return;

  const sessionId = state.activeSessionId;
  const metric = sessionId ? state.telemetry[sessionId] : null;

  if (durationEl) durationEl.textContent = metric ? `${Math.round(Number(metric.llm_latency_ms ?? 0) + Number(metric.tool_latency_ms ?? 0))} ms` : "—";
  if (tokensEl) tokensEl.textContent = metric ? String(Number(metric.total_tokens ?? 0)) : "—";
  if (toolsEl) toolsEl.textContent = metric ? String(Number(metric.tool_calls ?? 0)) : "—";

  // Build a simplified trace from events
  const events = state.events.filter((e) =>
    ["llm_start", "llm_end", "tool_call_start", "tool_call_end"].includes(e.event_type)
  );

  if (!events.length) {
    body.innerHTML = `<p class="chat-trace-empty">Send a message to see the trace.</p>`;
    return;
  }

  const firstTs = new Date(events[0].timestamp).getTime();
  const lastTs = new Date(events[events.length - 1].timestamp).getTime();
  const totalDuration = Math.max(lastTs - firstTs, 1);

  const rows = events.map((event) => {
    const ts = new Date(event.timestamp).getTime();
    const offset = ((ts - firstTs) / totalDuration) * 100;
    let label = "";
    let duration = "";
    let barWidth = 5;

    if (event.event_type === "llm_start") {
      label = `LLM ${String(event.payload.model ?? "").split("/").pop() || "call"}`;
    } else if (event.event_type === "llm_end") {
      const ms = Number(event.payload.latency_ms ?? 0);
      label = `LLM done`;
      duration = ms ? `${Math.round(ms)} ms` : "";
      barWidth = Math.max(5, (ms / totalDuration) * 100);
    } else if (event.event_type === "tool_call_start") {
      label = String(event.payload.tool_name ?? event.payload.display_name ?? "tool");
    } else if (event.event_type === "tool_call_end") {
      const ms = Number(event.payload.latency_ms ?? 0);
      label = String(event.payload.tool_name ?? "tool");
      duration = ms ? `${Math.round(ms)} ms` : "";
      barWidth = Math.max(5, (ms / totalDuration) * 100);
    }

    const isEnd = event.event_type.endsWith("_end");
    if (!isEnd) return ""; // Only render end events with durations

    return `
      <div class="chat-trace-row">
        <span class="chat-trace-span-name">${escapeHtml(label)}</span>
        <span class="chat-trace-span-dur">${escapeHtml(duration)}</span>
        <span class="chat-trace-span-bar">
          <span class="chat-trace-bar" style="left:${Math.max(0, offset - barWidth)}%;width:${barWidth}%;" data-type="${event.event_type.includes("llm") ? "llm" : "tool"}"></span>
        </span>
      </div>
    `;
  }).filter(Boolean).join("");

  body.innerHTML = rows || `<p class="chat-trace-empty">No trace spans yet.</p>`;
}

function closeBenchmarkSplit(): void {
  closeBenchmark();
}

async function saveGeneralSettings(): Promise<void> {
  const skipSsl = document.querySelector<HTMLInputElement>("#settings-skip-ssl")?.checked ?? false;
  setSettingsFeedback("Saving general settings...", "info");
  try {
    await requestJson("/api/config/general", {
      method: "PUT",
      body: JSON.stringify({ skip_ssl_verify: skipSsl }),
    });
    setSettingsFeedback("General settings saved. SSL change takes effect immediately.", "success");
  } catch (err) {
    setSettingsFeedback(`Save failed: ${getErrorMessage(err)}`, "error");
  }
}

function generateBenchmarkReport(): void {
  openBenchmarkReport();
}

function closeBenchmarkReport(): void {
  state.ui.benchmarkReportOpen = false;
  renderBenchmarkReportOverlay(state);
}

function exportBenchmarkReport(): void {
  // TODO: Export benchmark data as JSON or CSV
  setFeedback("Export functionality coming soon...", "idle");
}

async function populateSettings(): Promise<void> {
  try {
    const config = await requestJson<any>("/api/config");
    settingsConfigSnapshot = config ?? {};
    applyConfigState(config);
    hydrateLlmProfiles(config);
    renderSettingsMcpList(config);
    renderSettingsMcpFormState(config);
    renderSettingsOverview();
    handleTransportToggle();
    // Hydrate general settings
    const sslCheckbox = document.querySelector<HTMLInputElement>("#settings-skip-ssl");
    if (sslCheckbox) sslCheckbox.checked = Boolean(config.skip_ssl_verify);
  } catch (error) {
    settingsConfigSnapshot = {};
    hydrateLlmProfiles({});
    renderSettingsMcpList({});
    renderSettingsMcpFormState({});
    renderSettingsOverview();
    handleTransportToggle();
    setSettingsFeedback(`Could not load settings. ${getErrorMessage(error)}`, "error");
  }
}

async function saveSettings(): Promise<void> {
  const validationError = validateLlmProfileCollection("save");
  if (validationError) {
    setSettingsFeedback(validationError, "error");
    return;
  }

  const config = buildLlmConfigPayload();
  if (!config) {
    setSettingsFeedback("At least one AI profile is required before saving.", "error");
    return;
  }

  setSettingsFeedback("Saving AI profiles...", "info");
  try {
    // Auto-store raw API keys in keystore before saving
    await autoStoreKeysInKeystore();

    const updatedConfig = await requestJson<PublicConfigPayload>("/api/config", {
      method: "PUT",
      body: JSON.stringify(config),
    });
    applyConfigState(updatedConfig);
    setSettingsFeedback("AI profiles saved.", "success");
    setFeedback("Settings saved.", "success");
    closeSettings();
  } catch (error) {
    const message = getErrorMessage(error);
    setSettingsFeedback(message, "error");
    setFeedback(message, "error");
  }
}

async function testLlm(): Promise<void> {
  const profile = syncSelectedLlmProfileDraft(true);
  const payload = profile ? { llm: serializeLlmProfile(profile) } : null;
  const validationError = payload ? validateLlmSettings(payload.llm, "test") : "Select an AI profile before testing.";
  if (validationError) {
    setSettingsFeedback(validationError, "error");
    return;
  }

  if (!profile || !payload) {
    setSettingsFeedback("Select an AI profile before testing.", "error");
    return;
  }

  setSettingsFeedback(`Testing ${getLlmProfileDisplayName(profile)}...`, "info");
  try {
    const result = await requestJson<{ model: string; latency_ms: number; provider: string }>("/api/config/test/llm", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const latency = Math.round(Number(result.latency_ms ?? 0));
    const subject = payload.llm.provider === "local-cli"
      ? "CLI test passed"
      : payload.llm.provider === "github-copilot"
        ? "GitHub Models test passed"
        : "LLM test passed";
    const message = latency
      ? `${subject}. ${result.model} responded in ${latency} ms.`
      : `${subject} for ${result.model}.`;
    hideSettingsErrorBanner();
    setSettingsFeedback(message, "success");
    setFeedback(message, "success");
  } catch (error) {
    const message = getErrorMessage(error);
    // Show human-readable error banner
    const errorMsg = String(message);
    if (errorMsg.includes("Missing credentials") || errorMsg.includes("api_key") || errorMsg.includes("API key")) {
      showSettingsErrorBanner(
        "Cannot connect to provider",
        "The API key environment variable is not set or not accessible.",
        "Check API Key"
      );
    } else if (errorMsg.includes("timeout") || errorMsg.includes("Timeout")) {
      showSettingsErrorBanner(
        "Connection timed out",
        "The provider took too long to respond. Check your network or increase the timeout.",
      );
    } else if (errorMsg.includes("not found") || errorMsg.includes("404")) {
      showSettingsErrorBanner(
        "Model not found",
        "The model identifier may be incorrect. Check the provider's model catalog.",
      );
    } else {
      showSettingsErrorBanner("Test failed", errorMsg);
    }
    setSettingsFeedback(message, "error");
    setFeedback(message, "error");
  }
}

async function addMcpServer(): Promise<void> {
  const name = getInputValue("#settings-new-server-name").trim();
  const transport = getInputValue("#settings-new-server-transport");
  const editingServerName = state.ui.settingsEditingServerName;
  const config = editingServerName ? await requestJson<any>("/api/config") : null;
  const existingServerConfig = editingServerName ? config?.mcp_servers?.[editingServerName] : null;

  if (!name) {
    setSettingsFeedback("Connection name is required.", "error");
    return;
  }

  if (editingServerName && !existingServerConfig) {
    setSettingsFeedback(`Connection "${editingServerName}" could not be loaded for editing.`, "error");
    return;
  }

  const timeout = Number(getInputValue("#settings-new-server-timeout") || "30") || 30;

  const serverConfig: any = {
    transport: transport === "streamable-http" ? "sse" : transport,  // Backend treats streamable-http as sse variant
    enabled: existingServerConfig?.enabled !== false,
    timeout_seconds: timeout,
  };

  if (transport === "stdio") {
    const command = getInputValue("#settings-new-server-command").trim();
    const argsStr = getInputValue("#settings-new-server-args").trim();
    const cwd = getInputValue("#settings-new-server-cwd").trim();
    const envText = (document.querySelector<HTMLTextAreaElement>("#settings-new-server-env")?.value ?? "").trim();

    if (!command) {
      setSettingsFeedback("Command is required for STDIO transport.", "error");
      return;
    }
    serverConfig.command = command;
    serverConfig.args = argsStr ? argsStr.split(/\s+/) : [];
    serverConfig.cwd = cwd || null;
    serverConfig.env = {};
    if (envText) {
      for (const line of envText.split("\n")) {
        const eq = line.indexOf("=");
        if (eq > 0) {
          serverConfig.env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
        }
      }
    }
    serverConfig.url = null;
    serverConfig.headers = {};
  } else if (transport === "sse") {
    const url = getInputValue("#settings-new-server-url").trim();
    const headersText = (document.querySelector<HTMLTextAreaElement>("#settings-new-server-headers")?.value ?? "").trim();

    if (!url) {
      setSettingsFeedback("URL is required for SSE transport.", "error");
      return;
    }
    serverConfig.url = url;
    serverConfig.headers = {};
    if (headersText) {
      for (const line of headersText.split("\n")) {
        const colon = line.indexOf(":");
        if (colon > 0) {
          serverConfig.headers[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
        }
      }
    }
    serverConfig.command = null;
    serverConfig.args = [];
  } else if (transport === "streamable-http") {
    const url = getInputValue("#settings-new-server-streamable-url").trim();
    const headersText = (document.querySelector<HTMLTextAreaElement>("#settings-new-server-streamable-headers")?.value ?? "").trim();

    if (!url) {
      setSettingsFeedback("URL is required for Streamable HTTP transport.", "error");
      return;
    }
    serverConfig.url = url;
    serverConfig.headers = {};
    if (headersText) {
      for (const line of headersText.split("\n")) {
        const colon = line.indexOf(":");
        if (colon > 0) {
          serverConfig.headers[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
        }
      }
    }
    serverConfig.command = null;
    serverConfig.args = [];
  }

  const endpoint = editingServerName
    ? `/api/config/mcp-server/${encodeURIComponent(editingServerName)}`
    : "/api/config/mcp-server";
  const method = editingServerName ? "PATCH" : "POST";
  const startMessage = editingServerName ? "Saving..." : "Connecting...";
  const successMessage = editingServerName ? `"${editingServerName}" saved.` : `"${name}" connected.`;

  await runWithFeedback(startMessage, successMessage, async () => {
    await requestJson(endpoint, {
      method,
      body: JSON.stringify(editingServerName ? serverConfig : { name, ...serverConfig }),
    });
    await requestJson("/api/mcp/refresh", { method: "POST" });
    await refreshBootstrap(state.activeSessionId ?? undefined);
  });

  clearMcpServerForm();
  await refreshBootstrap(state.activeSessionId ?? undefined);
  await populateSettings();
}

async function deleteMcpServer(serverName: string): Promise<void> {
  const confirmed = window.confirm(`Delete MCP server "${serverName}"? This will remove it from your configuration.`);
  if (!confirmed) return;

  await runWithFeedback("Deleting connection...", `Connection "${serverName}" deleted.`, async () => {
    await requestJson(`/api/config/mcp-server/${encodeURIComponent(serverName)}`, {
      method: "DELETE",
    });
    await requestJson("/api/mcp/refresh", { method: "POST" });
    await refreshBootstrap(state.activeSessionId ?? undefined);
  });

  if (state.ui.settingsEditingServerName === serverName) {
    clearMcpServerForm();
  }
  await populateSettings();
  render();
}

async function toggleMcpServer(serverName: string): Promise<void> {
  // Get current config
  const config = await requestJson<any>("/api/config");
  const serverConfig = config.mcp_servers?.[serverName];
  if (!serverConfig) {
    setFeedback(`Server "${serverName}" not found.`, "error");
    return;
  }

  const newEnabled = !serverConfig.enabled;
  const action = newEnabled ? "enabled" : "disabled";

  await runWithFeedback(`${newEnabled ? "Enabling" : "Disabling"} connection...`, `Connection "${serverName}" ${action}.`, async () => {
    await requestJson(`/api/config/mcp-server/${encodeURIComponent(serverName)}`, {
      method: "PATCH",
      body: JSON.stringify({ enabled: newEnabled }),
    });
    await requestJson("/api/mcp/refresh", { method: "POST" });
    await refreshBootstrap(state.activeSessionId ?? undefined);
  });

  await populateSettings();
  render();
}

async function editMcpServer(serverName: string): Promise<void> {
  // Get current config
  const config = await requestJson<any>("/api/config");
  const serverConfig = config.mcp_servers?.[serverName];
  if (!serverConfig) {
    setFeedback(`Server "${serverName}" not found.`, "error");
    return;
  }

  settingsConfigSnapshot = config ?? {};
  state.ui.settingsEditingServerName = serverName;

  openMcpSettings();

  // Pre-fill the form with current values
  setInputValue("#settings-new-server-name", serverName);
  setInputValue("#settings-new-server-transport", serverConfig.transport || "stdio");
  setInputValue("#settings-new-server-timeout", String(serverConfig.timeout_seconds ?? 30));

  if (serverConfig.transport === "stdio") {
    setInputValue("#settings-new-server-command", serverConfig.command || "");
    setInputValue("#settings-new-server-args", (serverConfig.args || []).join(" "));
    setInputValue("#settings-new-server-cwd", serverConfig.cwd || "");
    const envEl = document.querySelector<HTMLTextAreaElement>("#settings-new-server-env");
    if (envEl) {
      envEl.value = Object.entries(serverConfig.env || {}).map(([k, v]) => `${k}=${v}`).join("\n");
    }
  } else {
    setInputValue("#settings-new-server-url", serverConfig.url || "");
    const headersEl = document.querySelector<HTMLTextAreaElement>("#settings-new-server-headers");
    if (headersEl) {
      headersEl.value = Object.entries(serverConfig.headers || {}).map(([k, v]) => `${k}: ${v}`).join("\n");
    }
    // Also fill streamable HTTP fields (same data)
    setInputValue("#settings-new-server-streamable-url", serverConfig.url || "");
    const streamHeadersEl = document.querySelector<HTMLTextAreaElement>("#settings-new-server-streamable-headers");
    if (streamHeadersEl) {
      streamHeadersEl.value = Object.entries(serverConfig.headers || {}).map(([k, v]) => `${k}: ${v}`).join("\n");
    }
  }

  handleTransportToggle();
  renderSettingsMcpList(settingsConfigSnapshot);
  renderSettingsMcpFormState(config);

  setSettingsFeedback(`Editing "${serverName}".`, "info");
}

async function testMcp(): Promise<void> {
  setSettingsFeedback("Testing connected tools...", "info");
  try {
    const result = await requestJson<{
      ok: boolean;
      servers: Array<{ name: string; connected: boolean; error?: string | null; tool_count?: number }>;
      tool_count: number;
    }>("/api/config/test/mcp", { method: "POST" });

    await refreshBootstrap(state.activeSessionId ?? undefined);
    await populateSettings();

    if (!result.servers.length) {
      const message = "No connected tools are configured yet.";
      setSettingsFeedback(message, "info");
      setFeedback(message, "info");
      return;
    }

    const healthy = result.servers.filter((server) => server.connected && !server.error);
    const failing = result.servers.find((server) => !server.connected || Boolean(server.error));
    const message = failing
      ? `Connected tools test found issues. ${healthy.length}/${result.servers.length} connections reachable. ${failing.name}: ${String(failing.error ?? "not connected")}.`
      : `Connected tools test passed. ${healthy.length} connections reachable and ${Number(result.tool_count ?? 0)} tools available.`;
    const tone: FeedbackTone = failing ? "error" : "success";
    setSettingsFeedback(message, tone);
    setFeedback(message, tone);
  } catch (error) {
    const message = getErrorMessage(error);
    setSettingsFeedback(message, "error");
    setFeedback(message, "error");
  }
}

// ─── Palette ─────────────────────────────────────────────────────────────────

function getFilteredPaletteCommands(): PaletteCommand[] {
  const query = state.ui.paletteQuery.trim().toLowerCase();
  const commands = getPaletteCommands();
  if (!query) return commands.slice(0, 12);
  return commands.filter((c) => [c.title, c.subtitle, ...c.keywords].join(" ").toLowerCase().includes(query)).slice(0, 12);
}

function getPaletteCommands(): PaletteCommand[] {
  const commands: PaletteCommand[] = [
    { id: "new-session", title: "New Conversation", subtitle: "Start a conversation", keywords: ["create", "new", "session", "conversation", "chat"], shortcut: getShortcutLabel(state.ui.platform, "newSession"), run: () => executeAction("create-session") },
    { id: "refresh-tools", title: "Refresh Connected Tools", subtitle: "Reload connected tools and their availability", keywords: ["refresh", "tools", "mcp", "servers", "connections"], shortcut: getShortcutLabel(state.ui.platform, "refreshTools"), run: () => executeAction("refresh-tools") },
    { id: "focus-prompt", title: "Focus Prompt", subtitle: "Jump to the composer", keywords: ["focus", "prompt", "composer"], shortcut: getShortcutLabel(state.ui.platform, "focusPrompt"), run: () => executeAction("focus-composer") },
    { id: "open-benchmark", title: "Benchmark Prompt", subtitle: "Compare the next prompt across multiple AI targets", keywords: ["benchmark", "compare", "models", "llm"], run: () => executeAction("open-benchmark") },
    { id: "open-settings", title: "Settings", subtitle: "Configure AI, connected tools, and preferences", keywords: ["settings", "config", "llm", "model", "api", "tools"], shortcut: "⌘,", run: () => executeAction("open-settings") },
    { id: "open-tools", title: "Connected Tools", subtitle: "Open tool connections and capability settings", keywords: ["tools", "mcp", "connections"], run: () => executeAction("open-mcp-settings") },
  ];

  for (const sessionId of state.ui.recentSessionIds) {
    const session = state.sessions.find((s) => s.session_id === sessionId);
    if (!session) continue;
    commands.push({
      id: `session-${sessionId}`,
      title: String(session.title ?? "Untitled"),
      subtitle: `Open conversation ${String(sessionId).slice(0, 8)}`,
      keywords: ["session", "conversation", String(session.title ?? ""), sessionId],
      run: () => executeAction("switch-session", { sessionId }),
    });
  }

  return commands;
}

function openCommandPalette(initialQuery = ""): void {
  state.ui.paletteOpen = true;
  state.ui.paletteQuery = initialQuery;
  state.ui.paletteIndex = 0;
  renderCommandPalette(state, getFilteredPaletteCommands(), getShortcutLabel(state.ui.platform, "palette"));
  requestAnimationFrame(() => document.querySelector<HTMLInputElement>("#command-input")?.focus());
}

function closeCommandPalette(): void {
  if (!state.ui.paletteOpen) return;
  state.ui.paletteOpen = false;
  state.ui.paletteQuery = "";
  state.ui.paletteIndex = 0;
  renderCommandPalette(state, getFilteredPaletteCommands(), getShortcutLabel(state.ui.platform, "palette"));
}

// ─── Context menu ────────────────────────────────────────────────────────────

function openContextMenu(x: number, y: number, items: ContextMenuItem[]): void {
  state.ui.contextMenu = { x, y, items };
  renderContextMenu(state);
}

function closeContextMenu(): void {
  if (!state.ui.contextMenu) return;
  state.ui.contextMenu = null;
  renderContextMenu(state);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function focusComposer(): void {
  const el = document.querySelector<HTMLTextAreaElement>("#composer-input");
  if (!el) return;
  el.focus();
  el.setSelectionRange(el.value.length, el.value.length);
}

function focusConversationSearch(): void {
  if (state.ui.sidebarCollapsed) {
    state.ui.sidebarCollapsed = false;
    renderShellSummary(state);
    renderSessions(state);
    persistWorkspaceState(state);
  }

  const input = document.querySelector<HTMLInputElement>("#conversation-search");
  if (!input) return;
  requestAnimationFrame(() => {
    input.focus();
    input.select();
  });
}

// Session management delegated to features/sessions.ts
import {
  initSessions,
  createSession,
  deleteSession,
  duplicateSession,
  shareSession,
  switchRelativeSession,
  startInlineSessionRename,
  cancelInlineSessionRename,
  saveInlineSessionRename,
  persistSessionTitle,
  clearInlineSessionRename,
} from "./features/sessions";

function openSupport(): void {
  toggleUtilityOverlay("#support-overlay", true);
}

function closeSupport(): void {
  toggleUtilityOverlay("#support-overlay", false);
}

function openContact(): void {
  if (!FORMSPREE_CONFIGURED) {
    setContactFeedback("Contact form is not configured yet. Set VITE_HERMES_FORMSPREE_ENDPOINT first.", "error");
  } else {
    setContactFeedback("Send a note directly from Hermes.", "idle");
  }
  toggleUtilityOverlay("#contact-overlay", true);
  requestAnimationFrame(() => document.querySelector<HTMLInputElement>("#contact-name")?.focus());
}

function closeContact(): void {
  toggleUtilityOverlay("#contact-overlay", false);
}

function openPaypalSupport(): void {
  if (!PAYPAL_CONFIGURED) {
    setFeedback("PayPal support is not configured yet. Set VITE_HERMES_PAYPAL_URL first.", "error");
    return;
  }

  window.open(PAYPAL_URL, "_blank", "noopener,noreferrer");
}

function toggleUtilityOverlay(selector: string, visible: boolean): void {
  const overlay = document.querySelector<HTMLElement>(selector);
  if (!overlay) {
    return;
  }

  overlay.hidden = !visible;
  overlay.setAttribute("aria-hidden", visible ? "false" : "true");
}

function setContactFeedback(message: string, tone: FeedbackTone): void {
  const feedback = document.querySelector<HTMLElement>("#contact-feedback");
  if (!feedback) {
    return;
  }

  feedback.textContent = message;
  feedback.dataset.tone = tone;
}

async function applySuggestedPrompt(prompt: string): Promise<void> {
  if (!state.activeSessionId) {
    const res = await requestJson<{ bootstrap: BootstrapPayload }>("/api/sessions", {
      method: "POST",
      body: JSON.stringify({ title: "New conversation" }),
    });
    applyBootstrap(res.bootstrap);
  }

  const input = document.querySelector<HTMLTextAreaElement>("#composer-input");
  if (!input) return;
  input.value = prompt;
  state.ui.composerDraft = prompt;
  persistWorkspaceState(state);
  focusComposer();
}

async function runWithFeedback(start: string, success: string, work: () => Promise<void>): Promise<void> {
  setFeedback(start, "info");
  try { await work(); setFeedback(success, "success"); }
  catch (error) { setFeedback(getErrorMessage(error), "error"); }
}

function setFeedback(message: string, tone: FeedbackTone): void {
  state.ui.feedback.message = message;
  state.ui.feedback.tone = tone;
  renderFeedback(state);
}

function focusDebugTraceStep(stepId: string): void {
  const row = document.getElementById(stepId);
  if (!row) {
    setFeedback("Trace step not found.", "error");
    return;
  }

  document.querySelectorAll<HTMLElement>(".debug-step-row.focused").forEach((element) => {
    element.classList.remove("focused");
  });
  document.querySelectorAll<HTMLButtonElement>(".debug-trace-nav-item.active, .debug-step-marker.active").forEach((button) => {
    button.classList.remove("active");
  });

  row.classList.add("focused");
  document.querySelectorAll<HTMLButtonElement>(`.debug-trace-nav-item[data-timeline-id="${stepId}"], .debug-step-marker[data-timeline-id="${stepId}"]`).forEach((button) => {
    button.classList.add("active");
  });

  row.scrollIntoView({ behavior: "smooth", block: "center" });
  row.querySelector<HTMLElement>(".debug-step-card")?.focus({ preventScroll: true });

  if (debugTraceFocusTimeout) {
    window.clearTimeout(debugTraceFocusTimeout);
  }
  debugTraceFocusTimeout = window.setTimeout(() => {
    row.classList.remove("focused");
    document.querySelectorAll<HTMLButtonElement>(`.debug-trace-nav-item[data-timeline-id="${stepId}"], .debug-step-marker[data-timeline-id="${stepId}"]`).forEach((button) => {
      button.classList.remove("active");
    });
  }, 1800);
}

function setSettingsFeedback(message: string, tone: FeedbackTone): void {
  state.ui.settingsFeedback.message = message;
  state.ui.settingsFeedback.tone = tone;
  renderSettingsFeedback();
}

function renderSettingsFeedback(): void {
  document.querySelectorAll<HTMLElement>("[data-settings-feedback]").forEach((feedback) => {
    feedback.textContent = state.ui.settingsFeedback.message;
    feedback.dataset.tone = state.ui.settingsFeedback.tone;
  });
}

function showSettingsErrorBanner(title: string, detail: string, ctaLabel?: string, ctaAction?: string): void {
  const banner = document.querySelector<HTMLElement>("#settings-ai-error-banner");
  const titleEl = document.querySelector<HTMLElement>("#settings-ai-error-title");
  const detailEl = document.querySelector<HTMLElement>("#settings-ai-error-detail");
  const ctaEl = document.querySelector<HTMLButtonElement>("#settings-ai-error-cta");
  if (!banner) return;
  banner.hidden = false;
  if (titleEl) titleEl.textContent = title;
  if (detailEl) detailEl.textContent = detail;
  if (ctaEl) {
    ctaEl.textContent = ctaLabel ?? "Fix";
    ctaEl.hidden = !ctaLabel;
  }
}

function hideSettingsErrorBanner(): void {
  const banner = document.querySelector<HTMLElement>("#settings-ai-error-banner");
  if (banner) banner.hidden = true;
}

function renderSettingsUI(): void {
  const overlay = document.querySelector<HTMLElement>("#settings-overlay");
  if (!overlay) {
    return;
  }

  overlay.querySelectorAll<HTMLButtonElement>(".settings-tab").forEach((button) => {
    const active = button.dataset.settingsTab === state.ui.settingsTab;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
    button.tabIndex = active ? 0 : -1;
  });

  overlay.querySelectorAll<HTMLElement>("[data-settings-panel]").forEach((panel) => {
    const active = panel.dataset.settingsPanel === state.ui.settingsTab;
    panel.hidden = !active;
    panel.setAttribute("aria-hidden", active ? "false" : "true");
  });

  const profileNav = overlay.querySelector<HTMLElement>("#settings-ai-profile-nav");
  if (profileNav) {
    const active = state.ui.settingsTab === "ai";
    profileNav.hidden = !active;
    profileNav.setAttribute("aria-hidden", active ? "false" : "true");
  }

  const llmTest = document.querySelector<HTMLElement>("#settings-test-llm");
  const llmSave = document.querySelector<HTMLElement>("#settings-save");
  const showLlmActions = state.ui.settingsTab === "ai";
  if (llmTest) llmTest.hidden = !showLlmActions;
  if (llmSave) llmSave.hidden = !showLlmActions;

  if (state.ui.settingsFeedback.tone === "idle") {
    state.ui.settingsFeedback.message = getSettingsIdleMessage(state.ui.settingsTab);
  }

  syncSelectedLlmProfileDraft(true);
  renderSettingsLlmProfiles();
  renderLlmProviderSettings(getSelectedLlmProfile()?.provider ?? getSelectedLlmProvider());
  renderSettingsOverview();
  renderSettingsMcpList(settingsConfigSnapshot);
  renderSettingsMcpFormState(settingsConfigSnapshot);
  renderSettingsFeedback();
}

function isLlmSettingsElement(target: EventTarget | null): target is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) {
    return false;
  }

  return new Set([
    "settings-llm-profile-name",
    "settings-provider",
    "settings-model",
    "settings-llm-api-base",
    "settings-api-key-env",
    "settings-cli-command",
    "settings-cli-args",
    "settings-temperature",
    "settings-top-p",
    "settings-presence-penalty",
    "settings-frequency-penalty",
    "settings-max-tokens",
    "settings-timeout-seconds",
    "settings-system-prompt",
  ]).has(target.id);
}

function getLlmProviderLabel(provider: LlmProviderMode): string {
  switch (provider) {
    case "local-cli": return "Local CLI";
    case "github-copilot": return "GitHub Models";
    case "local": return "Local API";
    case "anthropic": return "Anthropic";
    case "groq": return "Groq";
    case "mistral": return "Mistral AI";
    case "together": return "Together AI";
    case "perplexity": return "Perplexity";
    case "openrouter": return "OpenRouter";
    case "google": return "Google Gemini";
    case "cohere": return "Cohere";
    case "fireworks": return "Fireworks AI";
    case "deepseek": return "DeepSeek";
    default: return "OpenAI";
  }
}

function getLlmProfileDisplayName(profile: Pick<LlmProfileDraft, "name"> | null | undefined): string {
  return profile?.name.trim() || "Untitled AI Profile";
}

function createUniqueLlmProfileName(baseName: string): string {
  const normalizedExisting = new Set(
    settingsLlmState.profiles.map((profile) => getLlmProfileDisplayName(profile).toLowerCase()),
  );
  if (!normalizedExisting.has(baseName.toLowerCase())) {
    return baseName;
  }

  for (let index = 2; index < 100; index += 1) {
    const candidate = `${baseName} ${index}`;
    if (!normalizedExisting.has(candidate.toLowerCase())) {
      return candidate;
    }
  }
  return `${baseName} ${Date.now()}`;
}

function toOptionalFiniteNumber(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function createLlmProfileDraft(name: string, draft: Partial<LlmProfileDraft> = {}): LlmProfileDraft {
  const provider = normalizeLlmProvider(draft.provider, draft as Record<string, unknown>);
  return {
    id: `llm-profile-${++llmProfileCounter}`,
    name,
    provider,
    model: typeof draft.model === "string" ? draft.model : provider === "local-cli" ? "" : "openai/gpt-4.1-mini",
    api_base: typeof draft.api_base === "string" ? draft.api_base : provider === "github-copilot" ? GITHUB_MODELS_API_BASE : undefined,
    api_key_env: typeof draft.api_key_env === "string" ? draft.api_key_env : undefined,
    cli_command: typeof draft.cli_command === "string" ? draft.cli_command : undefined,
    cli_args: Array.isArray(draft.cli_args) ? draft.cli_args.map(String) : [],
    temperature: toOptionalFiniteNumber(draft.temperature) ?? 0.2,
    top_p: toOptionalFiniteNumber(draft.top_p),
    presence_penalty: toOptionalFiniteNumber(draft.presence_penalty),
    frequency_penalty: toOptionalFiniteNumber(draft.frequency_penalty),
    max_tokens: toOptionalFiniteNumber(draft.max_tokens) ?? 2048,
    timeout_seconds: toOptionalFiniteNumber(draft.timeout_seconds) ?? 90,
    system_prompt: typeof draft.system_prompt === "string" ? draft.system_prompt : undefined,
    api_key_present: Boolean(draft.api_key_present ?? draft.api_key_env),
  };
}

function getLlmProfileById(profileId: string | null | undefined): LlmProfileDraft | null {
  if (!profileId) return null;
  return settingsLlmState.profiles.find((profile) => profile.id === profileId) ?? null;
}

function ensureLlmProfileSelection(): LlmProfileDraft | null {
  if (!settingsLlmState.profiles.length) {
    const profile = createLlmProfileDraft(DEFAULT_LLM_PROFILE_NAME);
    settingsLlmState.profiles = [profile];
    settingsLlmState.selectedProfileId = profile.id;
    settingsLlmState.defaultProfileId = profile.id;
    return profile;
  }

  if (!getLlmProfileById(settingsLlmState.defaultProfileId)) {
    settingsLlmState.defaultProfileId = settingsLlmState.profiles[0]?.id ?? "";
  }
  if (!getLlmProfileById(settingsLlmState.selectedProfileId)) {
    settingsLlmState.selectedProfileId = settingsLlmState.defaultProfileId;
  }
  return getLlmProfileById(settingsLlmState.selectedProfileId);
}

function getSelectedLlmProfile(): LlmProfileDraft | null {
  return ensureLlmProfileSelection();
}

function getDefaultLlmProfile(): LlmProfileDraft | null {
  const selected = ensureLlmProfileSelection();
  return getLlmProfileById(settingsLlmState.defaultProfileId) ?? selected;
}

function serializeLlmProfile(profile: LlmProfileDraft): LlmSettingsForm {
  const provider = normalizeLlmProvider(profile.provider, profile as Record<string, unknown>);
  return {
    provider,
    model: profile.model.trim(),
    api_base: provider === "github-copilot"
      ? GITHUB_MODELS_API_BASE
      : provider === "local-cli"
        ? undefined
        : profile.api_base?.trim() || undefined,
    api_key_env: provider === "local-cli"
      ? undefined
      : profile.api_key_env?.trim() || undefined,
    // GitHub Models: Tell litellm to use OpenAI-compatible format at custom base URL
    custom_llm_provider: provider === "github-copilot" ? "openai" : undefined,
    disable_tools: profile.disable_tools ?? false,
    cli_command: provider === "local-cli" ? profile.cli_command?.trim() || undefined : undefined,
    cli_args: provider === "local-cli" ? profile.cli_args.map((value) => value.trim()).filter(Boolean) : [],
    temperature: toOptionalFiniteNumber(profile.temperature) ?? 0.2,
    top_p: toOptionalFiniteNumber(profile.top_p),
    presence_penalty: toOptionalFiniteNumber(profile.presence_penalty),
    frequency_penalty: toOptionalFiniteNumber(profile.frequency_penalty),
    max_tokens: Math.max(1, Math.round(toOptionalFiniteNumber(profile.max_tokens) ?? 2048)),
    timeout_seconds: Math.max(1, toOptionalFiniteNumber(profile.timeout_seconds) ?? 90),
    system_prompt: profile.system_prompt?.trim() || undefined,
  };
}

function syncSelectedLlmProfileDraft(renderList = false): LlmProfileDraft | null {
  const profile = ensureLlmProfileSelection();
  if (!profile) return null;

  profile.name = getInputValue("#settings-llm-profile-name");
  profile.provider = getSelectedLlmProvider();
  profile.model = getInputValue("#settings-model").trim();
  profile.api_base = getInputValue("#settings-llm-api-base").trim() || undefined;
  profile.api_key_env = getInputValue("#settings-api-key-env").trim() || undefined;
  profile.api_key_present = Boolean(profile.api_key_env);
  profile.cli_command = getInputValue("#settings-cli-command").trim() || undefined;
  profile.cli_args = getListInputValue("#settings-cli-args");
  profile.temperature = parseNumberInput("#settings-temperature", profile.temperature || 0.2);
  profile.top_p = parseOptionalNumberInput("#settings-top-p");
  profile.presence_penalty = parseOptionalNumberInput("#settings-presence-penalty");
  profile.frequency_penalty = parseOptionalNumberInput("#settings-frequency-penalty");
  profile.max_tokens = parseIntegerInput("#settings-max-tokens", profile.max_tokens || 2048);
  profile.timeout_seconds = parseNumberInput("#settings-timeout-seconds", profile.timeout_seconds || 90);
  profile.system_prompt = getInputValue("#settings-system-prompt").trim() || undefined;
  profile.disable_tools = document.querySelector<HTMLInputElement>("#settings-disable-tools")?.checked ?? false;

  if (renderList) {
    renderSettingsLlmProfiles();
  }
  return profile;
}

function populateSelectedLlmProfileForm(): void {
  const profile = ensureLlmProfileSelection();
  if (!profile) return;

  setInputValue("#settings-llm-profile-name", profile.name);
  setInputValue("#settings-provider", profile.provider);
  setInputValue("#settings-model", profile.model ?? "");
  setInputValue("#settings-llm-api-base", profile.api_base ?? "");
  setInputValue("#settings-api-key-env", profile.api_key_env ?? "");
  setInputValue("#settings-cli-command", profile.cli_command ?? "");
  setInputValue("#settings-cli-args", Array.isArray(profile.cli_args) ? profile.cli_args.join("\n") : "");
  setInputValue("#settings-temperature", String(profile.temperature ?? 0.2));
  setInputValue("#settings-top-p", profile.top_p === null || profile.top_p === undefined ? "" : String(profile.top_p));
  setInputValue("#settings-presence-penalty", profile.presence_penalty === null || profile.presence_penalty === undefined ? "" : String(profile.presence_penalty));
  setInputValue("#settings-frequency-penalty", profile.frequency_penalty === null || profile.frequency_penalty === undefined ? "" : String(profile.frequency_penalty));
  setInputValue("#settings-max-tokens", String(profile.max_tokens ?? 2048));
  setInputValue("#settings-timeout-seconds", String(profile.timeout_seconds ?? 90));
  setInputValue("#settings-system-prompt", profile.system_prompt ?? "");
  const disableToolsCheckbox = document.querySelector<HTMLInputElement>("#settings-disable-tools");
  if (disableToolsCheckbox) disableToolsCheckbox.checked = profile.disable_tools ?? false;
  renderLlmProviderSettings(profile.provider);
  renderSettingsLlmProfiles();
  renderSettingsOverview();

  const advancedProfileNote = document.querySelector<HTMLElement>("#settings-advanced-profile-note");
  if (advancedProfileNote) {
    advancedProfileNote.textContent = `Advanced controls below belong only to ${getLlmProfileDisplayName(profile)}.`;
  }
}

function hydrateLlmProfiles(config: any): void {
  const previousSelectedName = getSelectedLlmProfile()?.name.trim().toLowerCase() ?? "";
  const configuredProfiles = Object.entries(config?.llm_profiles ?? {}) as Array<[string, any]>;
  const fallbackName = String(config?.default_llm_profile ?? DEFAULT_LLM_PROFILE_NAME).trim() || DEFAULT_LLM_PROFILE_NAME;

  settingsLlmState.profiles = configuredProfiles.length
    ? configuredProfiles.map(([name, draft]) => createLlmProfileDraft(name, draft ?? {}))
    : [createLlmProfileDraft(fallbackName, config?.llm ?? {})];

  settingsLlmState.defaultProfileId =
    settingsLlmState.profiles.find((profile) => profile.name.trim() === fallbackName)?.id
    ?? settingsLlmState.profiles[0]?.id
    ?? "";
  settingsLlmState.selectedProfileId =
    settingsLlmState.profiles.find((profile) => profile.name.trim().toLowerCase() === previousSelectedName)?.id
    ?? settingsLlmState.defaultProfileId;

  populateSelectedLlmProfileForm();
}

function renderSettingsLlmProfiles(): void {
  const list = document.querySelector<HTMLElement>("#settings-llm-profile-list");
  const selectedProfileActions = document.querySelector<HTMLElement>("#settings-selected-profile-actions");
  const selectedProfile = ensureLlmProfileSelection();

  if (!list) return;
  if (!selectedProfile) {
    list.innerHTML = `<p class="empty small-empty">Add an AI profile to begin.</p>`;
    if (selectedProfileActions) {
      selectedProfileActions.innerHTML = "";
    }
    return;
  }

  const canDelete = settingsLlmState.profiles.length > 1;
  list.innerHTML = settingsLlmState.profiles
    .map((profile) => {
      const selected = profile.id === settingsLlmState.selectedProfileId;
      const isDefault = profile.id === settingsLlmState.defaultProfileId;
      const modelLabel = profile.provider === "local-cli"
        ? profile.cli_command?.trim() || "CLI runtime"
        : profile.model.trim() || "Model pending";

      return `
        <button type="button" class="settings-llm-profile-nav-item${selected ? " selected" : ""}" data-action="select-llm-profile" data-profile-id="${escapeHtml(profile.id)}">
          <div class="settings-rail-item-main">
            <div class="settings-llm-profile-copy settings-rail-item-copy">
              <strong>${escapeHtml(getLlmProfileDisplayName(profile))}</strong>
              <p class="settings-llm-profile-meta settings-rail-item-meta">${escapeHtml(`${getLlmProviderLabel(profile.provider)} • ${modelLabel}`)}</p>
            </div>
            ${isDefault ? '<span class="settings-rail-item-status">Default</span>' : ""}
          </div>
        </button>
      `;
    })
    .join("");

  if (selectedProfileActions) {
    const selectedIsDefault = selectedProfile.id === settingsLlmState.defaultProfileId;
    selectedProfileActions.innerHTML = `
      ${selectedIsDefault
        ? '<span class="tag">Workspace Default</span>'
        : `<button type="button" class="inline-action" data-action="set-default-llm-profile" data-profile-id="${escapeHtml(selectedProfile.id)}">Make Default</button>`}
      <button type="button" class="inline-action destructive" data-action="delete-llm-profile" data-profile-id="${escapeHtml(selectedProfile.id)}" ${canDelete ? "" : "disabled"}>Delete</button>
    `;
  }
}

function addLlmProfile(): void {
  syncSelectedLlmProfileDraft(true);
  const defaultProfile = getDefaultLlmProfile();
  const nextName = createUniqueLlmProfileName("New AI Profile");
  const draft = createLlmProfileDraft(nextName, {
    provider: "openai",
    model: "openai/gpt-4.1-mini",
    system_prompt: defaultProfile?.system_prompt,
  });
  settingsLlmState.profiles.push(draft);
  if (!settingsLlmState.defaultProfileId) {
    settingsLlmState.defaultProfileId = draft.id;
  }
  settingsLlmState.selectedProfileId = draft.id;
  populateSelectedLlmProfileForm();
  setSettingsFeedback(`Editing ${nextName}. Save the profile set when you're happy with it.`, "info");
  persistWorkspaceState(state);
  requestAnimationFrame(() => document.querySelector<HTMLInputElement>("#settings-llm-profile-name")?.focus());
}

function selectLlmProfile(profileId: string): void {
  if (!getLlmProfileById(profileId)) return;
  syncSelectedLlmProfileDraft(true);
  settingsLlmState.selectedProfileId = profileId;
  populateSelectedLlmProfileForm();
  persistWorkspaceState(state);
}

function setDefaultLlmProfile(profileId: string): void {
  const profile = getLlmProfileById(profileId);
  if (!profile) return;
  syncSelectedLlmProfileDraft(true);
  settingsLlmState.defaultProfileId = profileId;
  settingsLlmState.selectedProfileId = profileId;
  populateSelectedLlmProfileForm();
  setSettingsFeedback(`${getLlmProfileDisplayName(profile)} will become the workspace default AI profile after you save.`, "info");
}

function deleteLlmProfile(profileId: string): void {
  syncSelectedLlmProfileDraft(true);
  const profile = getLlmProfileById(profileId);
  if (!profile) return;
  if (settingsLlmState.profiles.length <= 1) {
    setSettingsFeedback("Keep at least one AI profile configured.", "error");
    return;
  }

  const confirmed = window.confirm(`Delete AI profile "${getLlmProfileDisplayName(profile)}"?`);
  if (!confirmed) return;

  settingsLlmState.profiles = settingsLlmState.profiles.filter((candidate) => candidate.id !== profileId);
  if (settingsLlmState.defaultProfileId === profileId) {
    settingsLlmState.defaultProfileId = settingsLlmState.profiles[0]?.id ?? "";
  }
  if (settingsLlmState.selectedProfileId === profileId) {
    settingsLlmState.selectedProfileId = settingsLlmState.defaultProfileId || settingsLlmState.profiles[0]?.id || "";
  }
  populateSelectedLlmProfileForm();
  setSettingsFeedback(`${getLlmProfileDisplayName(profile)} removed. Save the profile set to persist the change.`, "info");
}

function validateLlmProfileCollection(intent: "save"): string | null {
  syncSelectedLlmProfileDraft(true);
  if (!settingsLlmState.profiles.length) {
    return "Add at least one AI profile before saving.";
  }

  const seenNames = new Map<string, string>();
  for (const profile of settingsLlmState.profiles) {
    const normalizedName = profile.name.trim();
    if (!normalizedName) {
      return "Each AI profile needs a name before saving.";
    }
    const dedupeKey = normalizedName.toLowerCase();
    if (seenNames.has(dedupeKey)) {
      return `AI profile names must be unique. \"${normalizedName}\" duplicates \"${seenNames.get(dedupeKey)}\".`;
    }
    seenNames.set(dedupeKey, normalizedName);

    const validationError = validateLlmSettings(serializeLlmProfile(profile), intent);
    if (validationError) {
      return `${normalizedName}: ${validationError}`;
    }
  }

  if (!getDefaultLlmProfile()) {
    return "Choose a default AI profile before saving.";
  }
  return null;
}

function buildLlmConfigPayload(): { llm: LlmSettingsForm; llm_profiles: Record<string, LlmSettingsForm>; default_llm_profile: string } | null {
  syncSelectedLlmProfileDraft(true);
  const defaultProfile = getDefaultLlmProfile();
  if (!defaultProfile) return null;

  const profiles: Record<string, LlmSettingsForm> = {};
  for (const profile of settingsLlmState.profiles) {
    const normalizedName = profile.name.trim();
    if (!normalizedName) {
      return null;
    }
    profiles[normalizedName] = serializeLlmProfile(profile);
  }

  const defaultName = defaultProfile.name.trim();
  const activeProfile = profiles[defaultName];
  if (!activeProfile) {
    return null;
  }

  return {
    llm: activeProfile,
    llm_profiles: profiles,
    default_llm_profile: defaultName,
  };
}

function renderSettingsOverview(): void {
  const defaultProfile = getDefaultLlmProfile();
  const serverCount = state.servers.length;
  const toolCount = state.tools.length;

  setTextContent(
    "#settings-overview-provider",
    defaultProfile ? getLlmProfileDisplayName(defaultProfile) : "AI not configured",
  );
  setTextContent(
    "#settings-overview-model",
    defaultProfile
      ? `${getLlmProviderLabel(defaultProfile.provider)} • ${defaultProfile.provider === "local-cli"
        ? defaultProfile.cli_command?.trim() || "CLI runtime"
        : defaultProfile.model.trim() || "Model pending"}`
      : "Store multiple AI profiles and choose one default for everyday chat.",
  );
  setTextContent(
    "#settings-overview-mcp",
    serverCount
      ? `${serverCount} live connection${serverCount === 1 ? "" : "s"} • ${toolCount} tool${toolCount === 1 ? "" : "s"}`
      : "No connected tools yet",
  );
}

// ─── MCP Sidebar (tool list in left panel) ───────────────────────────────────

// ─── Lab View ────────────────────────────────────────────────────────────────

let currentLabPanel = "experiments";

function renderLabView(panel?: string): void {
  if (panel) currentLabPanel = panel;
  const container = document.querySelector<HTMLElement>("#lab-content");
  if (!container) return;

  // Highlight active sidebar item
  document.querySelectorAll<HTMLElement>('[data-action="lab-nav"]').forEach((item) => {
    item.classList.toggle("active", item.dataset.labPanel === currentLabPanel);
  });

  switch (currentLabPanel) {
    case "datasets":
      void renderLabDatasetsPanel(container);
      return;
    case "experiments":
      void renderLabExperimentsPanel(container);
      return;
    case "models":
      renderLabModelsPanel(container);
      return;
    case "mcp-versions":
      renderLabMcpVersionsPanel(container);
      return;
    case "workflows":
      renderLabWorkflowsPanel(container);
      return;
    case "fixtures":
      renderLabFixturesPanel(container);
      return;
    default:
      void renderLabExperimentsPanel(container);
  }
}

async function renderLabDatasetsPanel(container: HTMLElement): Promise<void> {
  // Delegate to the existing lab-datasets component
  const { renderLabDatasets } = await import("./components/lab-datasets");
  renderLabDatasets(container);
}

async function renderLabExperimentsPanel(container: HTMLElement): Promise<void> {
  const { renderLabExperiments } = await import("./components/lab-experiments");
  renderLabExperiments(container);
}

function renderLabModelsPanel(container: HTMLElement): void {
  container.innerHTML = `
    <div class="lab-panel-header">
      <div>
        <h2 class="lab-panel-title">Model Configs</h2>
        <p class="lab-panel-subtitle">Named LLM configurations for use as experiment variants.</p>
      </div>
      <div class="lab-actions">
        <button class="lab-btn primary" id="lab-mc-create-btn">+ New Config</button>
      </div>
    </div>
    <div class="lab-empty">
      <div class="lab-empty-icon">🤖</div>
      <p class="lab-empty-title">No model configs yet</p>
      <p class="lab-empty-desc">Register named model configurations (provider, model, temperature) to compare across experiments.</p>
    </div>
  `;
}

function renderLabMcpVersionsPanel(container: HTMLElement): void {
  container.innerHTML = `
    <div class="lab-panel-header">
      <div>
        <h2 class="lab-panel-title">MCP Versions</h2>
        <p class="lab-panel-subtitle">Versioned MCP server registrations with frozen tool schemas.</p>
      </div>
      <div class="lab-actions">
        <button class="lab-btn primary" id="lab-mv-register-btn">+ Register Version</button>
      </div>
    </div>
    <div class="lab-empty">
      <div class="lab-empty-icon">🔌</div>
      <p class="lab-empty-title">No MCP versions registered</p>
      <p class="lab-empty-desc">Register an MCP server version to capture its schema and use it in experiments.</p>
    </div>
  `;
}

function renderLabWorkflowsPanel(container: HTMLElement): void {
  container.innerHTML = `
    <div class="lab-panel-header">
      <div>
        <h2 class="lab-panel-title">Workflow Configs</h2>
        <p class="lab-panel-subtitle">Agent orchestration settings — system prompt, turn limits, and timeouts.</p>
      </div>
      <div class="lab-actions">
        <button class="lab-btn primary" id="lab-wc-create-btn">+ New Workflow</button>
      </div>
    </div>
    <div class="lab-empty">
      <div class="lab-empty-icon">⚙</div>
      <p class="lab-empty-title">No workflow configs yet</p>
      <p class="lab-empty-desc">Define workflow configurations to control how the agent orchestrates tool calls during experiment runs.</p>
    </div>
  `;
}

function renderLabFixturesPanel(container: HTMLElement): void {
  container.innerHTML = `
    <div class="lab-panel-header">
      <div>
        <h2 class="lab-panel-title">Mock Fixtures</h2>
        <p class="lab-panel-subtitle">Pre-recorded MCP responses for deterministic, cost-free experiment runs.</p>
      </div>
      <div class="lab-actions">
        <button class="lab-btn primary" id="lab-fx-create-btn">+ New Fixture</button>
      </div>
    </div>
    <div class="lab-empty">
      <div class="lab-empty-icon">📦</div>
      <p class="lab-empty-title">No mock fixtures yet</p>
      <p class="lab-empty-desc">Create fixtures with pre-recorded tool responses to run experiments without live MCP servers.</p>
    </div>
  `;
}

// ─── Debug Trace Tree ─────────────────────────────────────────────────────────

function renderTraceTree(state: HermesState): void {
  const body = document.querySelector<HTMLElement>("#trace-tree-body");
  if (!body) return;

  if (!state.events.length) {
    body.innerHTML = '<p class="trace-tree-empty">Select a session to view its trace tree.</p>';
    return;
  }

  // Compute total duration for waterfall scaling
  const firstTs = state.events.length ? new Date(state.events[0].timestamp).getTime() : 0;
  const lastTs = state.events.length ? new Date(state.events[state.events.length - 1].timestamp).getTime() : 0;
  const totalMs = Math.max(lastTs - firstTs, 1);

  // Update metrics bar
  const totalTokens = state.events
    .filter(e => e.event_type === "llm_end")
    .reduce((sum, e) => sum + Number(e.payload?.usage?.total_tokens ?? 0), 0);
  const mcpCalls = state.events.filter(e => e.event_type === "tool_call_end").length;
  const errors = state.events.filter(e => e.event_type === "error").length;
  const durationEl = document.querySelector("#trace-metric-duration");
  const tokensEl = document.querySelector("#trace-metric-tokens");
  const mcpEl = document.querySelector("#trace-metric-mcp");
  const errorsEl = document.querySelector("#trace-metric-errors");
  if (durationEl) durationEl.textContent = `${(totalMs / 1000).toFixed(1)}s`;
  if (tokensEl) tokensEl.textContent = totalTokens.toLocaleString();
  if (mcpEl) mcpEl.textContent = String(mcpCalls);
  if (errorsEl) errorsEl.textContent = String(errors);

  // Render trace spans
  body.innerHTML = state.events
    .filter(e => ["user_message", "llm_start", "llm_end", "tool_call_start", "tool_call_end", "error"].includes(e.event_type))
    .map((event) => {
      const ts = new Date(event.timestamp).getTime();
      const offsetPct = ((ts - firstTs) / totalMs) * 100;
      const latencyMs = Number(event.payload?.latency_ms ?? 0);
      const widthPct = Math.max((latencyMs / totalMs) * 100, 1);
      const kind = getSpanKind(event.event_type);
      const label = getSpanLabel(event);
      const duration = latencyMs ? `${Math.round(latencyMs)}ms` : "—";
      const indent = getSpanIndent(event.event_type);

      return `
        <div class="trace-span" data-event-id="${escapeHtml(event.event_id)}">
          <div class="trace-span-name">
            <span class="trace-span-indent" style="width:${indent}px"></span>
            <span class="trace-span-type" data-kind="${kind}"></span>
            <span class="trace-span-label">${escapeHtml(label)}</span>
          </div>
          <span class="trace-span-duration">${escapeHtml(duration)}</span>
          <div class="trace-span-bar-container">
            <div class="trace-span-bar" data-kind="${kind}" style="left:${offsetPct.toFixed(1)}%;width:${widthPct.toFixed(1)}%"></div>
          </div>
        </div>`;
    })
    .join("");
}

function getSpanKind(eventType: string): string {
  if (eventType.startsWith("llm")) return "llm";
  if (eventType.startsWith("tool")) return "tool";
  if (eventType === "error") return "error";
  if (eventType === "user_message") return "user";
  return "system";
}

function getSpanLabel(event: { event_type: string; payload: Record<string, any> }): string {
  switch (event.event_type) {
    case "user_message": return "user → " + (String(event.payload?.content ?? "").slice(0, 40) || "message");
    case "llm_start": return `llm.start (${String(event.payload?.model ?? "model")})`;
    case "llm_end": return `llm.end (${String(event.payload?.model ?? "model")})`;
    case "tool_call_start": return `tool → ${String(event.payload?.tool_name ?? event.payload?.qualified_name ?? "tool")}`;
    case "tool_call_end": return `tool ← ${String(event.payload?.tool_name ?? event.payload?.qualified_name ?? "tool")}`;
    case "error": return `⚠ ${String(event.payload?.source ?? "error")}`;
    default: return event.event_type;
  }
}

function getSpanIndent(eventType: string): number {
  if (eventType === "user_message") return 0;
  if (eventType === "llm_start" || eventType === "llm_end") return 12;
  if (eventType === "tool_call_start" || eventType === "tool_call_end") return 24;
  if (eventType === "error") return 12;
  return 0;
}

// ─── MCP Inspector (tool runner) ─────────────────────────────────────────────

// Module-level state for the MCP runner panel
const mcpRunner = {
  selectedServer: "" as string,
  selectedTool: "" as string,
  toolFilter: "" as string,
  args: "{}" as string,
};

function renderMcpInspectorView(): void {
  const view = document.querySelector<HTMLElement>("#mcp-inspect-view");
  if (!view) return;

  // Auto-select first connected server if none selected
  if (!mcpRunner.selectedServer && state.servers.length) {
    const firstConnected = state.servers.find((s: any) => s?.connected);
    mcpRunner.selectedServer = String((firstConnected ?? state.servers[0])?.name ?? "");
  }

  renderMcpToolSidebar();
  renderMcpRunnerForm();
}

function renderMcpToolSidebar(): void {
  const list = document.querySelector<HTMLElement>("#sidebar-mcp-list");
  if (!list) return;

  const searchInput = document.querySelector<HTMLInputElement>("#mcp-sidebar-search");
  const query = (searchInput?.value ?? "").toLowerCase();

  const tools = query
    ? state.tools.filter((t: any) => {
        const name = String(t?.display_name ?? t?.tool_name ?? t?.qualified_name ?? "").toLowerCase();
        const desc = String(t?.description ?? "").toLowerCase();
        return name.includes(query) || desc.includes(query);
      })
    : state.tools;

  if (!tools.length) {
    list.innerHTML = state.tools.length
      ? `<p class="mcp-runner-empty-tools">No tools match your filter.</p>`
      : `<p class="mcp-runner-empty-tools">No tools connected. Use Manage Connections to add servers.</p>`;
    return;
  }

  // Group by server
  const byServer = new Map<string, any[]>();
  for (const tool of tools) {
    const server = String(tool?.server_name ?? "Unknown");
    const arr = byServer.get(server) ?? [];
    arr.push(tool);
    byServer.set(server, arr);
  }

  list.innerHTML = Array.from(byServer.entries())
    .map(([serverName, serverTools]) => {
      const serverConnected = state.servers.find((s: any) => s?.name === serverName)?.connected;
      return `
        <div class="mcp-tool-group-label">${escapeHtml(serverName)} ${serverConnected ? "●" : "○"}</div>
        ${serverTools.map((tool: any) => {
          const id = String(tool?.qualified_name ?? tool?.tool_name ?? "");
          const displayName = String(tool?.display_name ?? tool?.tool_name ?? id);
          const selected = mcpRunner.selectedTool === id;
          return `
            <button
              type="button"
              class="mcp-runner-tool-item${selected ? " selected" : ""}"
              data-action="mcp-runner-select-tool"
              data-tool="${escapeHtml(id)}"
              title="${escapeHtml(String(tool?.description ?? ""))}"
            >
              ${escapeHtml(displayName)}
            </button>`;
        }).join("")}`;
    })
    .join("");}


function renderMcpRunnerForm(): void {
  const emptyEl = document.querySelector<HTMLElement>("#mcp-runner-empty");
  const formWrap = document.querySelector<HTMLElement>("#mcp-runner-form-wrap");
  if (!emptyEl || !formWrap) return;

  if (!mcpRunner.selectedTool) {
    emptyEl.hidden = false;
    formWrap.hidden = true;
    return;
  }

  const tool = state.tools.find((t: any) =>
    (t?.qualified_name ?? t?.tool_name) === mcpRunner.selectedTool
  );
  if (!tool) {
    emptyEl.hidden = false;
    formWrap.hidden = true;
    return;
  }

  emptyEl.hidden = true;
  formWrap.hidden = false;

  // Tool header
  const nameEl = document.querySelector<HTMLElement>("#mcp-runner-tool-name");
  const descEl = document.querySelector<HTMLElement>("#mcp-runner-tool-desc");
  const badgeEl = document.querySelector<HTMLElement>("#mcp-runner-tool-server-badge");
  if (nameEl) nameEl.textContent = String(tool?.display_name ?? tool?.tool_name ?? mcpRunner.selectedTool);
  if (descEl) descEl.textContent = String(tool?.description ?? "");
  if (badgeEl) badgeEl.textContent = String(tool?.server_name ?? "");

  // Schema
  const schemaBody = document.querySelector<HTMLElement>("#mcp-runner-schema-body");
  if (schemaBody) {
    const schema = tool?.input_schema ?? tool?.inputSchema ?? {};
    const props = schema?.properties;
    if (props && typeof props === "object" && Object.keys(props).length) {
      const required: string[] = Array.isArray(schema.required) ? schema.required : [];
      schemaBody.innerHTML = Object.entries(props as Record<string, any>)
        .map(([key, prop]) => {
          const isRequired = required.includes(key);
          const type = String((prop as any)?.type ?? "any");
          const desc = String((prop as any)?.description ?? "");
          return `
            <div class="mcp-runner-schema-param">
              <div class="mcp-runner-schema-param-header">
                <span class="mcp-runner-schema-param-name">${escapeHtml(key)}</span>
                <span class="mcp-runner-schema-type">${escapeHtml(type)}</span>
                ${isRequired ? `<span class="mcp-runner-schema-required">required</span>` : `<span class="mcp-runner-schema-optional">optional</span>`}
              </div>
              ${desc ? `<p class="mcp-runner-schema-desc">${escapeHtml(desc)}</p>` : ""}
            </div>`;
        })
        .join("");
    } else {
      schemaBody.innerHTML = `<p class="mcp-runner-schema-empty">No input parameters defined for this tool.</p>`;
    }
  }

  // Render dynamic form fields
  const formFields = document.querySelector<HTMLElement>("#mcp-runner-form-fields");
  if (formFields && tool) {
    const schema = tool?.input_schema ?? tool?.inputSchema ?? {};
    const props = schema?.properties;
    const required: string[] = Array.isArray(schema.required) ? schema.required : [];
    if (props && typeof props === "object" && Object.keys(props).length) {
      formFields.innerHTML = Object.entries(props as Record<string, any>)
        .map(([key, prop]) => {
          const isRequired = required.includes(key);
          const type = String((prop as any)?.type ?? "string");
          const desc = String((prop as any)?.description ?? "");
          const currentVal = (() => { try { return JSON.parse(mcpRunner.args)[key] ?? ""; } catch { return ""; } })();
          const inputType = type === "number" || type === "integer" ? "number" : type === "boolean" ? "checkbox" : "text";
          return `
            <div class="mcp-form-field">
              <label class="mcp-form-field-label">
                ${escapeHtml(key)}
                <span class="mcp-form-type">${escapeHtml(type)}</span>
                ${isRequired ? '<span class="mcp-form-required">required</span>' : ''}
              </label>
              ${desc ? `<p class="mcp-form-field-desc">${escapeHtml(desc)}</p>` : ''}
              ${type === "boolean"
                ? `<input type="checkbox" class="mcp-form-input" data-field="${escapeHtml(key)}" ${currentVal ? "checked" : ""} />`
                : type === "array" || type === "object"
                  ? `<textarea class="mcp-form-input" data-field="${escapeHtml(key)}" rows="3">${escapeHtml(typeof currentVal === 'string' ? currentVal : JSON.stringify(currentVal, null, 2))}</textarea>`
                  : `<input type="${inputType}" class="mcp-form-input" data-field="${escapeHtml(key)}" value="${escapeHtml(String(currentVal))}" />`
              }
            </div>`;
        }).join("");
    } else {
      formFields.innerHTML = `<p class="mcp-runner-schema-empty">No parameters — this tool takes no input.</p>`;
    }
  }

  // Toggle form/json visibility based on mode
  const formFieldsEl = document.querySelector<HTMLElement>("#mcp-runner-form-fields");
  const jsonTextarea = document.querySelector<HTMLTextAreaElement>("#mcp-runner-args");
  const formBtn = document.querySelector<HTMLElement>("#mcp-runner-mode-form-btn");
  const jsonBtn = document.querySelector<HTMLElement>("#mcp-runner-mode-json-btn");
  if (formFieldsEl && jsonTextarea) {
    const isFormMode = formBtn?.classList.contains("active") ?? true;
    formFieldsEl.hidden = !isFormMode;
    jsonTextarea.hidden = isFormMode;
  }

  // Restore args
  const argsEl = document.querySelector<HTMLTextAreaElement>("#mcp-runner-args");
  if (argsEl && argsEl !== document.activeElement) {
    argsEl.value = mcpRunner.args;
  }
}

function syncFormFieldsToJson(): void {
  const fields = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(".mcp-form-input");
  const obj: Record<string, unknown> = {};
  fields.forEach((field) => {
    const key = field.dataset.field;
    if (!key) return;
    if (field.type === "checkbox") {
      obj[key] = (field as HTMLInputElement).checked;
    } else if (field.type === "number") {
      obj[key] = field.value ? Number(field.value) : null;
    } else {
      const val = field.value.trim();
      // Try parsing as JSON for arrays/objects
      if (val.startsWith("[") || val.startsWith("{")) {
        try { obj[key] = JSON.parse(val); return; } catch { /* treat as string */ }
      }
      obj[key] = val;
    }
  });
  mcpRunner.args = JSON.stringify(obj, null, 2);
  const textarea = document.querySelector<HTMLTextAreaElement>("#mcp-runner-args");
  if (textarea) textarea.value = mcpRunner.args;
}

function selectMcpRunnerServer(serverName: string): void {
  mcpRunner.selectedServer = serverName;
  // Reset tool if it doesn't belong to this server
  const tool = state.tools.find((t: any) =>
    (t?.qualified_name ?? t?.tool_name) === mcpRunner.selectedTool &&
    t?.server_name === serverName
  );
  if (!tool) {
    mcpRunner.selectedTool = "";
    mcpRunner.args = "{}";
  }
  renderMcpInspectorView();
}

function selectMcpRunnerTool(toolId: string): void {
  mcpRunner.selectedTool = toolId;
  // Auto-select the server this tool belongs to
  const tool = state.tools.find((t: any) =>
    (t?.qualified_name ?? t?.tool_name) === toolId
  );
  if (tool) {
    mcpRunner.selectedServer = String(tool?.server_name ?? mcpRunner.selectedServer);
    // Build default args scaffold from schema
    const schema = tool?.input_schema ?? tool?.inputSchema ?? {};
    const props = schema?.properties;
    if (props && typeof props === "object" && Object.keys(props).length) {
      const scaffold: Record<string, unknown> = {};
      for (const [key, prop] of Object.entries(props as Record<string, any>)) {
        const type = String((prop as any)?.type ?? "");
        scaffold[key] = type === "string" ? "" : type === "number" || type === "integer" ? 0 : type === "boolean" ? false : type === "array" ? [] : null;
      }
      mcpRunner.args = JSON.stringify(scaffold, null, 2);
    } else {
      mcpRunner.args = "{}";
    }
  }
  renderMcpInspectorView();
}

async function runMcpTool(): Promise<void> {
  const feedbackEl = document.querySelector<HTMLElement>("#mcp-runner-feedback");
  const resultWrap = document.querySelector<HTMLElement>("#mcp-runner-result-wrap");
  const resultEl = document.querySelector<HTMLElement>("#mcp-runner-result");
  const latencyEl = document.querySelector<HTMLElement>("#mcp-runner-latency");
  const runBtn = document.querySelector<HTMLButtonElement>("#mcp-runner-run-btn");
  const argsEl = document.querySelector<HTMLTextAreaElement>("#mcp-runner-args");
  const resultPlaceholder = document.querySelector<HTMLElement>("#mcp-runner-result-empty");

  if (!mcpRunner.selectedTool) {
    setMcpRunnerFeedback("Select a tool first.", "error");
    return;
  }

  // Parse and validate args
  const rawArgs = argsEl?.value.trim() || "{}";
  let parsedArgs: Record<string, unknown> = {};
  try {
    parsedArgs = JSON.parse(rawArgs);
  } catch {
    setMcpRunnerFeedback("Arguments are not valid JSON.", "error");
    const argsError = document.querySelector<HTMLElement>("#mcp-runner-args-error");
    if (argsError) { argsError.hidden = false; argsError.textContent = "Invalid JSON — check your arguments and try again."; }
    return;
  }
  const argsError = document.querySelector<HTMLElement>("#mcp-runner-args-error");
  if (argsError) argsError.hidden = true;

  mcpRunner.args = rawArgs;

  // Build a temp session from the active session or use "system"
  const sessionId = state.activeSessionId ?? "system";

  if (runBtn) { runBtn.disabled = true; runBtn.textContent = "Running…"; }
  setMcpRunnerFeedback("Running…", "info");
  if (resultWrap) resultWrap.hidden = true;

  const started = performance.now();
  try {
    const response = await requestJson<{ result: any }>("/api/tools/run", {
      method: "POST",
      body: JSON.stringify({
        session_id: sessionId,
        tool_name: mcpRunner.selectedTool,
        arguments: parsedArgs,
      }),
    });

    const elapsed = Math.round(performance.now() - started);
    const result = response?.result;
    const text = result?.text ?? result?.response_json ?? result ?? {};

    if (resultEl) resultEl.textContent = typeof text === "string" ? text : JSON.stringify(text, null, 2);
    if (latencyEl) latencyEl.textContent = `${elapsed} ms`;
    if (resultWrap) resultWrap.hidden = false;
    if (resultPlaceholder) resultPlaceholder.hidden = true;

    const isError = Boolean(result?.is_error);
    setMcpRunnerFeedback(isError ? "Tool returned an error." : "Tool ran successfully.", isError ? "error" : "success");
  } catch (err) {
    const elapsed = Math.round(performance.now() - started);
    if (resultEl) resultEl.textContent = String(err);
    if (latencyEl) latencyEl.textContent = `${elapsed} ms`;
    if (resultWrap) resultWrap.hidden = false;
    if (resultPlaceholder) resultPlaceholder.hidden = true;
    setMcpRunnerFeedback(`Failed: ${getErrorMessage(err)}`, "error");
  } finally {
    if (runBtn) { runBtn.disabled = false; runBtn.textContent = "Run Tool"; }
  }
}

function setMcpRunnerFeedback(message: string, tone: "idle" | "info" | "success" | "error"): void {
  const el = document.querySelector<HTMLElement>("#mcp-runner-feedback");
  if (!el) return;
  el.textContent = message;
  el.dataset["tone"] = tone;
}

async function refreshMcpInspector(): Promise<void> {
  try {
    await requestJson("/api/mcp/refresh", { method: "POST" });
    await refreshBootstrap(state.activeSessionId ?? undefined);
    setFeedback("MCP runtime refreshed.", "success");
  } catch (error) {
    setFeedback(`Refresh failed. ${getErrorMessage(error)}`, "error");
  }
  renderMcpInspectorView();
}

function renderMcpConnectionCard(server: any): string {
  const status = getMcpConnectionStatus(server);
  const target = getMcpConnectionTarget(server);
  const serverName = String(server?.name ?? "Unnamed MCP server");
  return `
    <article class="mcp-connection-card">
      <div class="mcp-connection-header">
        <div class="mcp-connection-copy">
          <span class="mcp-connection-name">${escapeHtml(serverName)}</span>
          <p class="settings-note">${escapeHtml(status.detail)}</p>
        </div>
        <span class="mcp-connection-status ${escapeHtml(status.tone)}">
          <span aria-hidden="true">●</span> ${escapeHtml(status.label)}
        </span>
      </div>
      <div class="settings-overview-grid settings-overview-grid-compact">
        ${renderSettingsMetricCard("Transport", String(server?.transport ?? "unknown"), target || "No runtime target reported.")}
        ${renderSettingsMetricCard("Tools", String(Number(server?.tool_count ?? 0)), Number(server?.tool_count ?? 0) ? "Visible to Hermes." : "No tools reported yet.")}
        ${renderSettingsMetricCard("Runtime", server?.connected ? "Live" : "Waiting", server?.error ? String(server.error) : "Use Refresh to re-check this connection.")}
      </div>
      <div class="mcp-connection-actions">
        <button type="button" class="inline-action" data-action="refresh-mcp-inspector">${server?.connected ? "Refresh runtime" : "Connect runtime"}</button>
        <button type="button" class="inline-action" data-action="edit-mcp-server" data-server-name="${escapeHtml(serverName)}">Manage</button>
      </div>
    </article>
  `;
}

function getMcpConnectionStatus(server: any): { label: string; tone: string; detail: string } {
  if (server?.error) {
    return {
      label: "Error",
      tone: "disconnected",
      detail: String(server.error),
    };
  }
  if (server?.connected) {
    return {
      label: "Connected",
      tone: "connected",
      detail: `${Number(server?.tool_count ?? 0)} tool${Number(server?.tool_count ?? 0) === 1 ? "" : "s"} available to Hermes.`,
    };
  }
  return {
    label: "Waiting",
    tone: "idle",
    detail: "Configured, but Hermes has not connected to this runtime yet.",
  };
}

function renderSettingsMetricCard(label: string, value: string, detail: string): string {
  return `
    <article class="settings-overview-card settings-overview-card-compact">
      <span class="settings-overview-label">${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <p>${escapeHtml(detail)}</p>
    </article>
  `;
}

function renderSettingsMcpList(config: any): void {
  const list = document.querySelector<HTMLElement>("#settings-mcp-list");
  const resolvedConfig = config && Object.keys(config).length ? config : settingsConfigSnapshot;
  if (!list) return;

  const configuredEntries = Object.entries(resolvedConfig?.mcp_servers ?? {}) as Array<[string, any]>;
  const liveServers = new Map(state.servers.map((server) => [String(server.name), server]));

  list.innerHTML = configuredEntries.length
    ? configuredEntries
        .map(([name, serverConfig]) => {
          const live = liveServers.get(name);
          const enabled = serverConfig.enabled !== false;
          const editing = state.ui.settingsEditingServerName === name;
          const statusLabel = !enabled
            ? "disabled"
            : live?.connected
              ? "connected"
              : live?.error
                ? "error"
                : "not connected";
          const statusClass = !enabled ? "" : live?.connected ? "ok" : live?.error ? "error" : "idle";
          const detail = !enabled
            ? "Disabled in config."
            : live?.error
              ? String(live.error)
              : live?.connected
                ? `${Number(live.tool_count ?? 0)} tools available.`
                : "Configured but not currently connected.";
          const target = getMcpConnectionTarget(serverConfig);
          const transport = String(serverConfig.transport ?? "stdio").toUpperCase();
          const meta = target
            ? `${transport} • ${target}`
            : `${transport} • ${detail}`;

          return `
            <button type="button" class="settings-mcp-nav-item${editing ? " selected" : ""}" data-action="edit-mcp-server" data-server-name="${escapeHtml(name)}">
              <div class="settings-rail-item-main">
                <div class="settings-mcp-copy settings-rail-item-copy">
                  <span class="settings-mcp-name">${escapeHtml(name)}</span>
                  <p class="settings-mcp-detail settings-rail-item-meta" title="${escapeHtml(meta)}">${escapeHtml(meta)}</p>
                </div>
                <span class="settings-mcp-status settings-rail-item-status ${statusClass}">${escapeHtml(statusLabel)}</span>
              </div>
            </button>
          `;
        })
        .join("")
    : `<p class="empty small-empty">No MCP connections saved yet. Use Add Connection to create the first one.</p>`;
}

function renderSettingsMcpFormState(config: any): void {
  const title = document.querySelector<HTMLElement>("#settings-mcp-form-title");
  const submit = document.querySelector<HTMLButtonElement>("#settings-save-mcp");
  const cancel = document.querySelector<HTMLButtonElement>("#settings-cancel-mcp");
  const nameInput = document.querySelector<HTMLInputElement>("#settings-new-server-name");
  const editorTitle = document.querySelector<HTMLElement>("#settings-mcp-editor-title");
  const editorNote = document.querySelector<HTMLElement>("#settings-mcp-editor-note");
  const editorActions = document.querySelector<HTMLElement>("#settings-mcp-editor-actions");
  const summary = document.querySelector<HTMLElement>("#settings-mcp-connection-summary");

  if (!title || !submit || !cancel || !nameInput) {
    return;
  }

  const resolvedConfig = config && Object.keys(config).length ? config : settingsConfigSnapshot;
  const editingServerName = state.ui.settingsEditingServerName;
  const knownServer = editingServerName ? resolvedConfig?.mcp_servers?.[editingServerName] : null;
  if (editingServerName && !knownServer) {
    state.ui.settingsEditingServerName = null;
  }

  const activeEditName = state.ui.settingsEditingServerName;
  const editing = Boolean(activeEditName);
  const liveServer = activeEditName
    ? state.servers.find((server) => String(server.name ?? "") === activeEditName) ?? null
    : null;
  const enabled = knownServer?.enabled !== false;
  const target = getMcpConnectionTarget(knownServer);
  const detail = !editing
    ? "Create a connection, then save it into the left rail for reuse."
    : !enabled
      ? "This connection is disabled in config. Enable it when you want Hermes to expose its tools."
      : liveServer?.error
        ? String(liveServer.error)
        : liveServer?.connected
          ? `${Number(liveServer.tool_count ?? 0)} tool${Number(liveServer.tool_count ?? 0) === 1 ? "" : "s"} available right now.`
          : "Configured, but Hermes has not connected to it yet.";

  title.textContent = editing ? `Edit Connection: ${activeEditName}` : "Add Connection";
  submit.textContent = editing ? "Save Connection" : "Add Connection";
  cancel.hidden = !editing;
  nameInput.readOnly = editing;
  nameInput.setAttribute("aria-readonly", editing ? "true" : "false");

  if (editorTitle) {
    editorTitle.textContent = editing ? activeEditName ?? "Selected Connection" : "New Connection";
  }
  if (editorNote) {
    editorNote.textContent = editing
      ? `This editor owns the transport, target, and runtime state for ${activeEditName}.`
      : "Pick a transport, define its target, then save the connection into the left rail.";
  }
  if (editorActions) {
    editorActions.innerHTML = editing && activeEditName
      ? `
          <button type="button" class="inline-action" data-action="toggle-mcp-server" data-server-name="${escapeHtml(activeEditName)}">${enabled ? "Disable" : "Enable"}</button>
          <button type="button" class="inline-action destructive" data-action="delete-mcp-server" data-server-name="${escapeHtml(activeEditName)}">Delete</button>
        `
      : "";
  }
  if (summary) {
    summary.innerHTML = editing && activeEditName
      ? [
          renderSettingsMetricCard("Transport", String(knownServer?.transport ?? "stdio"), target || "No target configured."),
          renderSettingsMetricCard("Health", liveServer?.connected ? "Connected" : enabled ? "Waiting" : "Disabled", detail),
          renderSettingsMetricCard("Tools", String(Number(liveServer?.tool_count ?? 0)), liveServer?.connected ? "Visible to Hermes right now." : "Expose tools by enabling and refreshing this connection."),
        ].join("")
      : [
          renderSettingsMetricCard("Transport", "stdio or SSE", "Launch a local process or point Hermes at a remote SSE endpoint."),
          renderSettingsMetricCard("Selection", "No connection selected", "Choose a saved connection from the left rail to edit it."),
          renderSettingsMetricCard("Live Tools", String(state.tools.length), state.tools.length ? "Currently available to Hermes." : "No connected tools yet."),
        ].join("");
  }
}

function clearMcpServerForm(): void {
  state.ui.settingsEditingServerName = null;
  setInputValue("#settings-new-server-name", "");
  setInputValue("#settings-new-server-transport", "stdio");
  setInputValue("#settings-new-server-command", "");
  setInputValue("#settings-new-server-args", "");
  setInputValue("#settings-new-server-cwd", "");
  setInputValue("#settings-new-server-url", "");
  setInputValue("#settings-new-server-streamable-url", "");
  setInputValue("#settings-new-server-timeout", "30");
  const envEl = document.querySelector<HTMLTextAreaElement>("#settings-new-server-env");
  if (envEl) envEl.value = "";
  const headersEl = document.querySelector<HTMLTextAreaElement>("#settings-new-server-headers");
  if (headersEl) headersEl.value = "";
  const streamHeadersEl = document.querySelector<HTMLTextAreaElement>("#settings-new-server-streamable-headers");
  if (streamHeadersEl) streamHeadersEl.value = "";
  renderSettingsMcpList(settingsConfigSnapshot);
  renderSettingsMcpFormState(settingsConfigSnapshot);
  handleTransportToggle();
}

function getMcpConnectionTarget(serverConfig: any): string {
  if (!serverConfig) {
    return "";
  }

  if (serverConfig.transport === "stdio") {
    return [serverConfig.command, ...(Array.isArray(serverConfig.args) ? serverConfig.args : [])].filter(Boolean).join(" ");
  }

  return String(serverConfig.url ?? serverConfig.endpoint ?? "");
}

function normalizeLlmProvider(provider: unknown, llm: Record<string, unknown> = {}): LlmProviderMode {
  const raw = String(provider ?? "openai").trim().toLowerCase();
  const model = String(llm.model ?? "").trim().toLowerCase();
  const apiBase = String(llm.api_base ?? "").trim();
  const apiBaseLower = apiBase.toLowerCase();

  if (raw === "litellm") {
    return apiBase || model.startsWith("ollama/") || model.startsWith("localai/") || model.startsWith("gpt4all/")
      ? "local"
      : "openai";
  }
  if (raw === "openai" && apiBaseLower.includes("models.github.ai")) {
    return "github-copilot";
  }
  if (raw === "github-copilot" || raw === "github copilot" || raw === "copilot" || raw === "github-models" || raw === "github models") {
    return "github-copilot";
  }
  if (raw === "anthropic" || raw === "claude") return "anthropic";
  if (raw === "groq") return "groq";
  if (raw === "mistral" || raw === "mistralai" || raw === "mistral-ai" || raw === "mistral ai") return "mistral";
  if (raw === "together" || raw === "togetherai" || raw === "together-ai" || raw === "together ai") return "together";
  if (raw === "perplexity" || raw === "perplexityai" || raw === "perplexity-ai" || raw === "perplexity ai") return "perplexity";
  if (raw === "openrouter" || raw === "open-router" || raw === "open router") return "openrouter";
  if (raw === "google" || raw === "gemini" || raw === "google-gemini" || raw === "google gemini") return "google";
  if (raw === "cohere" || raw === "command-r") return "cohere";
  if (raw === "fireworks" || raw === "fireworksai" || raw === "fireworks-ai" || raw === "fireworks ai") return "fireworks";
  if (raw === "deepseek" || raw === "deep-seek" || raw === "deep seek") return "deepseek";
  if (raw === "local" || raw === "ollama" || raw === "localai") return "local";
  if (raw === "local-cli" || raw === "localai-cli" || raw === "local-ai-cli") return "local-cli";
  return "openai";
}

function getSelectedLlmProvider(): LlmProviderMode {
  return normalizeLlmProvider(getInputValue("#settings-provider"));
}

function renderLlmProviderSettings(provider: LlmProviderMode = getSelectedLlmProvider()): void {
  const copy = LLM_PROVIDER_COPY[provider];
  setTextContent("#settings-llm-provider-hint", copy.hint);
  setTextContent("#settings-model-label", copy.modelLabel);
  setTextContent("#settings-api-base-label", copy.apiBaseLabel);
  setTextContent("#settings-api-key-label", copy.apiKeyLabel);
  setTextContent("#settings-cli-note", "Use one argument per line. Include {prompt} to inline the rendered conversation; otherwise Hermes writes it to stdin. Tool calling is disabled in CLI mode.");
  setTextContent("#settings-provider-mode-note", copy.connectionNote ?? "");

  const modelModeNote = document.querySelector<HTMLElement>("#settings-model-mode-note");
  if (modelModeNote) {
    modelModeNote.hidden = !copy.modelNote;
    modelModeNote.textContent = copy.modelNote ?? "";
  }

  const modelInput = document.querySelector<HTMLInputElement>("#settings-model");
  if (modelInput) modelInput.placeholder = copy.modelPlaceholder;

  const apiBaseInput = document.querySelector<HTMLInputElement>("#settings-llm-api-base");
  if (apiBaseInput) apiBaseInput.placeholder = copy.apiBasePlaceholder;

  const githubEndpointInput = document.querySelector<HTMLInputElement>("#settings-github-endpoint");
  if (githubEndpointInput) githubEndpointInput.value = GITHUB_MODELS_API_BASE;

  const apiKeyInput = document.querySelector<HTMLInputElement>("#settings-api-key-env");
  if (apiKeyInput) apiKeyInput.placeholder = copy.apiKeyPlaceholder;

  const isCliMode = provider === "local-cli";

  document.querySelectorAll<HTMLElement>('[data-llm-provider-mode="api"]').forEach((section) => {
    section.hidden = isCliMode;
  });
  document.querySelectorAll<HTMLElement>('[data-llm-provider-mode="cli"]').forEach((section) => {
    section.hidden = !isCliMode;
  });
  document.querySelectorAll<HTMLElement>('[data-llm-provider-mode="sampling"]').forEach((section) => {
    section.hidden = isCliMode;
  });
  document.querySelectorAll<HTMLElement>('[data-llm-provider-mode="runtime"]').forEach((section) => {
    section.hidden = false;
  });

  const advancedHint = document.querySelector<HTMLElement>("#settings-advanced-hint");
  const runtimeNote = document.querySelector<HTMLElement>("#settings-runtime-note");
  const timeoutLabel = document.querySelector<HTMLElement>("#settings-timeout-label");
  if (provider === "local-cli") {
    if (advancedHint) advancedHint.textContent = "This profile is using a CLI runtime, so Hermes only exposes timeout control here. Sampling settings are hidden because CLI support is inconsistent.";
    if (runtimeNote) runtimeNote.textContent = "Controls how long Hermes waits for this profile's CLI process to finish.";
    if (timeoutLabel) timeoutLabel.textContent = "CLI Timeout (seconds)";
  } else {
    if (advancedHint) advancedHint.textContent = "These advanced settings apply only to this profile and model. They do not affect your other AI profiles.";
    if (runtimeNote) runtimeNote.textContent = "Controls how long Hermes waits for requests made through this profile.";
    if (timeoutLabel) timeoutLabel.textContent = "Request Timeout (seconds)";
  }

  const apiBaseField = document.querySelector<HTMLElement>("#settings-api-base-field");
  if (apiBaseField) apiBaseField.hidden = provider === "github-copilot";

  const githubEndpointField = document.querySelector<HTMLElement>("#settings-github-endpoint-field");
  if (githubEndpointField) githubEndpointField.hidden = provider !== "github-copilot";

  const apiKeyField = document.querySelector<HTMLElement>("#settings-api-key-field");
  if (apiKeyField) apiKeyField.hidden = false;

  const testButton = document.querySelector<HTMLButtonElement>("#settings-test-llm");
  const saveButton = document.querySelector<HTMLButtonElement>("#settings-save");
  if (testButton) testButton.textContent = "Test This Profile";
  if (saveButton) saveButton.textContent = "Save AI Profiles";

  // Populate model suggestions datalist based on selected provider
  const modelDatalist = document.querySelector<HTMLDataListElement>("#settings-model-list");
  if (modelDatalist) {
    const suggestions = LLM_MODEL_SUGGESTIONS[provider] ?? [];
    modelDatalist.innerHTML = suggestions
      .map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`)
      .join("");
  }
}

function validateLlmSettings(settings: LlmSettingsForm, intent: "save" | "test"): string | null {
  if (settings.provider === "local-cli") {
    return settings.cli_command ? null : `CLI command is required before ${intent === "save" ? "saving" : "testing"}.`;
  }
  if (settings.provider === "github-copilot" && !settings.api_key_env) {
    return `GitHub PAT environment variable is required before ${intent === "save" ? "saving" : "testing"}.`;
  }
  return settings.model ? null : `Model is required before ${intent === "save" ? "saving" : "testing"}.`;
}

function focusInitialSettingsField(): void {
  const selector = state.ui.settingsTab === "mcp" ? "#settings-new-server-name" : "#settings-llm-profile-name";
  if (!selector) return;
  document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)?.focus();
}

function syncToolRunnerState(): void {
  if (!state.tools.length) {
    state.ui.toolRunnerTool = "";
    state.ui.settingsCollapsedMcpGroups = [];
    state.ui.settingsToolExpanded = null;
    state.ui.toolRunnerResult = null;
    state.ui.toolRunnerFeedback = {
      tone: "idle",
      message: "Connect a tool first, then choose one to test.",
    };
    return;
  }

  const availableNames = new Set(state.tools.map((tool) => getToolRunnerName(tool)));
  const availableServerNames = new Set(state.tools.map((tool) => getToolServerName(tool)));
  if (state.ui.settingsCollapsedMcpGroups.some((serverName) => !availableServerNames.has(serverName))) {
    state.ui.settingsCollapsedMcpGroups = state.ui.settingsCollapsedMcpGroups.filter((serverName) => availableServerNames.has(serverName));
  }
  if (state.ui.settingsToolExpanded && !availableNames.has(state.ui.settingsToolExpanded)) {
    state.ui.settingsToolExpanded = null;
  }
  if (!availableNames.has(state.ui.toolRunnerTool)) {
    state.ui.toolRunnerTool = getToolRunnerName(state.tools[0]);
    if (shouldSeedToolRunnerArgs(state.ui.toolRunnerArgs)) {
      state.ui.toolRunnerArgs = getSuggestedToolArguments(state.ui.toolRunnerTool);
    }
  }
}

function selectToolRunnerTool(toolName: string, options: { forceSeed?: boolean } = {}): void {
  const changed = state.ui.toolRunnerTool !== toolName;
  state.ui.toolRunnerTool = toolName;

  if (options.forceSeed || changed || shouldSeedToolRunnerArgs(state.ui.toolRunnerArgs)) {
    state.ui.toolRunnerArgs = getSuggestedToolArguments(toolName);
  }

  if (changed || options.forceSeed) {
    state.ui.toolRunnerResult = null;
    state.ui.toolRunnerFeedback = {
      tone: "idle",
      message: "Review the generated fields, then run the tool to inspect the result.",
    };
  }
}

function toggleSettingsToolGroup(serverName: string): void {
  const collapsed = new Set(state.ui.settingsCollapsedMcpGroups);
  if (collapsed.has(serverName)) {
    collapsed.delete(serverName);
  } else {
    collapsed.add(serverName);
    const expandedTool = state.ui.settingsToolExpanded ? getSelectedToolDefinition(state.ui.settingsToolExpanded) : null;
    if (expandedTool && getToolServerName(expandedTool) === serverName) {
      state.ui.settingsToolExpanded = null;
    }
  }

  state.ui.settingsCollapsedMcpGroups = Array.from(collapsed);
  renderTools(state);
}

function toggleSettingsTool(toolName: string): void {
  if (state.ui.settingsToolExpanded === toolName) {
    state.ui.settingsToolExpanded = null;
    renderTools(state);
    return;
  }

  const selectedTool = getSelectedToolDefinition(toolName);
  const selectedServer = selectedTool ? getToolServerName(selectedTool) : "";
  if (selectedServer && state.ui.settingsCollapsedMcpGroups.includes(selectedServer)) {
    state.ui.settingsCollapsedMcpGroups = state.ui.settingsCollapsedMcpGroups.filter((serverName) => serverName !== selectedServer);
  }

  state.ui.settingsToolExpanded = toolName;
  selectToolRunnerTool(toolName);
  renderTools(state);
}

function getToolRunnerName(tool: any): string {
  return String(tool.qualified_name ?? tool.tool_name ?? "");
}

function getToolServerName(tool: any): string {
  return String(tool?.server_name ?? "Unassigned");
}

function getSelectedToolDefinition(toolName: string): any | undefined {
  return state.tools.find((tool) => getToolRunnerName(tool) === toolName);
}

function shouldSeedToolRunnerArgs(currentArgs: string): boolean {
  const trimmed = currentArgs.trim();
  return !trimmed || trimmed === "{}";
}

function getSuggestedToolArguments(toolName: string): string {
  const tool = getSelectedToolDefinition(toolName);
  const schema = tool?.input_schema ?? tool?.inputSchema;
  if (!schema || typeof schema !== "object") {
    return "{}";
  }

  const properties = typeof schema.properties === "object" && schema.properties ? schema.properties as Record<string, any> : {};
  const required = Array.isArray(schema.required) ? schema.required.map(String) : [];
  const sample: Record<string, unknown> = {};

  const keys = required.length ? required : Object.keys(properties).slice(0, 3);
  keys.forEach((key) => {
    sample[key] = getToolArgumentExample(properties[key]);
  });

  return JSON.stringify(sample, null, 2);
}

function getToolArgumentExample(property: any): unknown {
  if (!property || typeof property !== "object") {
    return "";
  }
  if (Array.isArray(property.enum) && property.enum.length) {
    return property.enum[0];
  }
  switch (property.type) {
    case "integer":
    case "number":
      return 0;
    case "boolean":
      return false;
    case "array":
      return [];
    case "object":
      return {};
    default:
      return "";
  }
}

async function runSelectedTool(): Promise<void> {
  syncToolRunnerState();
  if (!state.ui.toolRunnerTool) {
    state.ui.toolRunnerFeedback = {
      tone: "error",
      message: "No connected tool is available to run yet.",
    };
    renderMcpInspectorView();
    renderInspector(state);
    renderTools(state);
    return;
  }

  const sessionId = state.activeSessionId ?? "system";

  let parsedArguments: Record<string, unknown> = {};
  const rawArgs = state.ui.toolRunnerArgs.trim();
  if (rawArgs) {
    try {
      const candidate = JSON.parse(rawArgs);
      if (!candidate || Array.isArray(candidate) || typeof candidate !== "object") {
        throw new Error("Tool arguments must be a JSON object.");
      }
      parsedArguments = candidate as Record<string, unknown>;
    } catch (error) {
      state.ui.toolRunnerFeedback = {
        tone: "error",
        message: getErrorMessage(error),
      };
      state.ui.toolRunnerResult = null;
      renderMcpInspectorView();
      renderInspector(state);
      renderTools(state);
      return;
    }
  }

  const tool = getSelectedToolDefinition(state.ui.toolRunnerTool);
  const displayName = String(tool?.display_name ?? tool?.tool_name ?? state.ui.toolRunnerTool);

  state.ui.toolRunnerFeedback = {
    tone: "info",
    message: `Running ${displayName}...`,
  };
  state.ui.toolRunnerResult = null;
  renderMcpInspectorView();
  renderInspector(state);
  renderTools(state);

  try {
    const response = await requestJson<{ result: unknown }>("/api/tools/run", {
      method: "POST",
      body: JSON.stringify({
        session_id: sessionId,
        tool_name: state.ui.toolRunnerTool,
        arguments: parsedArguments,
        preferred_server: tool?.server_name ? String(tool.server_name) : undefined,
      }),
    });
    state.ui.toolRunnerResult = response.result;
    state.ui.toolRunnerFeedback = {
      tone: (response.result as any)?.is_error ? "error" : "success",
      message: (response.result as any)?.is_error ? `${displayName} returned an issue.` : `${displayName} completed.`,
    };
    setFeedback(state.ui.toolRunnerFeedback.message, state.ui.toolRunnerFeedback.tone === "error" ? "error" : "success");
  } catch (error) {
    const message = getErrorMessage(error);
    state.ui.toolRunnerResult = null;
    state.ui.toolRunnerFeedback = {
      tone: "error",
      message,
    };
    setFeedback(message, "error");
  }

  renderMcpInspectorView();
  renderInspector(state);
  renderTools(state);
}

function isSettingsToolArgumentElement(target: EventTarget | null): target is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  return (
    (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) &&
    Boolean(target.dataset.toolArgKey)
  );
}

function syncSettingsToolArgumentField(target: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): void {
  if (!state.ui.toolRunnerTool) {
    return;
  }

  const key = String(target.dataset.toolArgKey ?? "").trim();
  if (!key) {
    return;
  }

  const propertyType = String(target.dataset.toolArgType ?? "string");
  const draft = readToolArgumentDraft();
  const nextValue = coerceSettingsToolArgumentValue(target, propertyType, draft[key]);

  if (nextValue === undefined) {
    delete draft[key];
  } else {
    draft[key] = nextValue;
  }

  state.ui.toolRunnerArgs = JSON.stringify(draft, null, 2);
}

function readToolArgumentDraft(): Record<string, unknown> {
  if (!state.ui.toolRunnerArgs.trim()) {
    return {};
  }

  try {
    const candidate = JSON.parse(state.ui.toolRunnerArgs);
    if (!candidate || Array.isArray(candidate) || typeof candidate !== "object") {
      return {};
    }
    return candidate as Record<string, unknown>;
  } catch {
    return {};
  }
}

function coerceSettingsToolArgumentValue(
  target: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  propertyType: string,
  currentValue: unknown,
): unknown {
  if (target instanceof HTMLInputElement && target.type === "checkbox") {
    return target.checked;
  }

  const raw = target.value.trim();
  if (!raw) {
    return propertyType === "string" ? "" : undefined;
  }

  if (propertyType === "integer") {
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : currentValue;
  }

  if (propertyType === "number") {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : currentValue;
  }

  if (propertyType === "array" || propertyType === "object") {
    try {
      return JSON.parse(raw);
    } catch {
      return currentValue;
    }
  }

  return raw;
}

function openBenchmark(): void {
  if (!state.activeSessionId) {
    setFeedback("Open a conversation before starting a benchmark.", "error");
    return;
  }

  ensureBenchmarkProfileSelections();
  setAppMode("benchmark");
  setBenchmarkFeedback(
    "Choose one saved AI profile per side. Each side uses that profile's provider, model, and advanced settings.",
    "idle",
  );

  const sourceInput = document.querySelector<HTMLTextAreaElement>("#composer-input");
  const benchmarkComposerInput = document.querySelector<HTMLTextAreaElement>("#benchmark-composer-input");
  renderBenchmarkSplitView(state);
  if (benchmarkComposerInput && !benchmarkComposerInput.value.trim() && sourceInput?.value.trim()) {
    benchmarkComposerInput.value = sourceInput.value;
  }
  requestAnimationFrame(() => benchmarkComposerInput?.focus());
}

function closeBenchmark(): void {
  setAppMode("chat");
}

/** Scan all profiles and auto-store raw API keys in keystore. */
async function autoStoreKeysInKeystore(): Promise<void> {
  const providerKeyNames: Record<string, string> = {
    openai: "OPENAI_API_KEY",
    anthropic: "ANTHROPIC_API_KEY",
    groq: "GROQ_API_KEY",
    mistral: "MISTRAL_API_KEY",
    together: "TOGETHER_API_KEY",
    perplexity: "PERPLEXITY_API_KEY",
    openrouter: "OPENROUTER_API_KEY",
    google: "GOOGLE_API_KEY",
    cohere: "COHERE_API_KEY",
    fireworks: "FIREWORKS_API_KEY",
    deepseek: "DEEPSEEK_API_KEY",
    "github-copilot": "GITHUB_TOKEN",
    local: "LOCAL_API_KEY",
    "local-cli": "LOCAL_API_KEY",
  };

  for (const profile of settingsLlmState.profiles) {
    if (!profile.api_key_env) continue;

    const value = profile.api_key_env.trim();
    if (!value) continue;

    // Detect raw key: starts with known prefixes or contains lowercase + special chars + decent length
    const looksLikeRawKey =
      value.startsWith("sk-") ||
      value.startsWith("ghp_") ||
      value.startsWith("ghu_") ||
      value.startsWith("ghs_") ||
      value.startsWith("github_pat_") ||
      value.startsWith("key-") ||
      value.startsWith("Bearer ") ||
      value.startsWith("xai-") ||
      (value.length > 20 && /[a-z]/.test(value) && /[-/+=]/.test(value));

    if (!looksLikeRawKey) continue;

    // Determine keystore name from provider
    const provider = profile.provider ?? "openai";
    const keyName = providerKeyNames[provider] ?? `${provider.toUpperCase().replace(/-/g, "_")}_API_KEY`;

    // Store in keystore
    try {
      await requestJson("/api/keystore", {
        method: "POST",
        body: JSON.stringify({ name: keyName, value }),
      });
      // Replace raw key with reference name
      profile.api_key_env = keyName;
    } catch (err) {
      console.warn(`Failed to auto-store key for ${profile.name}:`, err);
      // Continue with the raw key — it will still work via backend's raw key detection
    }
  }
}

async function saveKeyToKeystore(): Promise<void> {
  const keyInput = document.querySelector<HTMLInputElement>("#settings-api-key-env");
  if (!keyInput) return;

  const rawValue = keyInput.value.trim();
  if (!rawValue) {
    setSettingsFeedback("Enter an API key first.", "error");
    return;
  }

  // Determine a storage name based on the current provider
  const provider = getSelectedLlmProvider();
  const providerKeyNames: Record<string, string> = {
    openai: "OPENAI_API_KEY",
    anthropic: "ANTHROPIC_API_KEY",
    groq: "GROQ_API_KEY",
    mistral: "MISTRAL_API_KEY",
    together: "TOGETHER_API_KEY",
    perplexity: "PERPLEXITY_API_KEY",
    openrouter: "OPENROUTER_API_KEY",
    google: "GOOGLE_API_KEY",
    cohere: "COHERE_API_KEY",
    fireworks: "FIREWORKS_API_KEY",
    deepseek: "DEEPSEEK_API_KEY",
    "github-copilot": "GITHUB_TOKEN",
    local: "LOCAL_API_KEY",
  };
  const keyName = providerKeyNames[provider] ?? `${provider.toUpperCase().replace(/-/g, "_")}_API_KEY`;

  try {
    await requestJson("/api/keystore", {
      method: "POST",
      body: JSON.stringify({ name: keyName, value: rawValue }),
    });
    // Replace the input with the keystore name
    keyInput.value = keyName;
    keyInput.type = "text";
    syncSelectedLlmProfileDraft(true);
    setSettingsFeedback(`Key saved securely as "${keyName}". It will be resolved from the keystore automatically.`, "success");
  } catch (err) {
    setSettingsFeedback(`Failed to save key: ${getErrorMessage(err)}`, "error");
  }
}

async function debugApiSend(): Promise<void> {
  const methodEl = document.querySelector<HTMLSelectElement>("#debug-api-method");
  const urlEl = document.querySelector<HTMLSelectElement>("#debug-api-url");
  const bodyEl = document.querySelector<HTMLTextAreaElement>("#debug-api-body");
  const responseEl = document.querySelector<HTMLElement>("#debug-api-response");
  const latencyEl = document.querySelector<HTMLElement>("#debug-api-latency");
  const statusEl = document.querySelector<HTMLElement>("#debug-api-status");

  // Parse method and URL from the endpoint selector
  const selectedEndpoint = urlEl?.value ?? "";
  const spaceIdx = selectedEndpoint.indexOf(" ");
  const method = methodEl?.value ?? (spaceIdx > 0 ? selectedEndpoint.slice(0, spaceIdx) : "POST");
  const url = spaceIdx > 0 ? selectedEndpoint.slice(spaceIdx + 1) : selectedEndpoint;
  const bodyRaw = bodyEl?.value.trim() ?? "";

  if (!url) {
    if (statusEl) { statusEl.textContent = "URL is required"; statusEl.className = "debug-api-status error"; }
    return;
  }

  if (statusEl) { statusEl.textContent = "Sending…"; statusEl.className = "debug-api-status info"; }
  if (responseEl) responseEl.textContent = "Loading…";

  const started = performance.now();
  try {
    const fetchOptions: RequestInit = { method, headers: { "Content-Type": "application/json" } };
    if (method !== "GET" && method !== "DELETE" && bodyRaw) {
      try { JSON.parse(bodyRaw); } catch {
        if (statusEl) { statusEl.textContent = "Invalid JSON body"; statusEl.className = "debug-api-status error"; }
        if (responseEl) responseEl.textContent = "Request body is not valid JSON.";
        return;
      }
      fetchOptions.body = bodyRaw;
    }

    const response = await fetch(url, fetchOptions);
    const elapsed = Math.round(performance.now() - started);
    if (latencyEl) latencyEl.textContent = `${elapsed} ms`;

    const contentType = response.headers.get("content-type") ?? "";
    let text: string;
    if (contentType.includes("json")) {
      const json = await response.json();
      text = JSON.stringify(json, null, 2);
    } else {
      text = await response.text();
    }

    if (responseEl) responseEl.textContent = text;

    if (response.ok) {
      if (statusEl) { statusEl.textContent = `${response.status} ${response.statusText}`; statusEl.className = "debug-api-status success"; }
    } else {
      if (statusEl) { statusEl.textContent = `${response.status} ${response.statusText}`; statusEl.className = "debug-api-status error"; }
    }
  } catch (err) {
    const elapsed = Math.round(performance.now() - started);
    if (latencyEl) latencyEl.textContent = `${elapsed} ms`;
    if (responseEl) responseEl.textContent = String(err);
    if (statusEl) { statusEl.textContent = "Network error"; statusEl.className = "debug-api-status error"; }
  }
}

function openBenchmarkReport(): void {
  if (!state.ui.benchmarkReport) {
    setFeedback("Run a benchmark first to open the comparison report.", "info");
    return;
  }
  state.ui.benchmarkReportOpen = true;
  renderBenchmarkReportOverlay(state);
}

function setBenchmarkFeedback(message: string, tone: FeedbackTone): void {
  state.ui.benchmarkFeedback.message = message;
  state.ui.benchmarkFeedback.tone = tone;
  const feedback = document.querySelector<HTMLElement>("#benchmark-feedback");
  if (!feedback) return;
  feedback.textContent = message;
  feedback.dataset.tone = tone;
}

async function runBenchmark(): Promise<void> {
  const benchmarkInput = document.querySelector<HTMLTextAreaElement>("#benchmark-composer-input");
  const composerInput = document.querySelector<HTMLTextAreaElement>("#composer-input");
  const input = state.ui.workspaceView === "benchmark" && benchmarkInput ? benchmarkInput : composerInput;
  if (!input || !state.activeSessionId) {
    setFeedback("Open a conversation before starting a benchmark.", "error");
    return;
  }

  const message = input.value.trim();
  const attachments = state.ui.pendingFiles.map((attachment) => ({
    name: attachment.name,
    mime_type: attachment.mimeType,
    size_bytes: attachment.size,
    content: attachment.content,
    truncated: attachment.truncated,
  }));
  const targets = buildBenchmarkTargetsFromProfiles();
  const leftProfile = getSelectedBenchmarkProfile("left");
  const rightProfile = getSelectedBenchmarkProfile("right");

  if (!message && !attachments.length) {
    setBenchmarkFeedback("Write a prompt or attach context before starting a benchmark.", "error");
    return;
  }

  if (!leftProfile || !rightProfile || targets.length < 2) {
    setBenchmarkFeedback("Choose two AI profiles before starting a benchmark.", "error");
    return;
  }

  if (leftProfile.name === rightProfile.name) {
    setBenchmarkFeedback("Choose two different AI profiles for the benchmark split view.", "error");
    return;
  }

  setBenchmarkFeedback("Creating benchmark sessions and dispatching the prompt...", "info");

  try {
    const result = await requestJson<BenchmarkRunResponse>("/api/benchmarks/run", {
      method: "POST",
      body: JSON.stringify({
        session_id: state.activeSessionId,
        message,
        attachments,
        targets,
      }),
    });

    input.value = "";
    if (benchmarkInput && benchmarkInput !== input) {
      benchmarkInput.value = "";
    }
    if (composerInput && composerInput !== input) {
      composerInput.value = "";
    }
    state.ui.composerDraft = "";
    state.ui.pendingFiles = [];
    const fileInput = document.querySelector<HTMLInputElement>("#composer-file-input");
    if (fileInput) fileInput.value = "";
    renderComposerAttachments(state);
    renderShellSummary(state);

    await refreshBootstrap(state.activeSessionId ?? undefined);
    state.ui.benchmarkReport = result.report;
    state.ui.benchmarkReportOpen = false;
    setActiveWorkspaceView("benchmark");
    render();
    setFeedback("Benchmark started. Hermes is collecting the responses.", "success");
  } catch (error) {
    const messageText = getErrorMessage(error);
    setBenchmarkFeedback(messageText, "error");
    setFeedback(messageText, "error");
  }
}

async function refreshBenchmarkReport(sessionId: string | null = getActiveBenchmarkSourceSessionId(), groupId?: string | null): Promise<void> {
  if (!sessionId) {
    state.ui.benchmarkReport = null;
    renderBenchmarkWorkspace(state);
    renderBenchmarkSplitView(state);
    renderBenchmarkReportOverlay(state);
    return;
  }

  const params = new URLSearchParams({ session_id: sessionId });
  if (groupId) {
    params.set("group_id", groupId);
  }

  try {
    state.ui.benchmarkReport = await requestJson<BenchmarkReport>(`/api/benchmarks/report?${params.toString()}`);
  } catch {
    state.ui.benchmarkReport = null;
  }

  renderBenchmarkWorkspace(state);
  renderBenchmarkSplitView(state);
  renderBenchmarkReportOverlay(state);
}

function getActiveBenchmarkSourceSessionId(): string | null {
  if (!state.activeSessionId) {
    return null;
  }

  const activeSession = state.sessions.find((session) => session.session_id === state.activeSessionId);
  if (!activeSession) {
    return null;
  }

  const metadata = (activeSession.metadata ?? {}) as Record<string, unknown>;
  if (metadata.kind === "benchmark_target" && metadata.benchmark_source_session_id) {
    return String(metadata.benchmark_source_session_id);
  }

  const hasBenchmarkChildren = state.sessions.some((session) => {
    const childMetadata = (session.metadata ?? {}) as Record<string, unknown>;
    return childMetadata.kind === "benchmark_target" && String(childMetadata.benchmark_source_session_id ?? "") === state.activeSessionId;
  });
  return hasBenchmarkChildren ? state.activeSessionId : null;
}

function setInputValue(selector: string, value: string): void {
  const el = document.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(selector);
  if (!el) return;
  el.value = value;
  // Sync range slider output element
  if (el instanceof HTMLInputElement && el.type === "range") {
    const output = document.querySelector<HTMLOutputElement>(`#${el.id}-output`);
    if (output) output.textContent = value;
  }
}

function setCheckedValue(selector: string, checked: boolean): void {
  const el = document.querySelector<HTMLInputElement>(selector);
  if (el) el.checked = checked;
}

function getInputValue(selector: string): string {
  return document.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(selector)?.value ?? "";
}

function getListInputValue(selector: string): string[] {
  return getInputValue(selector)
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function parseOptionalNumberInput(selector: string): number | undefined {
  const raw = getInputValue(selector).trim();
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseNumberInput(selector: string, fallback: number): number {
  const parsed = Number(getInputValue(selector).trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseIntegerInput(selector: string, fallback: number): number {
  const parsed = Number.parseInt(getInputValue(selector).trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function setTextContent(selector: string, value: string): void {
  const element = document.querySelector<HTMLElement>(selector);
  if (element) element.textContent = value;
}
