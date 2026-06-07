/**
 * Lab Comparison Dashboard — Eval results grouped by variant dimension with
 * aggregate metrics, best-variant highlight, classification filter, and CSV export.
 */

import { API_BASE, WS_URL } from "../config";
import { escapeHtml } from "../utils";
import { renderLabTraceDiff } from "./lab-trace-diff";

// ─── Types ───────────────────────────────────────────────────────────────────

interface EvalResult {
  run_id: string;
  experiment_id: string;
  classification: string;
  success_rate: number;
  latency_ms: number;
  total_tokens: number;
  estimated_cost_usd: number;
  model_config_id?: string;
  model_config_name?: string;
  mcp_version_id?: string;
  mcp_version_name?: string;
  workflow_config_id?: string;
  workflow_config_name?: string;
  tool_variant_id?: string;
  tool_variant_name?: string;
}

interface AggregateMetrics {
  variant_key: string;
  variant_label: string;
  run_count: number;
  success_rate: number;
  mean_latency_ms: number;
  mean_total_tokens: number;
  mean_estimated_cost_usd: number;
  failure_count: number;
}

interface ExperimentSummary {
  experiment_id: string;
  name: string;
  status: string;
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

// ─── State ───────────────────────────────────────────────────────────────────

let selectedExperimentId: string | null = null;
let classificationFilter: string = "all";
let groupByDimension: string = "model";
let activeDashboardCleanup: (() => void) | null = null;

// ─── WebSocket subscription ──────────────────────────────────────────────────

interface LabRunProgress {
  experiment_id: string;
  completed: number;
  in_progress: number;
  failed: number;
  pending: number;
}

/**
 * Subscribe to real-time lab_run_progress events to refresh dashboard metrics.
 * Re-fetches results when runs complete (completed or failed count changes).
 */
function subscribeToDashboardProgress(
  experimentId: string,
  container: HTMLElement,
): () => void {
  const ws = new WebSocket(WS_URL);
  let lastCompleted = -1;
  let lastFailed = -1;

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (
        msg.type === "event" &&
        msg.payload?.event_type === "lab_run_progress"
      ) {
        const progress: LabRunProgress = msg.payload.payload;
        if (progress.experiment_id === experimentId) {
          // Re-fetch results when completed or failed count increases
          const newCompleted = progress.completed + progress.failed;
          if (newCompleted !== lastCompleted + lastFailed || lastCompleted === -1) {
            lastCompleted = progress.completed;
            lastFailed = progress.failed;
            void loadResults(container);
          }
        }
      }
    } catch {
      // Ignore parse errors from non-lab messages
    }
  };

  ws.onerror = () => {
    // Silently handle connection errors
  };

  return () => {
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close();
    }
  };
}

// ─── Main render ─────────────────────────────────────────────────────────────

export function renderLabDashboard(container: HTMLElement): void {
  // Clean up any previous WebSocket subscription
  if (activeDashboardCleanup) {
    activeDashboardCleanup();
    activeDashboardCleanup = null;
  }

  container.innerHTML = `
    <div class="lab-panel">
      <div class="lab-panel-header">
        <div>
          <h2 class="lab-panel-title">Comparison Dashboard</h2>
          <p class="lab-panel-subtitle">View aggregated eval results grouped by variant dimension.</p>
        </div>
        <div class="lab-actions">
          <button class="lab-btn" id="lab-dash-back-to-experiments">← Back</button>
          <button class="lab-btn primary" id="lab-dash-compare-runs">Compare Runs</button>
          <button class="lab-btn" id="lab-dash-export-csv">Export CSV</button>
        </div>
      </div>
      <div id="lab-dash-feedback" class="lab-feedback" data-tone="idle"></div>
      <div id="lab-dash-controls" style="display:flex;gap:var(--space-4);margin-bottom:var(--space-4);flex-wrap:wrap;align-items:flex-end;">
        <div class="lab-field" style="min-width:200px">
          <label for="lab-dash-experiment">Experiment</label>
          <select id="lab-dash-experiment" class="lab-field"></select>
        </div>
        <div class="lab-field" style="min-width:140px">
          <label for="lab-dash-group">Group By</label>
          <select id="lab-dash-group">
            <option value="model">Model Config</option>
            <option value="mcp_version">MCP Version</option>
            <option value="workflow">Workflow Config</option>
            <option value="tool_variant">Tool Variant</option>
          </select>
        </div>
        <div class="lab-field" style="min-width:140px">
          <label for="lab-dash-filter">Classification</label>
          <select id="lab-dash-filter">
            <option value="all">All</option>
            <option value="success">Success</option>
            <option value="partial_success">Partial Success</option>
            <option value="failure">Failure</option>
            <option value="error">Error</option>
          </select>
        </div>
      </div>
      <div id="lab-dash-results"></div>
    </div>
  `;

  void loadExperimentList(container);
  bindDashboardActions(container);
}

// ─── Load experiment selector ────────────────────────────────────────────────

async function loadExperimentList(container: HTMLElement): Promise<void> {
  const select = container.querySelector<HTMLSelectElement>("#lab-dash-experiment");
  if (!select) return;

  try {
    const { experiments } = await api<{ experiments: ExperimentSummary[] }>("/api/lab/experiments");
    if (!experiments || !experiments.length) {
      select.innerHTML = `<option value="">No experiments</option>`;
      return;
    }

    select.innerHTML = `<option value="">Select experiment…</option>` +
      experiments.map((exp) => `<option value="${escapeHtml(exp.experiment_id)}">${escapeHtml(exp.name)} (${exp.status})</option>`).join("");

    if (selectedExperimentId) {
      select.value = selectedExperimentId;
      void loadResults(container);
      // Subscribe to real-time updates for the pre-selected experiment
      activeDashboardCleanup = subscribeToDashboardProgress(selectedExperimentId, container);
    }
  } catch (err) {
    showFeedback(container, `Failed to load experiments: ${String(err)}`, "error");
  }
}

// ─── Bind controls ───────────────────────────────────────────────────────────

function bindDashboardActions(container: HTMLElement): void {
  container.querySelector("#lab-dash-experiment")?.addEventListener("change", (e) => {
    selectedExperimentId = (e.target as HTMLSelectElement).value || null;

    // Clean up previous subscription
    if (activeDashboardCleanup) {
      activeDashboardCleanup();
      activeDashboardCleanup = null;
    }

    if (selectedExperimentId) {
      void loadResults(container);
      // Subscribe to real-time updates for this experiment
      activeDashboardCleanup = subscribeToDashboardProgress(selectedExperimentId, container);
    }
  });

  container.querySelector("#lab-dash-group")?.addEventListener("change", (e) => {
    groupByDimension = (e.target as HTMLSelectElement).value;
    if (selectedExperimentId) void loadResults(container);
  });

  container.querySelector("#lab-dash-filter")?.addEventListener("change", (e) => {
    classificationFilter = (e.target as HTMLSelectElement).value;
    if (selectedExperimentId) void loadResults(container);
  });

  container.querySelector("#lab-dash-export-csv")?.addEventListener("click", () => {
    exportCsv(container);
  });

  container.querySelector("#lab-dash-compare-runs")?.addEventListener("click", () => {
    // Switch to the trace diff viewer within the same container
    renderLabTraceDiff(container);
  });
}

// ─── Load and display results ────────────────────────────────────────────────

let lastResults: EvalResult[] = [];

async function loadResults(container: HTMLElement): Promise<void> {
  if (!selectedExperimentId) return;
  const resultsEl = container.querySelector<HTMLElement>("#lab-dash-results");
  if (!resultsEl) return;

  try {
    const { results } = await api<{ results: EvalResult[] }>(`/api/lab/experiments/${selectedExperimentId}/results`);
    lastResults = results ?? [];
    renderResults(resultsEl, lastResults);
  } catch (err) {
    resultsEl.innerHTML = `<p style="color:var(--danger)">Failed to load results: ${escapeHtml(String(err))}</p>`;
  }
}

function renderResults(el: HTMLElement, results: EvalResult[]): void {
  // Apply classification filter
  let filtered = results;
  if (classificationFilter !== "all") {
    filtered = results.filter((r) => r.classification === classificationFilter);
  }

  if (!filtered.length) {
    el.innerHTML = `<div class="lab-empty"><div class="lab-empty-icon">📊</div><p class="lab-empty-title">No results${classificationFilter !== "all" ? " matching filter" : ""}</p></div>`;
    return;
  }

  // Group by dimension
  const groups = groupResults(filtered);
  const aggregates = computeAggregates(groups);

  // Find best variant (highest success_rate)
  let bestKey = "";
  let bestRate = -1;
  for (const agg of aggregates) {
    if (agg.success_rate > bestRate) {
      bestRate = agg.success_rate;
      bestKey = agg.variant_key;
    }
  }

  el.innerHTML = `
    <table class="lab-table">
      <thead>
        <tr>
          <th>Variant</th>
          <th>Runs</th>
          <th>Success Rate</th>
          <th>Mean Latency (ms)</th>
          <th>Mean Tokens</th>
          <th>Mean Cost (USD)</th>
          <th>Failures</th>
        </tr>
      </thead>
      <tbody>
        ${aggregates.map((agg) => {
          const isBest = agg.variant_key === bestKey;
          return `
            <tr>
              <td class="lab-cell-primary">${escapeHtml(agg.variant_label)}</td>
              <td>${agg.run_count}</td>
              <td${isBest ? ` class="lab-metric-best" style="position:relative"` : ""}>${(agg.success_rate * 100).toFixed(1)}%</td>
              <td>${agg.mean_latency_ms.toFixed(0)}</td>
              <td>${agg.mean_total_tokens.toFixed(0)}</td>
              <td>$${agg.mean_estimated_cost_usd.toFixed(4)}</td>
              <td>${agg.failure_count}</td>
            </tr>`;
        }).join("")}
      </tbody>
    </table>`;
}

// ─── Grouping logic ──────────────────────────────────────────────────────────

function groupResults(results: EvalResult[]): Map<string, EvalResult[]> {
  const map = new Map<string, EvalResult[]>();

  for (const r of results) {
    let key: string;
    switch (groupByDimension) {
      case "mcp_version":
        key = r.mcp_version_id ?? "unknown";
        break;
      case "workflow":
        key = r.workflow_config_id ?? "unknown";
        break;
      case "tool_variant":
        key = r.tool_variant_id ?? "unknown";
        break;
      default:
        key = r.model_config_id ?? "unknown";
    }
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(r);
  }

  return map;
}

function computeAggregates(groups: Map<string, EvalResult[]>): AggregateMetrics[] {
  const result: AggregateMetrics[] = [];

  for (const [key, items] of groups) {
    const n = items.length;
    const successCount = items.filter((r) => r.classification === "success").length;
    const failureCount = items.filter((r) => r.classification === "failure" || r.classification === "error").length;
    const totalLatency = items.reduce((sum, r) => sum + (r.latency_ms ?? 0), 0);
    const totalTokens = items.reduce((sum, r) => sum + (r.total_tokens ?? 0), 0);
    const totalCost = items.reduce((sum, r) => sum + (r.estimated_cost_usd ?? 0), 0);

    // Determine label
    let label = key;
    if (items[0]) {
      switch (groupByDimension) {
        case "mcp_version":
          label = items[0].mcp_version_name ?? key.slice(0, 12);
          break;
        case "workflow":
          label = items[0].workflow_config_name ?? key.slice(0, 12);
          break;
        case "tool_variant":
          label = items[0].tool_variant_name ?? key.slice(0, 12);
          break;
        default:
          label = items[0].model_config_name ?? key.slice(0, 12);
      }
    }

    result.push({
      variant_key: key,
      variant_label: label,
      run_count: n,
      success_rate: n > 0 ? successCount / n : 0,
      mean_latency_ms: n > 0 ? totalLatency / n : 0,
      mean_total_tokens: n > 0 ? totalTokens / n : 0,
      mean_estimated_cost_usd: n > 0 ? totalCost / n : 0,
      failure_count: failureCount,
    });
  }

  return result.sort((a, b) => b.success_rate - a.success_rate);
}

// ─── CSV export ──────────────────────────────────────────────────────────────

function exportCsv(_container: HTMLElement): void {
  if (!lastResults.length) return;

  const headers = ["run_id", "classification", "success_rate", "latency_ms", "total_tokens", "estimated_cost_usd", "model_config_id", "mcp_version_id", "workflow_config_id", "tool_variant_id"];
  const rows = lastResults.map((r) => [
    r.run_id,
    r.classification,
    String(r.success_rate),
    String(r.latency_ms),
    String(r.total_tokens),
    String(r.estimated_cost_usd),
    r.model_config_id ?? "",
    r.mcp_version_id ?? "",
    r.workflow_config_id ?? "",
    r.tool_variant_id ?? "",
  ]);

  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: "lab-results.csv" });
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function showFeedback(container: HTMLElement, message: string, tone: string): void {
  const el = container.querySelector<HTMLElement>("#lab-dash-feedback");
  if (!el) return;
  el.textContent = message;
  el.dataset["tone"] = tone;
}
