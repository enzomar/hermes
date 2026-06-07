import type { EventRecord, HermesState, MessageState } from "../types";
import { buildPreview, escapeHtml, formatJsonValue, formatTime, getDefaultStatusLabel, hasDisplayValue } from "../utils";

type DebugActorKind = "user" | "llm" | "tool" | "system";

type DebugActor = {
  id: string;
  label: string;
  kind: DebugActorKind;
  subtitle: string;
};

type DebugStep = {
  id: string;
  anchorId: string;
  actorId: string;
  actorIndex: number;
  actorKind: DebugActorKind;
  title: string;
  summary: string;
  detail: string;
  timestamp: string;
  state: MessageState;
  status: string;
  meta: string[];
  sequence: number;
  fromActorIndex: number | null;
};

type DebugTraceModel = {
  actors: DebugActor[];
  steps: DebugStep[];
  sessionTitle: string;
};

export function renderDebugTimeline(state: HermesState): void {
  const container = document.querySelector<HTMLElement>("#debug-timeline-content");
  if (!container) {
    return;
  }

  const trace = buildDebugTraceModel(state);
  if (!trace) {
    container.innerHTML = renderDebugEmptyState(state);
    return;
  }

  const { actors, steps, sessionTitle } = trace;
  const metric = state.activeSessionId ? state.telemetry[state.activeSessionId] ?? {} : {};
  const firstTimestamp = steps[0]?.timestamp ?? "";
  const lastTimestamp = steps.at(-1)?.timestamp ?? "";
  const llmActors = actors.filter((actor) => actor.kind === "llm").length;
  const toolActors = actors.filter((actor) => actor.kind === "tool").length;
  const duration = getDurationLabel(firstTimestamp, lastTimestamp);
  const actorCount = Math.max(actors.length, 1);
  const actorStyle = `--debug-actor-count: ${actorCount};`;

  container.innerHTML = `
    <div class="debug-trace-shell">
      <section class="debug-trace-hero">
        <div class="debug-trace-hero-copy">
          <p class="timeline-empty-kicker">Execution trace</p>
          <h2>${escapeHtml(sessionTitle)}</h2>
          <p>Follow the vertical sequence to inspect who acted, when they acted, and how work moved between the user, model lanes, and tool lanes.</p>
        </div>
        <div class="debug-trace-kpis">
          ${renderKpiCard("Actors", String(actors.length), `${llmActors} LLM lane${llmActors === 1 ? "" : "s"} and ${toolActors} tool lane${toolActors === 1 ? "" : "s"}.`)}
          ${renderKpiCard("Steps", String(steps.length), duration || "Single-step trace.")}
          ${renderKpiCard("LLM Calls", String(Number(metric.llm_calls ?? 0)), Number(metric.llm_calls ?? 0) ? `${Math.round(Number(metric.avg_llm_latency_ms ?? 0))} ms avg latency.` : "No model calls yet.")}
          ${renderKpiCard("Tool Calls", String(Number(metric.tool_calls ?? 0)), Number(metric.error_count ?? 0) ? `${Number(metric.error_count)} run${Number(metric.error_count) === 1 ? "" : "s"} need attention.` : "No tool errors in this trace.")}
        </div>
      </section>

      <div class="debug-trace-layout">
        <section class="debug-trace-stage">
          <header class="debug-actors-header" style="${actorStyle}">
            <div class="debug-actors-grid">
              ${actors.map((actor) => renderActorChip(actor)).join("")}
            </div>
          </header>

          <div class="debug-sequence-list">
            ${steps.map((step, index) => renderDebugStepRow(step, actors[step.actorIndex], actorCount, actorStyle, index === steps.length - 1)).join("")}
          </div>
        </section>

        <aside class="debug-trace-nav" aria-label="Trace navigation">
          <div class="debug-trace-nav-sticky">
            <p class="timeline-empty-kicker">Navigate</p>
            <h3>Jump to a step</h3>
            <div class="debug-trace-nav-list">
              ${steps.map((step) => renderDebugNavItem(step, actors[step.actorIndex])).join("")}
            </div>
          </div>
        </aside>
      </div>
    </div>
  `;
}

export function buildDebugTimelineExport(state: HermesState): string {
  const trace = buildDebugTraceModel(state);
  if (!trace) {
    return "# Debug Trace\n\nNo active trace is available.";
  }

  const actorLines = trace.actors
    .map((actor) => `- ${actor.label} (${actor.subtitle})`)
    .join("\n");

  const stepLines = trace.steps
    .map((step) => {
      const actor = trace.actors[step.actorIndex];
      const meta = step.meta.length ? ` | ${step.meta.join(" | ")}` : "";
      return `${step.sequence}. ${formatTime(step.timestamp)} | ${actor.label} | ${step.title}${meta}\n   ${step.summary || step.detail || step.status}`;
    })
    .join("\n\n");

  return [
    `# Debug Trace: ${trace.sessionTitle}`,
    "## Actors",
    actorLines,
    "## Steps",
    stepLines,
  ].join("\n\n");
}

function buildDebugTraceModel(state: HermesState): DebugTraceModel | null {
  const events = getActiveSessionEvents(state);
  if (!events.length) {
    return null;
  }

  const actors: DebugActor[] = [];
  const actorIndex = new Map<string, number>();
  const steps: DebugStep[] = [];

  const ensureActor = (id: string, label: string, kind: DebugActorKind, subtitle: string): number => {
    const existing = actorIndex.get(id);
    if (existing !== undefined) {
      return existing;
    }

    const nextIndex = actors.length;
    actors.push({ id, label, kind, subtitle });
    actorIndex.set(id, nextIndex);
    return nextIndex;
  };

  const pushStep = (config: {
    id: string;
    actorId: string;
    actorLabel: string;
    actorKind: DebugActorKind;
    actorSubtitle: string;
    title: string;
    summary: string;
    detail: string;
    timestamp: string;
    state: MessageState;
    status?: string;
    meta?: string[];
  }): void => {
    const lane = ensureActor(config.actorId, config.actorLabel, config.actorKind, config.actorSubtitle);
    const previousStep = steps.at(-1);
    const sequence = steps.length + 1;
    const anchorId = `debug-step-${sequence}-${config.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

    steps.push({
      id: config.id,
      anchorId,
      actorId: config.actorId,
      actorIndex: lane,
      actorKind: config.actorKind,
      title: config.title,
      summary: config.summary,
      detail: config.detail,
      timestamp: config.timestamp,
      state: config.state,
      status: config.status ?? getDefaultStatusLabel(config.state),
      meta: config.meta ?? [],
      sequence,
      fromActorIndex: previousStep ? previousStep.actorIndex : null,
    });
  };

  for (const event of events) {
    switch (event.event_type) {
      case "user_message": {
        const body = String(event.payload.display_content ?? event.payload.content ?? "").trim();
        pushStep({
          id: event.event_id,
          actorId: "user:session",
          actorLabel: "User",
          actorKind: "user",
          actorSubtitle: "Prompt source",
          title: "Prompt sent",
          summary: buildPreview(body, 180) || "User input sent to Hermes.",
          detail: body || "User input sent to Hermes.",
          timestamp: event.timestamp,
          state: "completed",
          status: "sent",
          meta: [formatTime(event.timestamp)],
        });
        break;
      }

      case "llm_start": {
        const model = String(event.payload.model ?? "Hermes");
        const callId = String(event.payload.call_id ?? event.event_id);
        pushStep({
          id: event.event_id,
          actorId: `llm:${model}`,
          actorLabel: model,
          actorKind: "llm",
          actorSubtitle: "LLM",
          title: "Model started",
          summary: `Started reasoning for call ${shortId(callId)}.`,
          detail: formatJsonValue(event.payload, "Model call started."),
          timestamp: event.timestamp,
          state: "streaming",
          status: "thinking",
          meta: compactMeta([formatTime(event.timestamp), `Call ${shortId(callId)}`]),
        });
        break;
      }

      case "llm_end": {
        const model = String(event.payload.model ?? "Hermes");
        const content = String(event.payload.assistant_message?.content ?? "").trim();
        const toolCalls = Array.isArray(event.payload.assistant_message?.tool_calls)
          ? (event.payload.assistant_message.tool_calls as unknown[])
          : [];
        const usage = Number(event.payload.usage?.total_tokens ?? 0);
        const latencyMs = Number(event.payload.latency_ms ?? 0);
        const summary = content
          ? buildPreview(content, 180)
          : toolCalls.length
            ? `Requested ${toolCalls.length} tool call${toolCalls.length === 1 ? "" : "s"}.`
            : "Completed without text output.";
        pushStep({
          id: event.event_id,
          actorId: `llm:${model}`,
          actorLabel: model,
          actorKind: "llm",
          actorSubtitle: "LLM",
          title: toolCalls.length ? "Model handed off to tools" : "Model responded",
          summary,
          detail: content || formatJsonValue(toolCalls, "Model completed."),
          timestamp: event.timestamp,
          state: toolCalls.length ? "waiting_tool" : "completed",
          status: toolCalls.length ? "using tools" : "done",
          meta: compactMeta([
            formatTime(event.timestamp),
            latencyMs ? `${Math.round(latencyMs)} ms` : "",
            usage ? `${usage} tok` : "",
          ]),
        });
        break;
      }

      case "tool_call_start": {
        const toolName = String(event.payload.display_name ?? event.payload.qualified_name ?? event.payload.tool_name ?? "Tool");
        const serverName = String(event.payload.server_name ?? "tool runtime");
        const requestId = String(event.payload.request_id ?? event.event_id);
        const args = event.payload.arguments;
        const detail = formatJsonValue(args, "Tool run started.");
        pushStep({
          id: event.event_id,
          actorId: `tool:${toolName}`,
          actorLabel: toolName,
          actorKind: "tool",
          actorSubtitle: serverName,
          title: "Tool invoked",
          summary: buildPreview(detail, 180) || "Tool run started.",
          detail,
          timestamp: event.timestamp,
          state: "waiting_tool",
          status: "running",
          meta: compactMeta([formatTime(event.timestamp), `Req ${shortId(requestId)}`]),
        });
        break;
      }

      case "tool_call_end": {
        const toolName = String(event.payload.display_name ?? event.payload.qualified_name ?? event.payload.tool_name ?? "Tool");
        const serverName = String(event.payload.server_name ?? "tool runtime");
        const responseText = String(event.payload.text ?? "").trim();
        const fallback = hasDisplayValue(event.payload.structured_content)
          ? formatJsonValue(event.payload.structured_content)
          : hasDisplayValue(event.payload.response_json)
            ? formatJsonValue(event.payload.response_json)
            : event.payload.is_error
              ? "Tool run failed."
              : "Tool run completed.";
        const detail = responseText || fallback;
        const latencyMs = Number(event.payload.latency_ms ?? 0);
        pushStep({
          id: event.event_id,
          actorId: `tool:${toolName}`,
          actorLabel: toolName,
          actorKind: "tool",
          actorSubtitle: serverName,
          title: event.payload.is_error ? "Tool failed" : "Tool returned",
          summary: buildPreview(detail, 180),
          detail,
          timestamp: event.timestamp,
          state: event.payload.is_error ? "error" : "completed",
          status: event.payload.is_error ? "failed" : "done",
          meta: compactMeta([formatTime(event.timestamp), latencyMs ? `${Math.round(latencyMs)} ms` : ""]),
        });
        break;
      }

      case "error": {
        const toolName = String(event.payload.tool_name ?? event.payload.display_name ?? "").trim();
        const model = String(event.payload.model ?? "").trim();
        const source = String(event.payload.source ?? "System").trim();
        const actorKind: DebugActorKind = toolName ? "tool" : model ? "llm" : "system";
        const actorLabel = toolName || model || source || "System";
        const actorId = `${actorKind}:${actorLabel}`;
        const message = String(event.payload.message ?? "Hermes reported an error.").trim();
        pushStep({
          id: event.event_id,
          actorId,
          actorLabel,
          actorKind,
          actorSubtitle: actorKind === "tool" ? String(event.payload.server_name ?? "tool runtime") : actorKind === "llm" ? "LLM" : "System",
          title: "Error reported",
          summary: buildPreview(message, 180),
          detail: message,
          timestamp: event.timestamp,
          state: "error",
          status: "needs attention",
          meta: compactMeta([formatTime(event.timestamp), source && source !== actorLabel ? source : ""]),
        });
        break;
      }

      default: {
        if (!event.event_type.startsWith("mcp_")) {
          break;
        }

        const detail = formatJsonValue(event.payload, `${event.event_type} completed.`);
        pushStep({
          id: event.event_id,
          actorId: "system:mcp-runtime",
          actorLabel: "MCP Runtime",
          actorKind: "system",
          actorSubtitle: "System",
          title: event.event_type.replaceAll("_", " "),
          summary: buildPreview(detail, 180),
          detail,
          timestamp: event.timestamp,
          state: "completed",
          status: "recorded",
          meta: compactMeta([formatTime(event.timestamp)]),
        });
      }
    }
  }

  if (!steps.length) {
    return null;
  }

  const session = state.sessions.find((entry) => entry.session_id === state.activeSessionId);
  return {
    actors,
    steps,
    sessionTitle: String(session?.title ?? "Active trace"),
  };
}

function getActiveSessionEvents(state: HermesState): EventRecord[] {
  if (!state.activeSessionId) {
    return [];
  }
  // Try exact session_id match first
  const sessionEvents = [...state.events]
    .filter((event) => event.session_id === state.activeSessionId)
    .sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime());

  if (sessionEvents.length) {
    return sessionEvents;
  }

  // Fallback: if the session has no events yet (e.g. freshly selected), return all unscoped events
  // This handles the case where events might not have a session_id assigned
  const unscoped = [...state.events]
    .filter((event) => !event.session_id)
    .sort((left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime());

  return unscoped;
}

function renderDebugEmptyState(state: HermesState): string {
  if (!state.sessions.length) {
    return `
      <section class="timeline-empty-state debug-empty-state">
        <p class="timeline-empty-kicker">No trace yet</p>
        <h2>Open or create a conversation to inspect its execution trace.</h2>
        <p>The debug view turns the active session into a vertical execution sequence with dedicated lanes for the user, model calls, and tools.</p>
        <div class="empty-state-actions">
          <button type="button" class="header-button" data-action="create-session">New conversation</button>
          <button type="button" class="header-button" data-action="set-app-mode" data-mode="chat">Open chat mode</button>
        </div>
      </section>
    `;
  }

  if (state.activeSessionId) {
    const session = state.sessions.find((s) => s.session_id === state.activeSessionId);
    const title = session?.title ?? "Selected session";
    return `
      <section class="timeline-empty-state debug-empty-state">
        <p class="timeline-empty-kicker">No trace events</p>
        <h2>${escapeHtml(title)}</h2>
        <p>This session hasn't recorded any events yet. Send a message in this session to generate trace data, then return here to inspect the execution flow.</p>
        <div class="empty-state-actions">
          <button type="button" class="header-button" data-action="set-app-mode" data-mode="chat">Switch to chat</button>
        </div>
      </section>
    `;
  }

  return `
    <section class="timeline-empty-state debug-empty-state">
      <p class="timeline-empty-kicker">Select a run</p>
      <h2>Choose a session from the timeline sidebar to inspect its trace.</h2>
      <p>${escapeHtml(state.sessions.length === 1 ? "There is 1 saved session available." : `There are ${state.sessions.length} saved sessions available.`)}</p>
    </section>
  `;
}

function renderKpiCard(label: string, value: string, detail: string): string {
  return `
    <article class="debug-kpi-card">
      <span class="debug-kpi-label">${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <p>${escapeHtml(detail)}</p>
    </article>
  `;
}

function renderActorChip(actor: DebugActor): string {
  return `
    <article class="debug-actor-chip" data-kind="${escapeHtml(actor.kind)}">
      <span class="debug-actor-kind">${escapeHtml(actor.subtitle)}</span>
      <strong>${escapeHtml(actor.label)}</strong>
    </article>
  `;
}

function renderDebugStepRow(step: DebugStep, actor: DebugActor, actorCount: number, actorStyle: string, latest: boolean): string {
  const lanes = Array.from({ length: actorCount });
  const bridge = renderDebugStepBridge(step);

  return `
    <section id="${escapeHtml(step.anchorId)}" class="debug-step-row">
      <button type="button" class="debug-step-marker${latest ? " latest" : ""}" data-action="jump-debug-step" data-timeline-id="${escapeHtml(step.anchorId)}">
        <span class="debug-step-marker-seq">${escapeHtml(String(step.sequence))}</span>
        <span class="debug-step-marker-time">${escapeHtml(formatTime(step.timestamp))}</span>
      </button>
      <div class="debug-step-grid" style="${actorStyle}">
        ${lanes.map((_, index) => `<span class="debug-step-lane${index === step.actorIndex ? " active" : ""}" style="grid-column: ${index + 1};" aria-hidden="true"></span>`).join("")}
        ${bridge}
        <article class="debug-step-card" data-context="trace" data-event-id="${escapeHtml(step.id)}" data-kind="${escapeHtml(step.actorKind)}" data-state="${escapeHtml(step.state)}" style="grid-column: ${step.actorIndex + 1};" tabindex="-1">
          <div class="debug-step-card-header">
            <div>
              <span class="debug-step-seq">Step ${escapeHtml(String(step.sequence))}</span>
              <div class="debug-step-title-row">
                <strong>${escapeHtml(step.title)}</strong>
                <span class="state-pill" data-state="${escapeHtml(step.state)}">${escapeHtml(step.status)}</span>
              </div>
            </div>
            <span class="tag mono">${escapeHtml(actor.label)}</span>
          </div>
          <p class="debug-step-summary">${escapeHtml(step.summary || step.detail || step.status)}</p>
          ${step.meta.length ? `<div class="debug-step-meta">${step.meta.map((value) => `<span class="meta-chip">${escapeHtml(value)}</span>`).join("")}</div>` : ""}
          ${step.detail && step.detail !== step.summary ? `<details class="inline-disclosure debug-step-disclosure"><summary>Details</summary><pre>${escapeHtml(step.detail)}</pre></details>` : ""}
        </article>
      </div>
    </section>
  `;
}

function renderDebugStepBridge(step: DebugStep): string {
  if (step.fromActorIndex === null || step.fromActorIndex === step.actorIndex) {
    return "";
  }

  const start = Math.min(step.fromActorIndex, step.actorIndex) + 1;
  const end = Math.max(step.fromActorIndex, step.actorIndex) + 2;
  const direction = step.fromActorIndex < step.actorIndex ? "forward" : "backward";
  return `<span class="debug-step-link ${direction}" style="grid-column: ${start} / ${end};" aria-hidden="true"></span>`;
}

function renderDebugNavItem(step: DebugStep, actor: DebugActor): string {
  return `
    <button type="button" class="debug-trace-nav-item" data-action="jump-debug-step" data-timeline-id="${escapeHtml(step.anchorId)}">
      <span class="debug-trace-nav-seq">${escapeHtml(String(step.sequence))}</span>
      <span class="debug-trace-nav-copy">
        <strong>${escapeHtml(step.title)}</strong>
        <span>${escapeHtml(`${actor.label} | ${formatTime(step.timestamp)}`)}</span>
      </span>
    </button>
  `;
}

function compactMeta(values: Array<string | null | undefined>): string[] {
  return values.filter((value): value is string => Boolean(value));
}

function getDurationLabel(start: string, end: string): string {
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return "";
  }

  const durationMs = endMs - startMs;
  if (durationMs < 1000) {
    return `${durationMs} ms span.`;
  }
  if (durationMs < 60000) {
    return `${(durationMs / 1000).toFixed(1)} s span.`;
  }
  return `${(durationMs / 60000).toFixed(1)} min span.`;
}

function shortId(value: string): string {
  return value.slice(0, 8);
}