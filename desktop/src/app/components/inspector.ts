import type { ConsoleEntry, EventRecord, HermesState, InspectorEntry } from "../types";
import {
  buildPreview,
  compactText,
  escapeHtml,
  formatJsonValue,
  formatTime,
  getCacheStatusLabel,
  getConsoleState,
  renderTag,
} from "../utils";

export function renderInspector(state: HermesState): void {
  const content = document.querySelector<HTMLElement>("#inspector-content");
  if (!content) {
    return;
  }

  const tabButtons = document.querySelectorAll<HTMLButtonElement>(".inspector-tab");
  tabButtons.forEach((button) => {
    const active = button.dataset.inspectorTab === state.ui.inspectorTab;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });

  if (!state.ui.inspectorOpen) {
    content.innerHTML = "";
    return;
  }

  const entries = state.inspector.slice(-25).reverse();
  if (!state.selectedInspectorId && entries.length) {
    state.selectedInspectorId = entries[0].event_id;
  }
  const selected = state.inspector.find((entry) => entry.event_id === state.selectedInspectorId);
  const toolEntries = entries.filter((entry) => ["tool_call_start", "tool_call_end", "mcp_request", "mcp_response"].includes(entry.event_type));

  switch (state.ui.inspectorTab) {
    case "trace":
      content.innerHTML = `
        <section class="inspector-section">
          <div class="inspector-summary-block">
            <h3>${escapeHtml(selected ? String(selected.event_type) : "No activity selected")}</h3>
            <p>${escapeHtml(selected ? summarizeInspectorEntry(selected) : "Select a tool result or issue to inspect the underlying activity details.")}</p>
            <div class="inspector-summary-tags">${selected ? renderInspectorSummary(selected) : ""}</div>
          </div>
          ${renderInspectorMetrics(state)}
        </section>
        <section class="inspector-section">
          <div class="inspector-section-header">
            <strong>Recent activity</strong>
            <button type="button" class="inline-action" data-action="replay-step">Step Through</button>
          </div>
          <div class="trace-list">${renderInspectorEntryList(entries, state.selectedInspectorId, "No activity yet.")}</div>
        </section>
        <section class="inspector-section">
          <div class="inspector-section-header">
            <strong>Playback</strong>
            <button type="button" class="inline-action" data-action="replay-reset">Clear</button>
          </div>
          <div id="replay-list" class="replay-list"></div>
        </section>
      `;
      return;

    case "tools":
      content.innerHTML = `
        <section class="inspector-section">
          <div class="inspector-summary-block">
            <h3>Tool activity</h3>
            <p>Tool calls stay lightweight in chat. Open this tab when you need the deeper execution trail.</p>
            ${renderToolSummaryMetrics(toolEntries)}
          </div>
        </section>
        ${renderManualToolRunner(state)}
        <section class="inspector-section">
          <div class="trace-list">${renderEnhancedToolList(toolEntries, state.selectedInspectorId, state)}</div>
        </section>
      `;
      return;

    case "servers":
      content.innerHTML = `
        <section class="inspector-section">
          <div class="inspector-summary-block">
            <h3>Connected tools</h3>
            <p>Monitor connection health, availability, and the tools Hermes can use right now.</p>
            ${renderServerSummaryMetrics(state)}
            <div class="inspector-summary-actions">
              <button type="button" class="inline-action" data-action="open-mcp-settings">Manage in Settings</button>
            </div>
          </div>
        </section>
        <section class="inspector-section">
          <div class="server-health-list">${renderServerHealthCards(state)}</div>
        </section>
      `;
      return;

    case "payload":
      content.innerHTML = `
        <section class="inspector-section">
          <div class="inspector-summary-block">
            <h3>${escapeHtml(selected ? String(selected.tool_name ?? selected.event_type) : "No payload selected")}</h3>
            <p>${escapeHtml(selected ? summarizeInspectorEntry(selected) : "Select an activity entry to inspect request and response payloads.")}</p>
            <div class="inspector-summary-tags">${selected ? renderInspectorSummary(selected) : ""}</div>
          </div>
        </section>
        ${renderEnhancedPayloadView(selected, state)}
        <section class="inspector-section">
          <details class="inline-disclosure inspector-disclosure">
            <summary>Raw Event JSON</summary>
            <pre id="json-view" class="json-view">${escapeHtml(selected ? JSON.stringify(selected, null, 2) : "Select an activity entry to inspect its raw event envelope.")}</pre>
          </details>
        </section>
      `;
      return;

    case "logs":
      content.innerHTML = `
        <section class="inspector-section">
          <div class="inspector-section-header">
            <strong>Logs</strong>
            <span id="console-hint" class="inspector-help"></span>
          </div>
          <div class="console-tabs" role="tablist" aria-label="Console views">
            <button type="button" class="console-tab" data-action="set-console-view" data-console-view="events" role="tab" aria-selected="${state.ui.consoleView === "events" ? "true" : "false"}">Activity</button>
            <button type="button" class="console-tab" data-action="set-console-view" data-console-view="tools" role="tab" aria-selected="${state.ui.consoleView === "tools" ? "true" : "false"}">Tools</button>
            <button type="button" class="console-tab" data-action="set-console-view" data-console-view="errors" role="tab" aria-selected="${state.ui.consoleView === "errors" ? "true" : "false"}">Issues</button>
          </div>
          <div id="console-list" class="console-list" role="log" aria-live="polite"></div>
        </section>
      `;
      return;
  }
}

function renderInspectorMetrics(state: HermesState): string {
  if (!state.activeSessionId) {
    return "";
  }

  const metric = state.telemetry[state.activeSessionId] ?? {};
  const cards: Array<[string, string]> = [
    ["Tokens", Number(metric.total_tokens ?? 0).toLocaleString()],
    ["LLM Calls", String(Number(metric.llm_calls ?? 0))],
    ["Tool Calls", String(Number(metric.tool_calls ?? 0))],
    ["Errors", String(Number(metric.error_count ?? 0))],
  ];

  if (!cards.some(([, value]) => value !== "0" && value !== "0.0")) {
    return "";
  }

  return `
    <div class="inspector-metrics-grid">
      ${cards.map(([label, value]) => `
        <article class="inspector-metric-card">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
        </article>
      `).join("")}
    </div>
  `;
}

export function renderManualToolRunner(state: HermesState): string {
  const selectedTool = state.tools.find((tool) => String(tool.qualified_name ?? tool.tool_name ?? "") === state.ui.toolRunnerTool);
  const feedback = state.ui.toolRunnerFeedback;

  if (!state.tools.length) {
    return `
      <section class="inspector-section">
        <div class="inspector-summary-block">
          <h3>Run a tool manually</h3>
          <p>Connect a tool first, then test it directly here without running a full AI turn.</p>
        </div>
        <p class="inspector-empty">No connected tools are available yet.</p>
      </section>
    `;
  }

  return `
    <section class="inspector-section">
      <div class="inspector-summary-block">
        <h3>Run a tool manually</h3>
        <p>Test a connected tool directly when you want a quick result or need to verify a connection before using it in chat.</p>
      </div>
      <div class="tool-runner-card">
        <div class="tool-runner-grid">
          <label class="tool-runner-field">
            <span>Tool</span>
            <select id="tool-runner-tool" class="tool-runner-select">
              ${state.tools
                .map((tool) => {
                  const value = String(tool.qualified_name ?? tool.tool_name ?? "");
                  const label = `${String(tool.display_name ?? tool.tool_name ?? value)} • ${String(tool.server_name ?? "tool")}`;
                  return `<option value="${escapeHtml(value)}"${value === state.ui.toolRunnerTool ? " selected" : ""}>${escapeHtml(label)}</option>`;
                })
                .join("")}
            </select>
          </label>
          <label class="tool-runner-field">
            <span>Arguments (JSON)</span>
            <textarea id="tool-runner-args" class="tool-runner-editor">${escapeHtml(state.ui.toolRunnerArgs)}</textarea>
          </label>
        </div>
        <div class="tool-runner-actions">
          <p class="tool-runner-hint">${escapeHtml(String(selectedTool?.description ?? "Provide a JSON object that matches the selected tool schema."))}</p>
          <button type="button" class="header-button" data-action="run-tool">Run Tool</button>
        </div>
        <p class="tool-runner-feedback" data-tone="${escapeHtml(feedback.tone)}">${escapeHtml(feedback.message)}</p>
        ${state.ui.toolRunnerResult !== null ? `<pre class="tool-runner-result json-view">${escapeHtml(formatJsonValue(state.ui.toolRunnerResult))}</pre>` : ""}
      </div>
    </section>
  `;
}

export function renderReplay(state: HermesState): void {
  const list = document.querySelector<HTMLElement>("#replay-list");
  if (!list) {
    return;
  }

  list.innerHTML = state.replayFrames.length
    ? state.replayFrames
        .map(
          (event) => `
            <article class="trace-card">
              <div class="trace-card-main">
                <div>
                  <strong>${escapeHtml(event.event_type)}</strong>
                  <p class="mono">${escapeHtml(JSON.stringify(event.payload, null, 2))}</p>
                </div>
              </div>
            </article>
          `,
        )
        .join("")
    : `<p class="empty">Use Step to replay events one frame at a time.</p>`;
}

export function renderConsole(state: HermesState): void {
  const list = document.querySelector<HTMLElement>("#console-list");
  const hint = document.querySelector<HTMLElement>("#console-hint");
  if (!list || !hint) {
    return;
  }

  const entries = getConsoleEntries(state);
  hint.textContent = getConsoleHint(state, entries.length);

  document.querySelectorAll<HTMLButtonElement>(".console-tab").forEach((button) => {
    const active = button.dataset.consoleView === state.ui.consoleView;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });

  list.innerHTML = entries.length
    ? entries.map((entry) => renderConsoleEntry(entry)).join("")
    : `<p class="empty small-empty">No activity entries for this view yet.</p>`;
}

function getConsoleEntries(state: HermesState): ConsoleEntry[] {
  const sourceEvents = state.activeSessionId
    ? state.events.filter((event) => event.session_id === state.activeSessionId)
    : state.events;

  const visibleEvents = sourceEvents.filter((event) => {
    if (state.ui.consoleView === "tools") {
      return ["tool_call_start", "tool_call_end", "mcp_request", "mcp_response"].includes(event.event_type);
    }
    if (state.ui.consoleView === "errors") {
      return event.event_type === "error" || Boolean(event.payload.is_error);
    }
    return true;
  });

  return visibleEvents.slice(-40).reverse().map((event) => {
    const cacheStatus = getCacheStatusLabel(event.payload);
    const status = cacheStatus === "HIT" ? "cached" : getConsoleStatus(event);
    return {
      id: event.event_id,
      title: getConsoleTitle(event),
      summary: summarizeEvent(event),
      timestamp: event.timestamp,
      status,
      meta: compactText([
        event.event_type,
        event.payload.server_name ? String(event.payload.server_name) : "",
        event.payload.request_id ? String(event.payload.request_id).slice(0, 8) : "",
        cacheStatus ? `cache ${cacheStatus}` : "",
      ]),
      error: status === "failed",
      inspectEventId: isInspectableEvent(event) ? event.event_id : undefined,
      replayEventId: event.event_type === "tool_call_end" ? event.event_id : undefined,
    };
  });
}

function renderConsoleEntry(entry: ConsoleEntry): string {
  return `
    <article class="console-entry${entry.error ? " error" : ""}">
      <div class="console-entry-header">
        <div class="console-entry-title">
          <strong>${escapeHtml(entry.title)}</strong>
          <span class="console-entry-time mono">${escapeHtml(formatTime(entry.timestamp))}</span>
        </div>
        <span class="state-pill" data-state="${escapeHtml(getConsoleState(entry.status))}">${escapeHtml(entry.status)}</span>
      </div>
      <p>${escapeHtml(entry.summary)}</p>
      <div class="console-entry-actions">
        ${entry.meta.map((meta) => renderTag(meta)).join("")}
        ${entry.inspectEventId ? `<button type="button" class="inline-action" data-action="select-inspector" data-event-id="${escapeHtml(entry.inspectEventId)}">Details</button>` : ""}
        ${entry.replayEventId ? `<button type="button" class="inline-action" data-action="replay-tool" data-event-id="${escapeHtml(entry.replayEventId)}">Try Again</button>` : ""}
      </div>
    </article>
  `;
}

function renderInspectorEntryList(entries: InspectorEntry[], selectedInspectorId: string | null, emptyMessage: string): string {
  if (!entries.length) {
    return `<p class="inspector-empty">${escapeHtml(emptyMessage)}</p>`;
  }

  return entries
    .map((entry) => {
      const active = entry.event_id === selectedInspectorId ? " active" : "";
      return `
        <article class="trace-card${active}" data-context="inspector" data-event-id="${escapeHtml(entry.event_id)}">
          <div class="trace-card-main">
            <div>
              <strong>${escapeHtml(String(entry.tool_name ?? entry.event_type))}</strong>
              <p>${escapeHtml(summarizeInspectorEntry(entry))}</p>
            </div>
            <span class="trace-card-time mono">${escapeHtml(formatTime(entry.timestamp))}</span>
          </div>
          <div class="trace-card-actions">
            <button type="button" class="inline-action" data-action="select-inspector" data-event-id="${escapeHtml(entry.event_id)}">Details</button>
            ${entry.event_type === "tool_call_end" ? `<button type="button" class="inline-action" data-action="replay-tool" data-event-id="${escapeHtml(entry.event_id)}">Try Again</button>` : ""}
            <button type="button" class="inline-action" data-action="branch-session" data-event-id="${escapeHtml(entry.event_id)}">Alternative</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function summarizeInspectorEntry(entry: InspectorEntry): string {
  return buildPreview(
    String(entry.message ?? entry.text ?? entry.tool_name ?? entry.request_id ?? entry.server_name ?? entry.event_type),
    120,
  );
}

function renderInspectorSummary(entry: InspectorEntry): string {
  const tags = compactText([
    entry.event_type,
    entry.server_name ? String(entry.server_name) : "",
    entry.tool_name ? String(entry.tool_name) : "",
    entry.request_id ? `req ${String(entry.request_id).slice(0, 8)}` : "",
    entry.latency_ms ? `${Math.round(Number(entry.latency_ms))} ms` : "",
    entry.is_error ? "error" : "",
    getCacheStatusLabel(entry) ? `cache ${getCacheStatusLabel(entry)}` : "",
  ]);

  return tags.length ? tags.map((tag) => renderTag(tag)).join("") : `<p class="empty small-empty">Select an activity entry to inspect its request and response envelope.</p>`;
}

function getInspectorRequestValue(entry?: InspectorEntry): unknown {
  if (!entry) {
    return null;
  }
  return entry.request_json ?? entry.arguments ?? null;
}

function getInspectorResponseValue(entry?: InspectorEntry): unknown {
  if (!entry) {
    return null;
  }
  return entry.response_json ?? entry.structured_content ?? entry.error ?? null;
}

function getConsoleHint(state: HermesState, count: number): string {
  if (state.ui.consoleView === "tools") {
    return `${count} tool events are visible. Open payloads only when needed.`;
  }
  if (state.ui.consoleView === "errors") {
    return count
      ? `${count} issues are visible. Keep problems clear without turning the chat into a dashboard.`
      : "No issues in the current session. Problems will surface here when they happen.";
  }
  return `${count} recent activity entries are visible. Logs stay secondary to the conversation.`;
}

function getConsoleTitle(event: EventRecord): string {
  switch (event.event_type) {
    case "user_message":
      return "User message";
    case "llm_start":
      return "Model call started";
    case "llm_end":
      return "Model call completed";
    case "tool_call_start":
    case "tool_call_end":
      return String(event.payload.display_name ?? event.payload.qualified_name ?? event.payload.tool_name ?? "Tool call");
    case "mcp_request":
      return "Tool bridge request";
    case "mcp_response":
      return "Tool bridge response";
    case "error":
      return String(event.payload.source ?? "Issue");
    default:
      return event.event_type;
  }
}

function summarizeEvent(event: EventRecord): string {
  switch (event.event_type) {
    case "user_message":
      return buildPreview(String(event.payload.display_content ?? event.payload.content ?? ""), 140);
    case "llm_start":
      return `Model ${String(event.payload.model ?? "unknown")} started with ${Number(event.payload.tool_count ?? 0)} tool definitions.`;
    case "llm_end": {
      const content = String(event.payload.assistant_message?.content ?? "");
      return content ? buildPreview(content, 160) : "The AI completed this step and handed off work to connected tools.";
    }
    case "tool_call_start":
      return buildPreview(formatJsonValue(event.payload.arguments, "Preparing tool input."), 160);
    case "tool_call_end":
      return buildPreview(String(event.payload.text ?? "Tool execution finished."), 160);
    case "mcp_request":
      return buildPreview(formatJsonValue(event.payload.request_json, "Outgoing tool bridge request."), 160);
    case "mcp_response":
      return buildPreview(formatJsonValue(event.payload.response_json, "Incoming tool bridge response."), 160);
    case "error":
      return buildPreview(String(event.payload.message ?? "Hermes reported an issue."), 160);
    default:
      return buildPreview(formatJsonValue(event.payload), 160);
  }
}

function getConsoleStatus(event: EventRecord): string {
  if (event.event_type === "error" || Boolean(event.payload.is_error)) {
    return "failed";
  }
  if (["llm_start", "tool_call_start"].includes(event.event_type)) {
    return "running";
  }
  return "completed";
}

function isInspectableEvent(event: EventRecord): boolean {
  return ["mcp_request", "mcp_response", "tool_call_end", "error"].includes(event.event_type);
}

function renderToolSummaryMetrics(toolEntries: InspectorEntry[]): string {
  if (!toolEntries.length) {
    return "";
  }

  const completed = toolEntries.filter((e) => e.event_type === "tool_call_end").length;
  const errors = toolEntries.filter((e) => e.is_error).length;
  const avgLatency = toolEntries
    .filter((e) => e.latency_ms)
    .reduce((sum, e) => sum + Number(e.latency_ms ?? 0), 0) / (completed || 1);
  const cached = toolEntries.filter((e) => getCacheStatusLabel(e) === "HIT").length;

  return `
    <div class="inspector-metrics-grid" style="margin-top: 1rem;">
      <article class="inspector-metric-card">
        <span>Total Calls</span>
        <strong>${toolEntries.length}</strong>
      </article>
      <article class="inspector-metric-card">
        <span>Completed</span>
        <strong>${completed}</strong>
      </article>
      <article class="inspector-metric-card">
        <span>Errors</span>
        <strong class="${errors > 0 ? 'error-text' : ''}">${errors}</strong>
      </article>
      <article class="inspector-metric-card">
        <span>Avg Latency</span>
        <strong>${Math.round(avgLatency)} ms</strong>
      </article>
      <article class="inspector-metric-card">
        <span>Cached</span>
        <strong>${cached}</strong>
      </article>
    </div>
  `;
}

function renderEnhancedToolList(entries: InspectorEntry[], selectedInspectorId: string | null, state: HermesState): string {
  if (!entries.length) {
    return `<p class="inspector-empty">No tool activity has been recorded yet.</p>`;
  }

  return entries
    .map((entry) => {
      const active = entry.event_id === selectedInspectorId ? " active" : "";
      const toolDef = state.tools.find((t) =>
        t.tool_name === entry.tool_name ||
        t.qualified_name === entry.tool_name ||
        t.display_name === entry.tool_name
      );

      const cacheStatus = getCacheStatusLabel(entry);
      const latency = entry.latency_ms ? `${Math.round(Number(entry.latency_ms))} ms` : "";
      const errorClass = entry.is_error ? " error-border" : "";

      return `
        <article class="trace-card enhanced-tool-card${active}${errorClass}" data-context="inspector" data-event-id="${escapeHtml(entry.event_id)}">
          <div class="trace-card-main">
            <div class="tool-card-header">
              <div>
                <strong>${escapeHtml(String(entry.tool_name ?? entry.event_type))}</strong>
                ${toolDef?.description ? `<p class="tool-description">${escapeHtml(String(toolDef.description))}</p>` : ""}
                <p class="tool-summary">${escapeHtml(summarizeInspectorEntry(entry))}</p>
              </div>
              <div class="tool-card-meta">
                <span class="trace-card-time mono">${escapeHtml(formatTime(entry.timestamp))}</span>
                ${latency ? `<span class="tag">${escapeHtml(latency)}</span>` : ""}
                ${cacheStatus ? renderTag(`cache ${cacheStatus}`) : ""}
                ${entry.is_error ? renderTag("error") : ""}
              </div>
            </div>
            ${renderToolParameters(entry, toolDef)}
          </div>
          <div class="trace-card-actions">
            <button type="button" class="inline-action" data-action="select-inspector" data-event-id="${escapeHtml(entry.event_id)}">Details</button>
            ${entry.event_type === "tool_call_end" ? `<button type="button" class="inline-action" data-action="replay-tool" data-event-id="${escapeHtml(entry.event_id)}">Try Again</button>` : ""}
            <button type="button" class="inline-action" data-action="branch-session" data-event-id="${escapeHtml(entry.event_id)}">Alternative</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderToolParameters(entry: InspectorEntry, toolDef?: any): string {
  const args = entry.arguments ?? entry.request_json?.params?.arguments;
  if (!args || typeof args !== "object" || Object.keys(args).length === 0) {
    return "";
  }

  const params = Object.entries(args as Record<string, unknown>)
    .slice(0, 5)
    .map(([key, value]) => {
      const valueStr = typeof value === "string"
        ? value.length > 60 ? `${value.slice(0, 60)}...` : value
        : JSON.stringify(value);
      return `
        <div class="tool-param-row">
          <span class="tool-param-key mono">${escapeHtml(key)}</span>
          <span class="tool-param-value mono">${escapeHtml(String(valueStr))}</span>
        </div>
      `;
    })
    .join("");

  return `
    <details class="tool-params-disclosure">
      <summary>Parameters (${Object.keys(args).length})</summary>
      <div class="tool-params-list">${params}</div>
    </details>
  `;
}

function renderEnhancedPayloadView(selected: InspectorEntry | undefined, state: HermesState): string {
  if (!selected) {
    return `
      <section class="inspector-section">
        <p class="inspector-empty">Select an activity entry to inspect request and response payloads.</p>
      </section>
    `;
  }

  const toolDef = state.tools.find((t) =>
    t.tool_name === selected.tool_name ||
    t.qualified_name === selected.tool_name ||
    t.display_name === selected.tool_name
  );

  const requestValue = getInspectorRequestValue(selected);
  const responseValue = getInspectorResponseValue(selected);

  return `
    <section class="inspector-section">
      ${toolDef ? renderToolSchema(toolDef) : ""}
    </section>
    <section class="inspector-section payload-grid">
      <article class="payload-card">
        <div class="payload-heading">
          <strong>Request</strong>
          <span>Input payload</span>
        </div>
        <pre id="inspector-request-view" class="json-view">${escapeHtml(formatJsonValue(requestValue, "No request payload available."))}</pre>
        ${renderPayloadMetadata(selected, "request")}
      </article>
      <article class="payload-card">
        <div class="payload-heading">
          <strong>Response</strong>
          <span>Output payload ${selected.is_error ? '(Error)' : ''}</span>
        </div>
        <pre id="inspector-response-view" class="json-view ${selected.is_error ? 'error-content' : ''}">${escapeHtml(formatJsonValue(responseValue, "No response payload available."))}</pre>
        ${renderPayloadMetadata(selected, "response")}
      </article>
    </section>
  `;
}

function renderToolSchema(toolDef: any): string {
  const schema = toolDef.input_schema ?? toolDef.inputSchema;
  if (!schema || !schema.properties) {
    return "";
  }

  const props = Object.entries(schema.properties as Record<string, any>).map(([name, prop]) => {
    const required = Array.isArray(schema.required) && schema.required.includes(name);
    return `
      <div class="schema-param">
        <div class="schema-param-header">
          <span class="schema-param-name mono">${escapeHtml(name)}</span>
          <span class="tag ${required ? '' : 'optional-tag'}">${required ? 'required' : 'optional'}</span>
          ${prop.type ? `<span class="tag mono">${escapeHtml(String(prop.type))}</span>` : ""}
        </div>
        ${prop.description ? `<p class="schema-param-desc">${escapeHtml(String(prop.description))}</p>` : ""}
      </div>
    `;
  }).join("");

  return `
    <details class="inline-disclosure inspector-disclosure" open>
      <summary>Tool Schema</summary>
      <div class="schema-params-list">${props}</div>
    </details>
  `;
}

function renderPayloadMetadata(entry: InspectorEntry, type: "request" | "response"): string {
  const metadata: string[] = [];

  if (type === "request") {
    if (entry.server_name) metadata.push(`Server: ${String(entry.server_name)}`);
    if (entry.request_id) metadata.push(`Request ID: ${String(entry.request_id).slice(0, 12)}`);
  } else {
    if (entry.latency_ms) metadata.push(`Latency: ${Math.round(Number(entry.latency_ms))} ms`);
    const cacheStatus = getCacheStatusLabel(entry);
    if (cacheStatus) metadata.push(`Cache: ${cacheStatus}`);
    if (entry.is_error) metadata.push("Status: Error");
  }

  if (!metadata.length) return "";

  return `
    <div class="payload-metadata">
      ${metadata.map((m) => `<span class="tag mono">${escapeHtml(m)}</span>`).join("")}
    </div>
  `;
}

function renderServerSummaryMetrics(state: HermesState): string {
  if (!state.servers.length) {
    return "";
  }

  const connected = state.servers.filter((s) => s.connected).length;
  const totalTools = state.tools.length;
  const errors = state.servers.filter((s) => s.error).length;

  return `
    <div class="inspector-metrics-grid" style="margin-top: 1rem;">
      <article class="inspector-metric-card">
        <span>Total Connections</span>
        <strong>${state.servers.length}</strong>
      </article>
      <article class="inspector-metric-card">
        <span>Connected</span>
        <strong class="${connected === state.servers.length ? 'success-text' : ''}">${connected}</strong>
      </article>
      <article class="inspector-metric-card">
        <span>Available Tools</span>
        <strong>${totalTools}</strong>
      </article>
      <article class="inspector-metric-card">
        <span>Errors</span>
        <strong class="${errors > 0 ? 'error-text' : ''}">${errors}</strong>
      </article>
    </div>
  `;
}

function renderServerHealthCards(state: HermesState): string {
  if (!state.servers.length) {
    return `<p class="inspector-empty">No connected tools are configured. Add them in Settings → Connected Tools.</p>`;
  }

  return state.servers.map((server: any) => {
    const connected = Boolean(server.connected);
    const hasError = Boolean(server.error);
    const toolCount = Number(server.tool_count ?? 0);
    const serverTools = state.tools.filter((t) => t.server_name === server.name);
    const statusClass = hasError ? "error" : connected ? "success" : "idle";
    const statusLabel = hasError ? "Error" : connected ? "Connected" : "Disconnected";

    return `
      <article class="server-health-card ${statusClass}-border">
        <div class="server-health-header">
          <div>
            <strong class="server-name">${escapeHtml(String(server.name))}</strong>
            <span class="state-pill" data-state="${statusClass}">${statusLabel}</span>
          </div>
          <div class="server-health-meta">
            ${server.transport ? `<span class="tag mono">${escapeHtml(String(server.transport))}</span>` : ""}
            ${toolCount > 0 ? `<span class="tag">${toolCount} tool${toolCount === 1 ? "" : "s"}</span>` : ""}
          </div>
        </div>
        ${hasError ? `
          <div class="server-error-message">
            <span class="tag error">${escapeHtml(String(server.error))}</span>
          </div>
        ` : ""}
        ${connected && serverTools.length > 0 ? `
          <details class="server-tools-disclosure">
            <summary>Available Tools (${serverTools.length})</summary>
            <div class="server-tools-list">
              ${serverTools.map((tool) => `
                <div class="server-tool-item">
                  <span class="tool-name mono">${escapeHtml(String(tool.display_name ?? tool.tool_name))}</span>
                  <span class="tool-desc">${escapeHtml(String(tool.description ?? "").slice(0, 80))}</span>
                </div>
              `).join("")}
            </div>
          </details>
        ` : ""}
        ${server.command || server.url ? `
          <div class="server-config">
            ${server.command ? `<span class="tag mono small">$ ${escapeHtml(String(server.command))}</span>` : ""}
            ${server.url ? `<span class="tag mono small">${escapeHtml(String(server.url))}</span>` : ""}
          </div>
        ` : ""}
      </article>
    `;
  }).join("");
}