/**
 * Lab Trace Diff Viewer — side-by-side trace comparison for two experiment runs.
 *
 * Renders each run's trace as a structured event timeline and visually highlights
 * differences (event type mismatches, tool name differences, argument diffs, outcome diffs).
 */

import { API_BASE } from "../config";
import { escapeHtml } from "../utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface TraceEvent {
  seq: number;
  event_type: string;
  timestamp: string;
  payload?: Record<string, unknown>;
}

interface RunSummary {
  run_id: string;
  status: string;
  started_at?: string;
  completed_at?: string;
}

interface DiffResult {
  eventsA: AnnotatedEvent[];
  eventsB: AnnotatedEvent[];
}

interface AnnotatedEvent {
  event: TraceEvent;
  diffClass: "" | "diff-added" | "diff-removed" | "diff-changed";
}

// ─── API helpers ─────────────────────────────────────────────────────────────

async function api<T = any>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

// ─── Diff logic ──────────────────────────────────────────────────────────────

function computeDiff(eventsA: TraceEvent[], eventsB: TraceEvent[]): DiffResult {
  const maxLen = Math.max(eventsA.length, eventsB.length);
  const annotatedA: AnnotatedEvent[] = [];
  const annotatedB: AnnotatedEvent[] = [];

  for (let i = 0; i < maxLen; i++) {
    const a = eventsA[i];
    const b = eventsB[i];

    if (a && !b) {
      // Event only in A
      annotatedA.push({ event: a, diffClass: "diff-removed" });
    } else if (!a && b) {
      // Event only in B
      annotatedB.push({ event: b, diffClass: "diff-added" });
    } else if (a && b) {
      const typeMismatch = a.event_type !== b.event_type;
      const payloadDiff = hasPayloadDifference(a, b);

      if (typeMismatch || payloadDiff) {
        annotatedA.push({ event: a, diffClass: "diff-changed" });
        annotatedB.push({ event: b, diffClass: "diff-changed" });
      } else {
        annotatedA.push({ event: a, diffClass: "" });
        annotatedB.push({ event: b, diffClass: "" });
      }
    }
  }

  return { eventsA: annotatedA, eventsB: annotatedB };
}

function hasPayloadDifference(a: TraceEvent, b: TraceEvent): boolean {
  // Compare event types first
  if (a.event_type !== b.event_type) return true;

  // Compare tool names for tool call events
  if (a.event_type === "tool_call_start" || a.event_type === "tool_call_end") {
    const toolA = a.payload?.tool_name ?? a.payload?.name;
    const toolB = b.payload?.tool_name ?? b.payload?.name;
    if (toolA !== toolB) return true;
  }

  // Compare payloads
  const jsonA = JSON.stringify(a.payload ?? {});
  const jsonB = JSON.stringify(b.payload ?? {});
  return jsonA !== jsonB;
}

// ─── Rendering ───────────────────────────────────────────────────────────────

function renderTracePane(
  label: string,
  runId: string,
  status: string,
  events: AnnotatedEvent[]
): string {
  const eventsHtml = events.length
    ? events.map((ae) => renderTraceEvent(ae)).join("")
    : `<div class="lab-empty"><p class="lab-empty-title">No trace events</p></div>`;

  return `
    <div class="lab-diff-pane">
      <div class="lab-diff-pane-header">
        <span>${escapeHtml(label)}: </span>
        <span style="font-family:var(--mono);font-size:11px">${escapeHtml(runId.slice(0, 12))}…</span>
        <span class="lab-status" data-status="${escapeHtml(status)}" style="margin-left:var(--space-2)">${escapeHtml(status)}</span>
      </div>
      <div class="lab-diff-pane-body">
        <div class="lab-trace-timeline">
          ${eventsHtml}
        </div>
      </div>
    </div>`;
}

function renderTraceEvent(ae: AnnotatedEvent): string {
  const { event, diffClass } = ae;
  const classAttr = diffClass ? ` ${diffClass}` : "";
  return `
    <div class="lab-trace-event${classAttr}" data-type="${escapeHtml(event.event_type)}">
      <span class="lab-trace-seq">#${event.seq}</span>
      <span class="lab-trace-type">${escapeHtml(event.event_type)}</span>
      <span class="lab-trace-payload">${escapeHtml(formatPayload(event.payload))}</span>
    </div>`;
}

function formatPayload(payload?: Record<string, unknown>): string {
  if (!payload) return "";
  const json = JSON.stringify(payload);
  return json.length > 200 ? json.slice(0, 200) + "…" : json;
}

// ─── Run selector UI ─────────────────────────────────────────────────────────

function renderRunSelector(
  runs: RunSummary[],
  selectedA: string,
  selectedB: string
): string {
  const options = runs.map(
    (r) =>
      `<option value="${escapeHtml(r.run_id)}">${escapeHtml(r.run_id.slice(0, 12))}… (${escapeHtml(r.status)})</option>`
  ).join("");

  return `
    <div style="display:flex;gap:var(--space-4);align-items:flex-end;flex-wrap:wrap;margin-bottom:var(--space-4)">
      <div class="lab-field" style="min-width:200px">
        <label for="lab-diff-run-a">Run A</label>
        <select id="lab-diff-run-a">
          <option value="">Select run…</option>
          ${options}
        </select>
      </div>
      <div class="lab-field" style="min-width:200px">
        <label for="lab-diff-run-b">Run B</label>
        <select id="lab-diff-run-b">
          <option value="">Select run…</option>
          ${options}
        </select>
      </div>
      <button class="lab-btn primary" id="lab-diff-compare-btn">Compare</button>
      <button class="lab-btn" id="lab-diff-chat-btn" style="display:none">Open in Chat ↗</button>
    </div>`;
}

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Render a side-by-side trace diff viewer for two runs.
 * If runIdA and runIdB are provided, loads and compares immediately.
 * Otherwise, shows a run selector.
 */
export function renderLabTraceDiff(
  container: HTMLElement,
  runIdA?: string,
  runIdB?: string
): void {
  container.innerHTML = `
    <div class="lab-panel">
      <div class="lab-panel-header">
        <div>
          <h2 class="lab-panel-title">Trace Diff Viewer</h2>
          <p class="lab-panel-subtitle">Compare execution traces side by side.</p>
        </div>
        <div class="lab-actions">
          <button class="lab-btn" id="lab-diff-back-btn">← Back</button>
        </div>
      </div>
      <div id="lab-diff-feedback" class="lab-feedback" data-tone="idle"></div>
      <div id="lab-diff-selector"></div>
      <div id="lab-diff-content"></div>
    </div>
  `;

  // Load run list for selectors
  void loadDiffView(container, runIdA, runIdB);
}

async function loadDiffView(
  container: HTMLElement,
  preselectedA?: string,
  preselectedB?: string
): Promise<void> {
  const selectorEl = container.querySelector<HTMLElement>("#lab-diff-selector");
  if (!selectorEl) return;

  try {
    // Fetch all experiments to get runs
    const { experiments } = await api<{ experiments: Array<{ experiment_id: string; name: string }> }>(
      "/api/lab/experiments"
    );

    // Collect all runs across experiments
    let allRuns: RunSummary[] = [];
    for (const exp of experiments ?? []) {
      try {
        const { runs } = await api<{ runs: RunSummary[] }>(
          `/api/lab/experiments/${exp.experiment_id}/runs`
        );
        allRuns = allRuns.concat(runs ?? []);
      } catch {
        // Skip experiments with no runs
      }
    }

    if (!allRuns.length) {
      selectorEl.innerHTML = `<div class="lab-empty"><div class="lab-empty-icon">📊</div><p class="lab-empty-title">No runs available</p><p class="lab-empty-desc">Run an experiment first to compare traces.</p></div>`;
      return;
    }

    selectorEl.innerHTML = renderRunSelector(allRuns, preselectedA ?? "", preselectedB ?? "");

    // Pre-select if provided
    const selectA = container.querySelector<HTMLSelectElement>("#lab-diff-run-a");
    const selectB = container.querySelector<HTMLSelectElement>("#lab-diff-run-b");
    if (selectA && preselectedA) selectA.value = preselectedA;
    if (selectB && preselectedB) selectB.value = preselectedB;

    // Bind compare button
    container.querySelector("#lab-diff-compare-btn")?.addEventListener("click", () => {
      const a = selectA?.value;
      const b = selectB?.value;
      if (a && b && a !== b) {
        void loadAndRenderDiff(container, a, b);
      } else {
        showFeedback(container, "Please select two different runs to compare.", "error");
      }
    });

    // Auto-compare if both pre-selected
    if (preselectedA && preselectedB && preselectedA !== preselectedB) {
      void loadAndRenderDiff(container, preselectedA, preselectedB);
    }
  } catch (err) {
    selectorEl.innerHTML = `<p style="color:var(--danger)">Failed to load runs: ${escapeHtml(String(err))}</p>`;
  }
}

async function loadAndRenderDiff(
  container: HTMLElement,
  runIdA: string,
  runIdB: string
): Promise<void> {
  const contentEl = container.querySelector<HTMLElement>("#lab-diff-content");
  if (!contentEl) return;

  contentEl.innerHTML = `<p style="color:var(--text-muted)">Loading traces…</p>`;

  try {
    const [traceA, traceB, runA, runB] = await Promise.all([
      api<{ events: TraceEvent[] }>(`/api/lab/runs/${runIdA}/trace`),
      api<{ events: TraceEvent[] }>(`/api/lab/runs/${runIdB}/trace`),
      api<RunSummary>(`/api/lab/runs/${runIdA}`),
      api<RunSummary>(`/api/lab/runs/${runIdB}`),
    ]);

    const eventsA = traceA.events ?? [];
    const eventsB = traceB.events ?? [];
    const diff = computeDiff(eventsA, eventsB);

    const statusA = runA.status ?? "unknown";
    const statusB = runB.status ?? "unknown";

    contentEl.innerHTML = `
      <div class="lab-diff-container">
        ${renderTracePane("Run A", runIdA, statusA, diff.eventsA)}
        ${renderTracePane("Run B", runIdB, statusB, diff.eventsB)}
      </div>`;

    // Show and bind "Open in Chat" button
    const chatBtn = container.querySelector<HTMLElement>("#lab-diff-chat-btn");
    if (chatBtn) {
      chatBtn.style.display = "";
      chatBtn.addEventListener("click", () => {
        openTraceInChat(eventsA, runIdA);
      });
    }
  } catch (err) {
    contentEl.innerHTML = `<p style="color:var(--danger)">Failed to load traces: ${escapeHtml(String(err))}</p>`;
  }
}

// ─── Chat integration ────────────────────────────────────────────────────────

function openTraceInChat(events: TraceEvent[], runId: string): void {
  // Store trace context for the chat session to pick up
  (window as any).__hermes_trace_context = {
    run_id: runId,
    events,
  };

  // Dispatch mode switch to chat using existing app convention
  const trigger = document.createElement("button");
  trigger.dataset["action"] = "set-app-mode";
  trigger.dataset["mode"] = "chat";
  trigger.style.display = "none";
  document.body.appendChild(trigger);
  trigger.click();
  trigger.remove();

  // Also fire a custom event for any listener that wants structured notification
  window.dispatchEvent(
    new CustomEvent("hermes:trace-to-chat", {
      detail: { run_id: runId, events },
    })
  );
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function showFeedback(container: HTMLElement, message: string, tone: string): void {
  const el = container.querySelector<HTMLElement>("#lab-diff-feedback");
  if (!el) return;
  el.textContent = message;
  el.dataset["tone"] = tone;
}
