import type { HermesState } from "../types";
import { escapeHtml, formatJsonValue } from "../utils";

export function renderTools(state: HermesState): void {
  const hiddenList = document.querySelector<HTMLElement>("#tool-list");
  const browser = document.querySelector<HTMLElement>("#settings-tool-browser");
  const markup = buildSettingsToolBrowser(state);

  if (hiddenList) hiddenList.innerHTML = "";
  if (browser) browser.innerHTML = markup;
}

function buildSettingsToolBrowser(state: HermesState): string {
  if (!state.tools.length) {
    return `<p class="empty small-empty">No connected tools are available yet.</p>`;
  }

  const order = new Map(
    state.servers.map((server, index) => [String(server.name ?? ""), index]),
  );
  const groups = new Map<string, any[]>();

  for (const tool of state.tools) {
    const serverName = String(tool.server_name ?? "Unassigned");
    const current = groups.get(serverName) ?? [];
    current.push(tool);
    groups.set(serverName, current);
  }

  return Array.from(groups.entries())
    .sort(([left], [right]) => {
      const leftOrder = order.get(left) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = order.get(right) ?? Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder || left.localeCompare(right);
    })
    .map(([serverName, tools]) => renderToolGroup(state, serverName, tools))
    .join("");
}

function renderToolGroup(state: HermesState, serverName: string, tools: any[]): string {
  const server = state.servers.find((entry) => String(entry.name ?? "") === serverName);
  const connected = Boolean(server?.connected);
  const hasError = Boolean(server?.error);
  const expanded = !state.ui.settingsCollapsedMcpGroups.includes(serverName);
  const statusLabel = hasError ? "Error" : connected ? "Connected" : "Configured";
  const statusClass = hasError ? "error" : connected ? "ok" : "";
  const transport = server?.transport ? `<span class="tag mono">${escapeHtml(String(server.transport))}</span>` : "";
  const detail = hasError
    ? String(server?.error ?? "Connection failed.")
    : `${tools.length} tool${tools.length === 1 ? "" : "s"} available from this connection.`;
  const groupId = buildToolGroupId(serverName);

  return `
    <section class="settings-tool-group${expanded ? "" : " collapsed"}">
      <button
        type="button"
        class="settings-tool-group-header"
        data-action="toggle-settings-tool-group"
        data-server-name="${escapeHtml(serverName)}"
        aria-expanded="${expanded ? "true" : "false"}"
        aria-controls="${escapeHtml(groupId)}"
      >
        <div class="settings-tool-group-copy">
          <p class="settings-tool-group-kicker">MCP Connection</p>
          <h4>${escapeHtml(serverName)}</h4>
          <p>${escapeHtml(detail)}</p>
        </div>
        <div class="settings-tool-group-meta">
          <div class="settings-tool-group-pills">
            ${transport}
            <span class="settings-mcp-status ${statusClass}">${escapeHtml(statusLabel)}</span>
          </div>
          <span class="settings-tool-group-state">${expanded ? "Hide tools" : "Show tools"}</span>
        </div>
      </button>
      ${expanded ? `
        <div id="${escapeHtml(groupId)}" class="settings-tool-group-list">
          ${tools.map((tool) => renderToolCard(state, tool)).join("")}
        </div>
      ` : ""}
    </section>
  `;
}

function buildToolGroupId(serverName: string): string {
  const normalized = serverName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `settings-tool-group-${normalized || "server"}`;
}

function renderToolCard(state: HermesState, tool: any): string {
  const toolName = getToolName(tool);
  const expanded = state.ui.settingsToolExpanded === toolName;
  const schema = getToolSchema(tool);
  const properties = getToolProperties(schema);
  const required = getToolRequired(schema);
  const fieldCount = Object.keys(properties).length;

  return `
    <article class="settings-tool-card${expanded ? " expanded" : ""}">
      <button
        type="button"
        class="settings-tool-toggle"
        data-action="toggle-settings-tool"
        data-tool-name="${escapeHtml(toolName)}"
        aria-expanded="${expanded ? "true" : "false"}"
      >
        <div class="settings-tool-toggle-copy">
          <strong>${escapeHtml(String(tool.display_name ?? tool.tool_name ?? toolName))}</strong>
          <span class="settings-tool-toggle-meta mono">${escapeHtml(String(tool.qualified_name ?? toolName))}</span>
        </div>
        <div class="settings-tool-toggle-pills">
          <span class="tag">${fieldCount ? `${fieldCount} field${fieldCount === 1 ? "" : "s"}` : "No args"}</span>
          <span class="tag">${required.length ? `${required.length} required` : "Optional"}</span>
        </div>
      </button>
      ${expanded ? renderToolCardBody(state, tool, properties, required) : ""}
    </article>
  `;
}

function renderToolCardBody(
  state: HermesState,
  tool: any,
  properties: Record<string, any>,
  required: string[],
): string {
  const toolName = getToolName(tool);
  const draft = state.ui.toolRunnerTool === toolName
    ? parseToolDraft(state.ui.toolRunnerArgs)
    : buildToolDraft(tool);
  const feedback = state.ui.toolRunnerTool === toolName
    ? state.ui.toolRunnerFeedback
    : { tone: "idle", message: "Review the generated fields, then test the tool." };
  const result = state.ui.toolRunnerTool === toolName ? state.ui.toolRunnerResult : null;

  return `
    <div class="settings-tool-card-body">
      <p class="settings-tool-description">${escapeHtml(String(tool.description ?? "No description available yet."))}</p>
      <div class="settings-tool-schema-summary">
        <span class="tag mono">${escapeHtml(String(tool.server_name ?? "tool"))}</span>
        <span class="tag mono">${escapeHtml(String(tool.qualified_name ?? toolName))}</span>
      </div>
      <section class="settings-tool-test-card">
        <div class="settings-tool-test-header">
          <div>
            <h5>Test Tool</h5>
            <p>Hermes generated this test form from the MCP input schema.</p>
          </div>
          <button type="button" class="settings-action" data-action="run-settings-tool" data-tool-name="${escapeHtml(toolName)}">Test</button>
        </div>
        <div class="settings-tool-form">
          ${renderToolFields(toolName, properties, required, draft)}
        </div>
        <p class="settings-tool-feedback" data-tone="${escapeHtml(feedback.tone)}">${escapeHtml(feedback.message)}</p>
        ${result !== null ? `<pre class="settings-tool-result json-view">${escapeHtml(formatJsonValue(result))}</pre>` : ""}
      </section>
    </div>
  `;
}

function renderToolFields(
  toolName: string,
  properties: Record<string, any>,
  required: string[],
  draft: Record<string, unknown>,
): string {
  const entries = Object.entries(properties);
  if (!entries.length) {
    return `<p class="settings-tool-empty">This tool does not declare explicit arguments. Run a smoke test directly.</p>`;
  }

  return entries
    .map(([key, property]) => renderToolField(toolName, key, property, required.includes(key), draft[key]))
    .join("");
}

function renderToolField(
  toolName: string,
  key: string,
  property: any,
  isRequired: boolean,
  currentValue: unknown,
): string {
  const fieldType = getToolPropertyType(property);
  const fieldId = buildFieldId(toolName, key);
  const label = String(property.title ?? key);
  const description = String(property.description ?? "");
  const control = renderToolFieldControl(fieldId, toolName, key, fieldType, currentValue ?? property.default ?? getToolArgumentExample(property), property, isRequired);

  return `
    <label class="settings-tool-field" for="${escapeHtml(fieldId)}">
      <span class="settings-tool-field-header">
        <span class="settings-tool-field-label">${escapeHtml(label)}</span>
        <span class="settings-tool-field-meta">
          <span class="tag mono">${escapeHtml(fieldType)}</span>
          ${isRequired ? '<span class="tag">Required</span>' : ''}
        </span>
      </span>
      ${control}
      ${description ? `<span class="settings-tool-field-help">${escapeHtml(description)}</span>` : ""}
    </label>
  `;
}

function renderToolFieldControl(
  fieldId: string,
  toolName: string,
  key: string,
  fieldType: string,
  value: unknown,
  property: any,
  isRequired: boolean,
): string {
  const baseAttrs = `id="${escapeHtml(fieldId)}" data-tool-name="${escapeHtml(toolName)}" data-tool-arg-key="${escapeHtml(key)}" data-tool-arg-type="${escapeHtml(fieldType)}"${isRequired ? ' data-tool-arg-required="true"' : ""}`;

  if (Array.isArray(property.enum) && property.enum.length) {
    const selected = value ?? property.enum[0];
    return `
      <select ${baseAttrs}>
        ${property.enum.map((option: unknown) => {
          const optionValue = String(option);
          return `<option value="${escapeHtml(optionValue)}"${optionValue === String(selected ?? "") ? " selected" : ""}>${escapeHtml(optionValue)}</option>`;
        }).join("")}
      </select>
    `;
  }

  if (fieldType === "boolean") {
    return `
      <span class="settings-tool-checkbox">
        <input type="checkbox" ${baseAttrs}${Boolean(value) ? " checked" : ""} />
        <span>${Boolean(value) ? "Enabled" : "Disabled"}</span>
      </span>
    `;
  }

  if (fieldType === "array" || fieldType === "object") {
    return `<textarea ${baseAttrs} class="settings-code-field settings-tool-json-field" rows="4">${escapeHtml(formatComplexFieldValue(value))}</textarea>`;
  }

  if (fieldType === "integer" || fieldType === "number") {
    return `<input ${baseAttrs} type="number" step="${fieldType === "integer" ? "1" : "any"}" value="${escapeHtml(String(value ?? ""))}" />`;
  }

  return `<input ${baseAttrs} type="text" value="${escapeHtml(String(value ?? ""))}" />`;
}

function getToolName(tool: any): string {
  return String(tool.qualified_name ?? tool.tool_name ?? "");
}

function getToolSchema(tool: any): Record<string, any> {
  const schema = tool.input_schema ?? tool.inputSchema;
  return schema && typeof schema === "object" ? schema as Record<string, any> : {};
}

function getToolProperties(schema: Record<string, any>): Record<string, any> {
  return typeof schema.properties === "object" && schema.properties ? schema.properties as Record<string, any> : {};
}

function getToolRequired(schema: Record<string, any>): string[] {
  return Array.isArray(schema.required) ? schema.required.map(String) : [];
}

function buildToolDraft(tool: any): Record<string, unknown> {
  const schema = getToolSchema(tool);
  const properties = getToolProperties(schema);
  const required = getToolRequired(schema);
  const keys = required.length ? required : Object.keys(properties).slice(0, 3);
  const draft: Record<string, unknown> = {};
  keys.forEach((key) => {
    draft[key] = properties[key]?.default ?? getToolArgumentExample(properties[key]);
  });
  return draft;
}

function parseToolDraft(rawArgs: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(rawArgs);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
      return {};
    }
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

function getToolPropertyType(property: any): string {
  if (Array.isArray(property?.enum) && property.enum.length) {
    return "enum";
  }
  return String(property?.type ?? "string");
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

function formatComplexFieldValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value === undefined || value === null) {
    return "";
  }
  return formatJsonValue(value, "");
}

function buildFieldId(toolName: string, key: string): string {
  return `settings-tool-${`${toolName}-${key}`.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
}

export function renderMetrics(state: HermesState): void {
  const metrics = document.querySelector<HTMLElement>("#metrics");
  if (!metrics) return;

  const current = (state.activeSessionId && state.telemetry[state.activeSessionId]) || {};
  const hasData = current.total_tokens || current.llm_calls || current.tool_calls || current.error_count;

  if (!hasData) {
    metrics.hidden = true;
    return;
  }

  metrics.hidden = false;
  const cards: [string, number][] = [
    ["Tokens", current.total_tokens ?? 0],
    ["LLM", current.llm_calls ?? 0],
    ["Tools", current.tool_calls ?? 0],
    ["Errors", current.error_count ?? 0],
  ];

  metrics.innerHTML = cards
    .map(([label, value]) => `
      <article class="metric-card">
        <strong>${value}</strong>
        <span>${label}</span>
      </article>
    `)
    .join("");
}
