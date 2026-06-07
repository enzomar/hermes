import type { EventRecord, HermesState, TimelineDisclosure, TimelineEntry } from "../types";
import {
  buildPreview,
  compactDisclosures,
  compactText,
  escapeHtml,
  formatJsonValue,
  formatTime,
  getCacheStatusLabel,
  getDefaultStatusLabel,
  getTokenUsageLabel,
  hasDisplayValue,
} from "../utils";

export function deriveTimeline(events: EventRecord[]): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  const assistants = new Map<string, TimelineEntry>();
  const tools = new Map<string, TimelineEntry>();

  for (const event of events) {
    switch (event.event_type) {
      case "user_message": {
        const body = String(event.payload.display_content ?? event.payload.content ?? "");
        entries.push({
          kind: "user",
          id: event.event_id,
          title: "User",
          body,
          preview: buildPreview(body, 280),
          meta: [formatTime(event.timestamp)],
          state: "completed",
          timestamp: event.timestamp,
          disclosures: compactDisclosures([
            Array.isArray(event.payload.attachments) && event.payload.attachments.length
              ? { label: "Attachments", value: event.payload.attachments }
              : null,
            { label: "Raw event", value: event.payload },
          ]),
        });
        break;
      }

      case "llm_start": {
        const entry: TimelineEntry = {
          kind: "assistant",
          id: String(event.payload.call_id ?? event.event_id),
          title: "Hermes",
          body: "",
          preview: "",
          meta: compactText([formatTime(event.timestamp), String(event.payload.model ?? "model")]),
          state: "streaming",
          statusLabel: "",
          timestamp: event.timestamp,
          disclosures: compactDisclosures([{ label: "Raw event", value: event.payload }]),
        };
        assistants.set(entry.id, entry);
        entries.push(entry);
        break;
      }

      case "llm_token": {
        const entry = assistants.get(String(event.payload.call_id ?? ""));
        if (entry) {
          entry.body += String(event.payload.text ?? "");
          entry.preview = buildPreview(entry.body, 320);
        }
        break;
      }

      case "llm_end": {
        const callId = String(event.payload.call_id ?? "");
        const entry = assistants.get(callId);
        const content = String(event.payload.assistant_message?.content ?? "");
        const toolCalls = Array.isArray(event.payload.assistant_message?.tool_calls)
          ? (event.payload.assistant_message.tool_calls as unknown[])
          : [];
        const usage = event.payload.usage ?? {};
        const latencyMs = Number(event.payload.latency_ms ?? 0);
        const body = content || (toolCalls.length ? "Hermes is using connected tools to continue this task." : "Hermes completed this step without text output.");
        const meta = compactText([
          formatTime(event.timestamp),
          String(event.payload.model ?? "model"),
          latencyMs ? `${Math.round(latencyMs)} ms` : "",
          getTokenUsageLabel(usage),
        ]);
        const disclosures = compactDisclosures([
          toolCalls.length ? { label: "Tool calls", value: toolCalls } : null,
          hasDisplayValue(usage) ? { label: "Usage", value: usage } : null,
          { label: "Raw event", value: event.payload },
        ]);
        const state = toolCalls.length ? "waiting_tool" : "completed";
        const statusLabel = toolCalls.length ? "using tools" : "done";
        if (entry) {
          entry.body = entry.body || body;
          entry.preview = buildPreview(entry.body || body, 320);
          entry.meta = meta;
          entry.state = state;
          entry.statusLabel = statusLabel;
          entry.timestamp = event.timestamp;
          entry.disclosures = disclosures;
        } else if (content || toolCalls.length) {
          entries.push({
            kind: "assistant",
            id: event.event_id,
            title: "Hermes",
            body,
            preview: buildPreview(body, 320),
            meta,
            state,
            statusLabel,
            timestamp: event.timestamp,
            disclosures,
          });
        }
        break;
      }

      case "tool_call_start": {
        const requestId = String(event.payload.request_id ?? event.event_id);
        const title = String(event.payload.display_name ?? event.payload.qualified_name ?? event.payload.tool_name ?? "Tool");
        const args = event.payload.arguments ?? {};
        const entry: TimelineEntry = {
          kind: "tool",
          id: requestId,
          title,
          body: formatJsonValue(args),
          preview: buildPreview(formatJsonValue(args, `${title} is preparing work.`), 220),
          meta: compactText([formatTime(event.timestamp), String(event.payload.server_name ?? "tool")]),
          state: "waiting_tool",
          statusLabel: "working",
          timestamp: event.timestamp,
          disclosures: compactDisclosures([
            hasDisplayValue(args) ? { label: "Arguments", value: args } : null,
            { label: "Raw event", value: event.payload },
          ]),
        };
        tools.set(requestId, entry);
        entries.push(entry);
        break;
      }

      case "tool_call_end": {
        const requestId = String(event.payload.request_id ?? event.event_id);
        const entry = tools.get(requestId);
        const latencyMs = Number(event.payload.latency_ms ?? 0);
        const cacheStatus = getCacheStatusLabel(event.payload);
        const body = String(event.payload.text ?? "") || (event.payload.is_error ? "This tool run needs attention." : "This tool finished the current step.");
        const nextMeta = compactText([
          formatTime(event.timestamp),
          String(event.payload.server_name ?? "tool"),
          latencyMs ? `${Math.round(latencyMs)} ms` : "",
          cacheStatus ? `cache ${cacheStatus}` : "",
        ]);
        const disclosures = compactDisclosures([
          hasDisplayValue(event.payload.arguments) ? { label: "Arguments", value: event.payload.arguments } : null,
          hasDisplayValue(event.payload.request_json) ? { label: "Request JSON", value: event.payload.request_json } : null,
          hasDisplayValue(event.payload.response_json) ? { label: "Response JSON", value: event.payload.response_json } : null,
          hasDisplayValue(event.payload.structured_content)
            ? { label: "Structured Content", value: event.payload.structured_content }
            : null,
          { label: "Raw event", value: event.payload },
        ]);
        const statusLabel = cacheStatus === "HIT" ? "cached result" : event.payload.is_error ? "needs attention" : "done";
        if (entry) {
          entry.body = body;
          entry.preview = buildPreview(body, 240);
          entry.meta = nextMeta;
          entry.state = event.payload.is_error ? "error" : "completed";
          entry.statusLabel = statusLabel;
          entry.timestamp = event.timestamp;
          entry.disclosures = disclosures;
          entry.error = Boolean(event.payload.is_error);
          entry.inspectEventId = event.event_id;
          entry.replayEventId = event.event_id;
        } else {
          entries.push({
            kind: "tool",
            id: requestId,
            title: String(event.payload.display_name ?? event.payload.qualified_name ?? event.payload.tool_name ?? "Tool"),
            body,
            preview: buildPreview(body, 240),
            meta: nextMeta,
            state: event.payload.is_error ? "error" : "completed",
            statusLabel,
            timestamp: event.timestamp,
            disclosures,
            error: Boolean(event.payload.is_error),
            inspectEventId: event.event_id,
            replayEventId: event.event_id,
          });
        }
        break;
      }

      case "error": {
        const message = String(event.payload.message ?? "Hermes reported an error.");
        
        // Skip duplicate errors (same source + message)
        const isDuplicate = entries.some(
          (entry) =>
            entry.kind === "system" &&
            entry.body === message
        );
        
        if (isDuplicate) {
          break;
        }
        
        entries.push({
          kind: "system",
          id: event.event_id,
          title: String(event.payload.source ?? "Error"),
          body: message,
          preview: buildPreview(message, 220),
          meta: compactText([
            formatTime(event.timestamp),
          ]),
          state: "error",
          statusLabel: "",
          timestamp: event.timestamp,
          disclosures: compactDisclosures([{ label: "Raw event", value: event.payload }]),
          error: true,
          inspectEventId: event.event_id,
        });
        break;
      }
    }
  }

  return entries;
}

export function renderTimeline(state: HermesState): void {
  const timeline = document.querySelector<HTMLElement>("#timeline");
  if (!timeline) {
    return;
  }

  // Check if user is scrolled near bottom before re-rendering
  const wasAtBottom = timeline.scrollHeight - timeline.scrollTop - timeline.clientHeight < 80;

  const items = deriveTimeline(state.events);
  timeline.innerHTML = items.length
    ? items.map((item) => renderTimelineCard(item)).join("")
    : `
        <section class="timeline-empty-state">
          <h2>Start a conversation</h2>
          <p>Ask Hermes a question or give it a task. Responses will appear here.</p>
          <div class="timeline-suggestions" role="list" aria-label="Suggested tasks">
            <button type="button" class="suggestion-chip" data-action="use-suggested-prompt" data-prompt="Summarize this project and point me to the most important files.">Summarize this project</button>
            <button type="button" class="suggestion-chip" data-action="use-suggested-prompt" data-prompt="Review the current code and suggest the next highest-leverage improvement.">Review my code</button>
            <button type="button" class="suggestion-chip" data-action="use-suggested-prompt" data-prompt="Help me debug the last failing command and explain the cheapest fix.">Debug an error</button>
          </div>
        </section>
      `;

  // Auto-scroll only if user was already at bottom
  if (wasAtBottom) {
    timeline.scrollTop = timeline.scrollHeight;
    hideScrollIndicator();
  } else if (items.length) {
    showScrollIndicator();
  }
}

function showScrollIndicator(): void {
  let pill = document.querySelector<HTMLElement>("#timeline-scroll-pill");
  if (!pill) {
    const timeline = document.querySelector<HTMLElement>("#timeline");
    if (!timeline) return;
    pill = document.createElement("button");
    pill.id = "timeline-scroll-pill";
    pill.className = "timeline-scroll-pill";
    pill.textContent = "↓ New messages";
    pill.setAttribute("data-action", "scroll-timeline-bottom");
    timeline.parentElement?.appendChild(pill);
  }
  pill.hidden = false;
}

function hideScrollIndicator(): void {
  const pill = document.querySelector<HTMLElement>("#timeline-scroll-pill");
  if (pill) pill.hidden = true;
}

// Listen for user scroll to auto-hide the pill when they reach the bottom
if (typeof document !== "undefined") {
  document.addEventListener("scroll", (e) => {
    const target = e.target as HTMLElement;
    if (target?.id === "timeline" || target?.closest?.("#timeline")) {
      const timeline = document.querySelector<HTMLElement>("#timeline");
      if (!timeline) return;
      const isAtBottom = timeline.scrollHeight - timeline.scrollTop - timeline.clientHeight < 40;
      if (isAtBottom) hideScrollIndicator();
    }
  }, true);
}

export function getTimelineEntry(state: HermesState, id: string): TimelineEntry | undefined {
  return deriveTimeline(state.events).find((item) => item.id === id);
}

function renderTimelineCard(item: TimelineEntry): string {
  const contextAttrs = item.inspectEventId
    ? ` data-context="trace" data-event-id="${escapeHtml(item.inspectEventId)}"`
    : "";
  const detailsContent = renderTimelineDisclosures(item.disclosures);
  const status = item.statusLabel ?? getDefaultStatusLabel(item.state);

  if (item.kind === "tool") {
    return `
      <article class="message-row tool-row"${contextAttrs}>
        <div class="tool-activity">
          <div class="tool-activity-header">
            <div>
              <span class="tool-prefix">Tool</span>
              <strong>${escapeHtml(item.title)}</strong>
            </div>
            <span class="state-pill" data-state="${escapeHtml(item.state)}">${escapeHtml(status)}</span>
          </div>
          <div class="tool-meta-row">${item.meta.map((meta) => `<span class="meta-chip">${escapeHtml(meta)}</span>`).join("")}</div>
          <p class="tool-activity-preview">${escapeHtml(item.preview || item.body || "Tool activity available.")}</p>
          ${renderTimelineActions(item)}
          ${detailsContent ? `<details class="inline-disclosure"><summary>Details</summary>${detailsContent}</details>` : ""}
        </div>
      </article>
    `;
  }

  // Streaming state with no content yet: show minimal typing indicator
  if (item.kind === "assistant" && item.state === "streaming" && !item.body) {
    return `
      <article class="message-row align-start"${contextAttrs}>
        <div class="typing-indicator">
          <span class="typing-dot"></span>
          <span class="typing-dot"></span>
          <span class="typing-dot"></span>
        </div>
      </article>
    `;
  }

  // Error/system messages: compact single-line
  if (item.kind === "system") {
    return `
      <article class="message-row align-start"${contextAttrs}>
        <div class="message-bubble system">
          <div class="message-body">${escapeHtml(item.body || item.preview || "")}</div>
          ${detailsContent ? `<details class="inline-disclosure"><summary>Details</summary>${detailsContent}</details>` : ""}
        </div>
      </article>
    `;
  }

  // User and assistant messages: clean chat bubbles
  return `
    <article class="message-row ${item.kind === "user" ? "align-end" : "align-start"}"${contextAttrs}>
      <div class="message-bubble ${item.kind}">
        <div class="message-body">${escapeHtml(item.body || item.preview || "")}</div>
        <div class="message-footer">
          <div class="message-meta">${item.meta.map((meta) => `<span>${escapeHtml(meta)}</span>`).join("")}</div>
          <div class="message-actions">
            <button type="button" class="inline-action" data-action="copy-timeline-entry" data-timeline-id="${escapeHtml(item.id)}">Copy</button>
            ${item.kind === "user" ? `<button type="button" class="inline-action" data-action="retry-timeline-entry" data-timeline-id="${escapeHtml(item.id)}">Retry</button>` : ""}
          </div>
        </div>
      </div>
    </article>
  `;
}

function renderTimelineActions(item: TimelineEntry): string {
  const actions = compactText([
    `<button type="button" class="inline-action" data-action="copy-timeline-entry" data-timeline-id="${escapeHtml(item.id)}">Copy</button>`,
    item.kind === "user" || Boolean(item.replayEventId)
      ? `<button type="button" class="inline-action" data-action="retry-timeline-entry" data-timeline-id="${escapeHtml(item.id)}">${item.kind === "tool" ? "Try again" : "Retry"}</button>`
      : "",
    item.inspectEventId
      ? `<button type="button" class="inline-action" data-action="select-inspector" data-event-id="${escapeHtml(item.inspectEventId)}">Details</button>`
      : "",
    item.inspectEventId
      ? `<button type="button" class="inline-action" data-action="branch-session" data-event-id="${escapeHtml(item.inspectEventId)}">Explore alternative</button>`
      : "",
  ]);

  return actions.length ? `<div class="message-actions">${actions.join("")}</div>` : "";
}

function renderTimelineDisclosures(disclosures: TimelineDisclosure[]): string {
  const visible = disclosures.filter((disclosure) => hasDisplayValue(disclosure.value));
  if (!visible.length) {
    return "";
  }

  return `
    <div class="detail-grid">
      ${visible
        .map(
          (disclosure) => `
            <section class="detail-card">
              <div class="payload-heading"><strong>${escapeHtml(disclosure.label)}</strong></div>
              <pre class="detail-json">${escapeHtml(formatJsonValue(disclosure.value))}</pre>
            </section>
          `,
        )
        .join("")}
    </div>
  `;
}

function getTimelineKindLabel(kind: TimelineEntry["kind"]): string {
  switch (kind) {
    case "user":
      return "You";
    case "assistant":
      return "Hermes";
    case "tool":
      return "Tool";
    case "system":
      return "System";
  }
}