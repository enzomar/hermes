/**
 * Lab Run Monitor — Status grid for experiment runs + single-run trace timeline.
 */

import { API_BASE, WS_URL } from "../config";
import { escapeHtml } from "../utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface RunSummary {
  run_id: string;
  status: string;
  started_at?: string;
  completed_at?: string;
  model_config_id?: string;
  mcp_version_id?: string;
  workflow_config_id?: string;
  task_id?: string;
}

interface TraceEvent {
  seq: number;
  event_type: string;
  timestamp: string;
  payload?: Record<string, unknown>;
}

// ─── API helpers ─────────────────────────────────────────────────────────────

async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

// ─── WebSocket subscription ──────────────────────────────────────────────────

interface LabRunProgress {
  experiment_id: string;
  completed: number;
  in_progress: number;
  failed: number;
  pending: number;
}

/**
 * Subscribe to real-time lab_run_progress events over the shared WebSocket.
 * Returns a cleanup function that closes the connection.
 */
function subscribeToLabProgress(
  experimentId: string,
  onProgress: (data: LabRunProgress) => void,
): () => void {
  const ws = new WebSocket(WS_URL);

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (
        msg.type === "event" &&
        msg.payload?.event_type === "lab_run_progress"
      ) {
        const progress: LabRunProgress = msg.payload.payload;
        if (progress.experiment_id === experimentId) {
          onProgress(progress);
        }
      }
    } catch {
      // Ignore parse errors from non-lab messages
    }
  };

  ws.onerror = () => {
    // Silently handle connection errors — the UI still works via manual refresh
  };

  return () => {
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close();
    }
  };
}

// ─── State ───────────────────────────────────────────────────────────────────

let viewingRunId: string | null = null;
let activeProgressCleanup: (() => void) | null = null;

// ─── Main render ─────────────────────────────────────────────────────────────

export function renderLabRunMonitor(container: HTMLElement, experimentId: string): void {
  // Clean up any previous WebSocket subscription
  if (activeProgressCleanup) {
    activeProgressCleanup();
    activeProgressCleanup = null;
  }

  if (viewingRunId) {
    void renderRunTrace(container, experimentId, viewingRunId);
  } else {
    void renderRunGrid(container, experimentId);
  }
}

// ─── Run status grid ─────────────────────────────────────────────────────────

async function renderRunGrid(container: HTMLElement, experimentId: string): Promise<void> {
  container.innerHTML = `
    <div class="lab-panel">
      <div class="lab-panel-header">
        <div>
          <h2 class="lab-panel-title">Run Monitor</h2>
          <p class="lab-panel-subtitle">Status grid for experiment ${escapeHtml(experimentId.slice(0, 8))}…</p>
        </div>
        <div class="lab-actions">
          <button class="lab-btn" id="lab-rm-back-to-experiments">← Back to Experiments</button>
          <button class="lab-btn" id="lab-rm-refresh-btn">↻ Refresh</button>
        </div>
      </div>
      <div id="lab-rm-feedback" class="lab-feedback" data-tone="idle"></div>
      <div id="lab-rm-progress"></div>
      <div id="lab-rm-grid"></div>
    </div>
  `;

  container.querySelector("#lab-rm-refresh-btn")?.addEventListener("click", () => {
    void renderRunGrid(container, experimentId);
  });

  try {
    const { runs } = await api<{ runs: RunSummary[] }>(`/api/lab/experiments/${experimentId}/runs`);

    // Progress bar
    const progressEl = container.querySelector<HTMLElement>("#lab-rm-progress");
    if (progressEl && runs.length) {
      const done = runs.filter((r) => r.status === "completed").length;
      const failed = runs.filter((r) => r.status === "failed" || r.status === "timed_out").length;
      const running = runs.filter((r) => r.status === "running").length;
      const pending = runs.filter((r) => r.status === "pending" || r.status === "queued").length;

      renderProgressBar(progressEl, { completed: done, failed, in_progress: running, pending });

      // Subscribe to real-time progress updates
      activeProgressCleanup = subscribeToLabProgress(experimentId, (progress) => {
        const el = container.querySelector<HTMLElement>("#lab-rm-progress");
        if (el) {
          renderProgressBar(el, progress);
        }
      });
    } else if (progressEl) {
      // Experiment has no runs yet but may be in pending state — show pending indicator
      renderProgressBar(progressEl, { completed: 0, failed: 0, in_progress: 0, pending: 0 });

      // Still subscribe — runs may start arriving
      activeProgressCleanup = subscribeToLabProgress(experimentId, (progress) => {
        const el = container.querySelector<HTMLElement>("#lab-rm-progress");
        if (el) {
          renderProgressBar(el, progress);
        }
      });
    }

    // Grid of status cards
    const gridEl = container.querySelector<HTMLElement>("#lab-rm-grid");
    if (!gridEl) return;

    if (!runs.length) {
      gridEl.innerHTML = `<div class="lab-empty"><div class="lab-empty-icon">📊</div><p class="lab-empty-title">No runs</p></div>`;
      return;
    }

    gridEl.innerHTML = `
      <div class="lab-card-grid" style="margin-top:var(--space-4)">
        ${runs.map((run) => `
          <div class="lab-card" data-action="lab-rm-view-run" data-run-id="${escapeHtml(run.run_id)}" style="padding:var(--space-3)">
            <div class="lab-card-header">
              <span class="lab-card-name" style="font-size:12px;font-family:var(--mono)">${escapeHtml(run.run_id.slice(0, 12))}…</span>
              <span class="lab-status" data-status="${escapeHtml(run.status)}">${escapeHtml(run.status)}</span>
            </div>
            <div class="lab-card-meta" style="margin-top:var(--space-2)">
              ${run.started_at ? `<span style="font-size:11px;color:var(--text-muted)">${formatTime(run.started_at)}</span>` : ""}
            </div>
          </div>
        `).join("")}
      </div>`;

    gridEl.addEventListener("click", (e) => {
      const card = (e.target as HTMLElement).closest<HTMLElement>("[data-action='lab-rm-view-run']");
      if (card) {
        viewingRunId = card.dataset["runId"] ?? null;
        renderLabRunMonitor(container, experimentId);
      }
    });
  } catch (err) {
    const gridEl = container.querySelector<HTMLElement>("#lab-rm-grid");
    if (gridEl) gridEl.innerHTML = `<p style="color:var(--danger)">Failed to load runs: ${escapeHtml(String(err))}</p>`;
  }
}

// ─── Single-run trace timeline ───────────────────────────────────────────────

async function renderRunTrace(container: HTMLElement, experimentId: string, runId: string): Promise<void> {
  container.innerHTML = `
    <div class="lab-panel">
      <div class="lab-panel-header">
        <div>
          <h2 class="lab-panel-title">Run Trace</h2>
          <p class="lab-panel-subtitle">Execution trace for run ${escapeHtml(runId.slice(0, 8))}…</p>
        </div>
        <div class="lab-actions">
          <button class="lab-btn" id="lab-rm-back-grid-btn">← Back to Grid</button>
          <button class="lab-btn" id="lab-rm-export-btn">Export JSON</button>
        </div>
      </div>
      <div id="lab-rm-feedback" class="lab-feedback" data-tone="idle"></div>
      <div id="lab-rm-trace"></div>
    </div>
  `;

  container.querySelector("#lab-rm-back-grid-btn")?.addEventListener("click", () => {
    viewingRunId = null;
    renderLabRunMonitor(container, experimentId);
  });

  container.querySelector("#lab-rm-export-btn")?.addEventListener("click", async () => {
    try {
      const data = await api(`/api/lab/runs/${runId}/trace/export`);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement("a"), { href: url, download: `trace-${runId.slice(0, 8)}.json` });
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      showFeedback(container, `Export failed: ${String(err)}`, "error");
    }
  });

  try {
    const { events } = await api<{ events: TraceEvent[] }>(`/api/lab/runs/${runId}/trace`);
    const traceEl = container.querySelector<HTMLElement>("#lab-rm-trace");
    if (!traceEl) return;

    if (!events || !events.length) {
      traceEl.innerHTML = `<div class="lab-empty"><div class="lab-empty-icon">📜</div><p class="lab-empty-title">No trace events</p></div>`;
      return;
    }

    traceEl.innerHTML = `
      <div class="lab-trace-timeline">
        ${events.map((evt) => `
          <div class="lab-trace-event" data-type="${escapeHtml(evt.event_type)}">
            <span class="lab-trace-seq">#${evt.seq}</span>
            <span class="lab-trace-type">${escapeHtml(evt.event_type)}</span>
            <span class="lab-trace-payload">${escapeHtml(formatPayload(evt.payload))}</span>
          </div>
        `).join("")}
      </div>`;
  } catch (err) {
    const traceEl = container.querySelector<HTMLElement>("#lab-rm-trace");
    if (traceEl) traceEl.innerHTML = `<p style="color:var(--danger)">Failed to load trace: ${escapeHtml(String(err))}</p>`;
  }
}

// ─── Progress bar rendering ──────────────────────────────────────────────────

function renderProgressBar(
  el: HTMLElement,
  progress: { completed: number; in_progress: number; failed: number; pending: number },
): void {
  const total = progress.completed + progress.in_progress + progress.failed + progress.pending;
  const pct = total > 0 ? Math.round(((progress.completed + progress.failed) / total) * 100) : 0;
  const isRunning = progress.in_progress > 0 || progress.pending > 0;

  el.innerHTML = `
    <div class="lab-progress">
      <div class="lab-progress-bar-wrap">
        <div class="lab-progress-bar${isRunning ? " lab-progress-bar-active" : ""}" style="width:${pct}%"></div>
      </div>
      <div class="lab-progress-counts">
        <span class="done">✓ ${progress.completed}</span>
        <span class="failed">✗ ${progress.failed}</span>
        <span class="running">● ${progress.in_progress}</span>
        <span class="pending">◌ ${progress.pending}</span>
        <span>${total} total</span>
      </div>
    </div>`;
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function formatPayload(payload?: Record<string, unknown>): string {
  if (!payload) return "";
  const json = JSON.stringify(payload);
  return json.length > 200 ? json.slice(0, 200) + "…" : json;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return iso;
  }
}

function showFeedback(container: HTMLElement, message: string, tone: string): void {
  const el = container.querySelector<HTMLElement>("#lab-rm-feedback");
  if (!el) return;
  el.textContent = message;
  el.dataset["tone"] = tone;
}

export { viewingRunId };
