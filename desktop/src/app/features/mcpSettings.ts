/**
 * MCP Settings — server CRUD, transport toggle, list/form rendering.
 *
 * Extracted from app.ts. Depends on app-level functions injected via initMcpSettings().
 */

import type { FeedbackTone, HermesState } from "../types";
import { escapeHtml } from "../utils";
import { settingsConfigSnapshot, setSettingsConfigSnapshot } from "./settingsState";

// ─── Dependency injection ────────────────────────────────────────────────────

interface McpSettingsDeps {
  getState(): HermesState;
  requestJson<T = unknown>(path: string, init?: RequestInit): Promise<T>;
  refreshBootstrap(sessionId?: string): Promise<void>;
  runWithFeedback(start: string, success: string, work: () => Promise<void>): Promise<void>;
  setFeedback(message: string, tone: FeedbackTone): void;
  setSettingsFeedback(message: string, tone: FeedbackTone): void;
  populateSettings(): Promise<void>;
  openMcpSettings(): void;
  render(): void;
  getInputValue(selector: string): string;
  setInputValue(selector: string, value: string): void;
}

let deps: McpSettingsDeps;

export function initMcpSettings(d: McpSettingsDeps): void {
  deps = d;
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function renderSettingsMetricCard(label: string, value: string, detail: string): string {
  return `
    <article class="settings-overview-card settings-overview-card-compact">
      <span class="settings-overview-label">${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <p>${escapeHtml(detail)}</p>
    </article>
  `;
}

export function getMcpConnectionTarget(serverConfig: any): string {
  if (!serverConfig) {
    return "";
  }

  if (serverConfig.transport === "stdio") {
    return [serverConfig.command, ...(Array.isArray(serverConfig.args) ? serverConfig.args : [])].filter(Boolean).join(" ");
  }

  return String(serverConfig.url ?? serverConfig.endpoint ?? "");
}

export function getMcpConnectionStatus(server: any): { label: string; tone: string; detail: string } {
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

export function renderMcpConnectionCard(server: any): string {
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

// ─── Public API ──────────────────────────────────────────────────────────────

export function handleTransportToggle(): void {
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

export function renderSettingsMcpList(config: any): void {
  const state = deps.getState();
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

export function renderSettingsMcpFormState(config: any): void {
  const state = deps.getState();
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

export function clearMcpServerForm(): void {
  const state = deps.getState();
  state.ui.settingsEditingServerName = null;
  deps.setInputValue("#settings-new-server-name", "");
  deps.setInputValue("#settings-new-server-transport", "stdio");
  deps.setInputValue("#settings-new-server-command", "");
  deps.setInputValue("#settings-new-server-args", "");
  deps.setInputValue("#settings-new-server-cwd", "");
  deps.setInputValue("#settings-new-server-url", "");
  deps.setInputValue("#settings-new-server-streamable-url", "");
  deps.setInputValue("#settings-new-server-timeout", "30");
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

export async function addMcpServer(): Promise<void> {
  const state = deps.getState();
  const name = deps.getInputValue("#settings-new-server-name").trim();
  const transport = deps.getInputValue("#settings-new-server-transport");
  const editingServerName = state.ui.settingsEditingServerName;
  const config = editingServerName ? await deps.requestJson<any>("/api/config") : null;
  const existingServerConfig = editingServerName ? config?.mcp_servers?.[editingServerName] : null;

  if (!name) {
    deps.setSettingsFeedback("Connection name is required.", "error");
    return;
  }

  if (editingServerName && !existingServerConfig) {
    deps.setSettingsFeedback(`Connection "${editingServerName}" could not be loaded for editing.`, "error");
    return;
  }

  const timeout = Number(deps.getInputValue("#settings-new-server-timeout") || "30") || 30;

  const serverConfig: any = {
    transport: transport === "streamable-http" ? "sse" : transport,  // Backend treats streamable-http as sse variant
    enabled: existingServerConfig?.enabled !== false,
    timeout_seconds: timeout,
  };

  if (transport === "stdio") {
    const command = deps.getInputValue("#settings-new-server-command").trim();
    const argsStr = deps.getInputValue("#settings-new-server-args").trim();
    const cwd = deps.getInputValue("#settings-new-server-cwd").trim();
    const envText = (document.querySelector<HTMLTextAreaElement>("#settings-new-server-env")?.value ?? "").trim();

    if (!command) {
      deps.setSettingsFeedback("Command is required for STDIO transport.", "error");
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
    const url = deps.getInputValue("#settings-new-server-url").trim();
    const headersText = (document.querySelector<HTMLTextAreaElement>("#settings-new-server-headers")?.value ?? "").trim();

    if (!url) {
      deps.setSettingsFeedback("URL is required for SSE transport.", "error");
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
    const url = deps.getInputValue("#settings-new-server-streamable-url").trim();
    const headersText = (document.querySelector<HTMLTextAreaElement>("#settings-new-server-streamable-headers")?.value ?? "").trim();

    if (!url) {
      deps.setSettingsFeedback("URL is required for Streamable HTTP transport.", "error");
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

  await deps.runWithFeedback(startMessage, successMessage, async () => {
    await deps.requestJson(endpoint, {
      method,
      body: JSON.stringify(editingServerName ? serverConfig : { name, ...serverConfig }),
    });
    await deps.requestJson("/api/mcp/refresh", { method: "POST" });
    await deps.refreshBootstrap(state.activeSessionId ?? undefined);
  });

  clearMcpServerForm();
  await deps.refreshBootstrap(state.activeSessionId ?? undefined);
  await deps.populateSettings();
}

export async function deleteMcpServer(serverName: string): Promise<void> {
  const state = deps.getState();
  const confirmed = window.confirm(`Delete MCP server "${serverName}"? This will remove it from your configuration.`);
  if (!confirmed) return;

  await deps.runWithFeedback("Deleting connection...", `Connection "${serverName}" deleted.`, async () => {
    await deps.requestJson(`/api/config/mcp-server/${encodeURIComponent(serverName)}`, {
      method: "DELETE",
    });
    await deps.requestJson("/api/mcp/refresh", { method: "POST" });
    await deps.refreshBootstrap(state.activeSessionId ?? undefined);
  });

  if (state.ui.settingsEditingServerName === serverName) {
    clearMcpServerForm();
  }
  await deps.populateSettings();
  deps.render();
}

export async function toggleMcpServer(serverName: string): Promise<void> {
  const state = deps.getState();
  // Get current config
  const config = await deps.requestJson<any>("/api/config");
  const serverConfig = config.mcp_servers?.[serverName];
  if (!serverConfig) {
    deps.setFeedback(`Server "${serverName}" not found.`, "error");
    return;
  }

  const newEnabled = !serverConfig.enabled;
  const action = newEnabled ? "enabled" : "disabled";

  await deps.runWithFeedback(`${newEnabled ? "Enabling" : "Disabling"} connection...`, `Connection "${serverName}" ${action}.`, async () => {
    await deps.requestJson(`/api/config/mcp-server/${encodeURIComponent(serverName)}`, {
      method: "PATCH",
      body: JSON.stringify({ enabled: newEnabled }),
    });
    await deps.requestJson("/api/mcp/refresh", { method: "POST" });
    await deps.refreshBootstrap(state.activeSessionId ?? undefined);
  });

  await deps.populateSettings();
  deps.render();
}

export async function editMcpServer(serverName: string): Promise<void> {
  const state = deps.getState();
  // Get current config
  const config = await deps.requestJson<any>("/api/config");
  const serverConfig = config.mcp_servers?.[serverName];
  if (!serverConfig) {
    deps.setFeedback(`Server "${serverName}" not found.`, "error");
    return;
  }

  setSettingsConfigSnapshot(config ?? {});
  state.ui.settingsEditingServerName = serverName;

  deps.openMcpSettings();

  // Pre-fill the form with current values
  deps.setInputValue("#settings-new-server-name", serverName);
  deps.setInputValue("#settings-new-server-transport", serverConfig.transport || "stdio");
  deps.setInputValue("#settings-new-server-timeout", String(serverConfig.timeout_seconds ?? 30));

  if (serverConfig.transport === "stdio") {
    deps.setInputValue("#settings-new-server-command", serverConfig.command || "");
    deps.setInputValue("#settings-new-server-args", (serverConfig.args || []).join(" "));
    deps.setInputValue("#settings-new-server-cwd", serverConfig.cwd || "");
    const envEl = document.querySelector<HTMLTextAreaElement>("#settings-new-server-env");
    if (envEl) {
      envEl.value = Object.entries(serverConfig.env || {}).map(([k, v]) => `${k}=${v}`).join("\n");
    }
  } else {
    deps.setInputValue("#settings-new-server-url", serverConfig.url || "");
    const headersEl = document.querySelector<HTMLTextAreaElement>("#settings-new-server-headers");
    if (headersEl) {
      headersEl.value = Object.entries(serverConfig.headers || {}).map(([k, v]) => `${k}: ${v}`).join("\n");
    }
    // Also fill streamable HTTP fields (same data)
    deps.setInputValue("#settings-new-server-streamable-url", serverConfig.url || "");
    const streamHeadersEl = document.querySelector<HTMLTextAreaElement>("#settings-new-server-streamable-headers");
    if (streamHeadersEl) {
      streamHeadersEl.value = Object.entries(serverConfig.headers || {}).map(([k, v]) => `${k}: ${v}`).join("\n");
    }
  }

  handleTransportToggle();
  renderSettingsMcpList(settingsConfigSnapshot);
  renderSettingsMcpFormState(config);

  deps.setSettingsFeedback(`Editing "${serverName}".`, "info");
}
