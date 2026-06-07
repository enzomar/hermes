/**
 * Lab Experiment Builder — Create, list, preview, and launch matrix experiments.
 */

import { API_BASE } from "../config";
import { escapeHtml } from "../utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ExperimentSummary {
  experiment_id: string;
  name: string;
  status: string;
  created_at: string;
  run_count?: number;
  success_rate?: number;
}

interface DatasetOption {
  dataset_id: string;
  name: string;
  version: number;
}

interface ModelConfigOption {
  model_config_id: string;
  name: string;
}

interface McpVersionOption {
  mcp_version_id: string;
  name: string;
  version_tag: string;
}

interface WorkflowConfigOption {
  workflow_config_id: string;
  name: string;
}

interface MatrixPreview {
  run_count: number;
  runs: Array<{ task_id: string; model_config_id: string; mcp_version_id: string; workflow_config_id: string }>;
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

type View = "list" | "create" | "runs" | "dashboard";
let currentView: View = "list";
let selectedExperimentId: string | null = null;

// ─── Main render ─────────────────────────────────────────────────────────────

export function renderLabExperiments(container: HTMLElement): void {
  switch (currentView) {
    case "create":
      renderCreateForm(container);
      return;
    case "runs":
      if (selectedExperimentId) {
        void renderExperimentRuns(container, selectedExperimentId);
      } else {
        currentView = "list";
        renderExperimentList(container);
      }
      return;
    case "dashboard":
      if (selectedExperimentId) {
        void renderExperimentDashboard(container);
      } else {
        currentView = "list";
        renderExperimentList(container);
      }
      return;
    default:
      renderExperimentList(container);
  }
}

// ─── Experiment list view ────────────────────────────────────────────────────

function renderExperimentList(container: HTMLElement): void {
  container.innerHTML = `
    <div class="lab-panel">
      <div class="lab-panel-header">
        <div>
          <h2 class="lab-panel-title">Experiments</h2>
          <p class="lab-panel-subtitle">Define and run matrix experiments across model, tool, and workflow variants.</p>
        </div>
        <div class="lab-actions">
          <button class="lab-btn primary" id="lab-exp-create-btn">+ New Experiment</button>
        </div>
      </div>
      <div id="lab-exp-feedback" class="lab-feedback" data-tone="idle"></div>
      <div id="lab-exp-list"></div>
    </div>
  `;

  void loadExperiments(container);
  bindListActions(container);
}

async function loadExperiments(container: HTMLElement): Promise<void> {
  const listEl = container.querySelector<HTMLElement>("#lab-exp-list");
  if (!listEl) return;

  try {
    const { experiments } = await api<{ experiments: ExperimentSummary[] }>("/api/lab/experiments");
    if (!experiments || !experiments.length) {
      listEl.innerHTML = `
        <div class="lab-empty">
          <div class="lab-empty-icon">🧪</div>
          <p class="lab-empty-title">No experiments yet</p>
          <p class="lab-empty-desc">Create a dataset first, then define an experiment to run tasks across model and tool variants.</p>
        </div>`;
      return;
    }

    listEl.innerHTML = `
      <div class="lab-card-grid">
        ${experiments.map((exp) => `
          <div class="lab-card" data-action="lab-exp-view" data-id="${escapeHtml(exp.experiment_id)}">
            <div class="lab-card-header">
              <h3 class="lab-card-name">${escapeHtml(exp.name)}</h3>
              <span class="lab-status" data-status="${escapeHtml(exp.status)}">${escapeHtml(exp.status)}</span>
            </div>
            <div class="lab-card-meta">
              <div class="lab-card-metric">
                <span class="lab-card-metric-label">Runs</span>
                <span class="lab-card-metric-value">${exp.run_count ?? 0}</span>
              </div>
              <div class="lab-card-metric">
                <span class="lab-card-metric-label">Success Rate</span>
                <span class="lab-card-metric-value">${exp.success_rate != null ? (exp.success_rate * 100).toFixed(1) + "%" : "—"}</span>
              </div>
              <div class="lab-card-metric">
                <span class="lab-card-metric-label">Created</span>
                <span class="lab-card-metric-value">${formatDate(exp.created_at)}</span>
              </div>
            </div>
            <div class="lab-actions" style="margin-top:var(--space-3)">
              <button class="lab-btn" data-action="lab-exp-dashboard" data-id="${escapeHtml(exp.experiment_id)}">📊 Results</button>
              <button class="lab-btn danger" data-action="lab-exp-delete" data-id="${escapeHtml(exp.experiment_id)}">Delete</button>
            </div>
          </div>
        `).join("")}
      </div>`;
  } catch (err) {
    listEl.innerHTML = `<p style="color: var(--danger)">Failed to load experiments: ${escapeHtml(String(err))}</p>`;
  }
}

function bindListActions(container: HTMLElement): void {
  container.addEventListener("click", (e) => {
    const target = e.target as HTMLElement;

    if (target.id === "lab-exp-create-btn" || target.closest("#lab-exp-create-btn")) {
      currentView = "create";
      renderLabExperiments(container);
      return;
    }

    // Dashboard button
    const dashBtn = target.closest<HTMLElement>("[data-action='lab-exp-dashboard']");
    if (dashBtn) {
      e.stopPropagation();
      selectedExperimentId = dashBtn.dataset["id"] ?? null;
      currentView = "dashboard";
      renderLabExperiments(container);
      return;
    }

    // Delete button
    const delBtn = target.closest<HTMLElement>("[data-action='lab-exp-delete']");
    if (delBtn) {
      e.stopPropagation();
      void deleteExperiment(container, delBtn.dataset["id"] ?? "");
      return;
    }

    const card = target.closest<HTMLElement>("[data-action='lab-exp-view']");
    if (card) {
      selectedExperimentId = card.dataset["id"] ?? null;
      currentView = "runs";
      renderLabExperiments(container);
    }
  });
}

// ─── Create experiment form ──────────────────────────────────────────────────

function renderCreateForm(container: HTMLElement): void {
  container.innerHTML = `
    <div class="lab-panel">
      <div class="lab-panel-header">
        <div>
          <h2 class="lab-panel-title">New Experiment</h2>
          <p class="lab-panel-subtitle">Select datasets and variant dimensions to create a matrix experiment.</p>
        </div>
        <div class="lab-actions">
          <button class="lab-btn" id="lab-exp-back-btn">← Back</button>
        </div>
      </div>
      <div id="lab-exp-feedback" class="lab-feedback" data-tone="idle"></div>
      <div class="lab-form" id="lab-exp-form">
        <div class="lab-field">
          <label for="lab-exp-name">Experiment Name</label>
          <input id="lab-exp-name" type="text" placeholder="e.g. GPT-4 vs Claude tool calling" />
        </div>
        <div class="lab-field">
          <label>Datasets</label>
          <div id="lab-exp-datasets" class="lab-field-hint">Loading...</div>
        </div>
        <div class="lab-field">
          <label>Model Configs</label>
          <div id="lab-exp-models" class="lab-field-hint">Loading...</div>
        </div>
        <div class="lab-field">
          <label>MCP Versions</label>
          <div id="lab-exp-mcp-versions" class="lab-field-hint">Loading...</div>
        </div>
        <div class="lab-field">
          <label>Workflow Configs</label>
          <div id="lab-exp-workflows" class="lab-field-hint">Loading...</div>
        </div>
        <div id="lab-exp-preview-section" hidden>
          <div class="lab-progress">
            <span>Matrix Preview:</span>
            <span id="lab-exp-run-count" style="font-weight:600;color:var(--text)">0 runs</span>
          </div>
        </div>
        <div class="lab-actions">
          <button class="lab-btn primary" id="lab-exp-preview-btn">Preview Matrix</button>
          <button class="lab-btn primary" id="lab-exp-launch-btn" disabled>Launch Experiment</button>
        </div>
      </div>
    </div>
  `;

  void loadFormOptions(container);
  bindFormActions(container);
}

async function loadFormOptions(container: HTMLElement): Promise<void> {
  try {
    const [datasets, models, mcpVersions, workflows] = await Promise.all([
      api<{ datasets: DatasetOption[] }>("/api/lab/datasets").then((r) => r.datasets ?? []),
      api<{ model_configs: ModelConfigOption[] }>("/api/lab/model-configs").then((r) => r.model_configs ?? []),
      api<{ mcp_versions: McpVersionOption[] }>("/api/lab/mcp-versions").then((r) => r.mcp_versions ?? []),
      api<{ workflow_configs: WorkflowConfigOption[] }>("/api/lab/workflow-configs").then((r) => r.workflow_configs ?? []),
    ]);

    renderCheckboxGroup(container, "#lab-exp-datasets", datasets.map((d) => ({ id: d.dataset_id, label: `${d.name} (v${d.version})` })));
    renderCheckboxGroup(container, "#lab-exp-models", models.map((m) => ({ id: m.model_config_id, label: m.name })));
    renderCheckboxGroup(container, "#lab-exp-mcp-versions", mcpVersions.map((v) => ({ id: v.mcp_version_id, label: `${v.name} @ ${v.version_tag}` })));
    renderCheckboxGroup(container, "#lab-exp-workflows", workflows.map((w) => ({ id: w.workflow_config_id, label: w.name })));
  } catch (err) {
    showFeedback(container, `Failed to load options: ${String(err)}`, "error");
  }
}

function renderCheckboxGroup(container: HTMLElement, selector: string, items: Array<{ id: string; label: string }>): void {
  const el = container.querySelector<HTMLElement>(selector);
  if (!el) return;
  if (!items.length) {
    el.innerHTML = `<span class="lab-field-hint">None available — create one first.</span>`;
    return;
  }
  el.innerHTML = items.map((item) => `
    <label style="display:flex;align-items:center;gap:var(--space-2);font-size:13px;color:var(--text-soft);cursor:pointer;">
      <input type="checkbox" value="${escapeHtml(item.id)}" />
      ${escapeHtml(item.label)}
    </label>
  `).join("");
}

function getSelectedIds(container: HTMLElement, selector: string): string[] {
  const el = container.querySelector<HTMLElement>(selector);
  if (!el) return [];
  return Array.from(el.querySelectorAll<HTMLInputElement>("input[type=checkbox]:checked")).map((cb) => cb.value);
}

let createdExperimentId: string | null = null;

function bindFormActions(container: HTMLElement): void {
  container.addEventListener("click", async (e) => {
    const target = e.target as HTMLElement;

    if (target.id === "lab-exp-back-btn" || target.closest("#lab-exp-back-btn")) {
      currentView = "list";
      renderLabExperiments(container);
      return;
    }

    if (target.id === "lab-exp-preview-btn" || target.closest("#lab-exp-preview-btn")) {
      await previewMatrix(container);
      return;
    }

    if (target.id === "lab-exp-launch-btn" || target.closest("#lab-exp-launch-btn")) {
      await launchExperiment(container);
      return;
    }
  });
}

async function previewMatrix(container: HTMLElement): Promise<void> {
  const name = (container.querySelector<HTMLInputElement>("#lab-exp-name"))?.value.trim() ?? "";
  const datasetIds = getSelectedIds(container, "#lab-exp-datasets");
  const modelConfigIds = getSelectedIds(container, "#lab-exp-models");
  const mcpVersionIds = getSelectedIds(container, "#lab-exp-mcp-versions");
  const workflowConfigIds = getSelectedIds(container, "#lab-exp-workflows");

  if (!name) { showFeedback(container, "Experiment name is required.", "error"); return; }
  if (!datasetIds.length) { showFeedback(container, "Select at least one dataset.", "error"); return; }
  if (!modelConfigIds.length) { showFeedback(container, "Select at least one model config.", "error"); return; }
  if (!mcpVersionIds.length) { showFeedback(container, "Select at least one MCP version.", "error"); return; }
  if (!workflowConfigIds.length) { showFeedback(container, "Select at least one workflow config.", "error"); return; }

  try {
    // First create the experiment to get an ID, then preview
    const { experiment } = await api<{ experiment: { experiment_id: string } }>("/api/lab/experiments", {
      method: "POST",
      body: JSON.stringify({
        name,
        dataset_ids: datasetIds,
        model_config_ids: modelConfigIds,
        mcp_version_ids: mcpVersionIds,
        workflow_config_ids: workflowConfigIds,
      }),
    });

    createdExperimentId = experiment.experiment_id;

    const preview = await api<MatrixPreview>(`/api/lab/experiments/${experiment.experiment_id}/preview`);

    const previewSection = container.querySelector<HTMLElement>("#lab-exp-preview-section");
    const runCountEl = container.querySelector<HTMLElement>("#lab-exp-run-count");
    const launchBtn = container.querySelector<HTMLButtonElement>("#lab-exp-launch-btn");

    if (previewSection) previewSection.hidden = false;
    if (runCountEl) runCountEl.textContent = `${preview.run_count} runs`;
    if (launchBtn) launchBtn.disabled = false;

    showFeedback(container, `Matrix expanded to ${preview.run_count} runs. Ready to launch.`, "success");
  } catch (err) {
    showFeedback(container, `Preview failed: ${String(err)}`, "error");
  }
}

async function launchExperiment(container: HTMLElement): Promise<void> {
  if (!createdExperimentId) {
    showFeedback(container, "No experiment created yet — preview first.", "error");
    return;
  }

  try {
    await api(`/api/lab/experiments/${createdExperimentId}/run`, { method: "POST" });
    showFeedback(container, "Experiment launched! Switching to run monitor.", "success");
    selectedExperimentId = createdExperimentId;
    createdExperimentId = null;
    currentView = "runs";
    setTimeout(() => renderLabExperiments(container), 800);
  } catch (err) {
    showFeedback(container, `Launch failed: ${String(err)}`, "error");
  }
}

// ─── Delete experiment ────────────────────────────────────────────────────────

async function deleteExperiment(container: HTMLElement, experimentId: string): Promise<void> {
  if (!confirm("Delete this experiment and all its runs? This cannot be undone.")) return;
  try {
    await api(`/api/lab/experiments/${experimentId}`, { method: "DELETE" });
    renderLabExperiments(container);
  } catch (err) {
    showFeedback(container, `Delete failed: ${String(err)}`, "error");
  }
}

// ─── Experiment runs sub-view ────────────────────────────────────────────────

async function renderExperimentRuns(container: HTMLElement, experimentId: string): Promise<void> {
  // Delegate to the dedicated Run Monitor component
  const { renderLabRunMonitor } = await import("./lab-run-monitor");
  renderLabRunMonitor(container, experimentId);

  // Add a back-to-list handler at the top level
  setTimeout(() => {
    const backBtn = container.querySelector("#lab-rm-back-to-experiments");
    if (backBtn) {
      backBtn.addEventListener("click", () => {
        currentView = "list";
        selectedExperimentId = null;
        renderLabExperiments(container);
      });
    }
  }, 100);
}

// ─── Experiment dashboard sub-view ───────────────────────────────────────────

async function renderExperimentDashboard(container: HTMLElement): Promise<void> {
  const { renderLabDashboard } = await import("./lab-dashboard");
  renderLabDashboard(container);

  // Add a back button handler after render
  setTimeout(() => {
    const backBtn = container.querySelector("#lab-dash-back-to-experiments");
    if (backBtn) {
      backBtn.addEventListener("click", () => {
        currentView = "list";
        selectedExperimentId = null;
        renderLabExperiments(container);
      });
    }
  }, 100);
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function showFeedback(container: HTMLElement, message: string, tone: string): void {
  const el = container.querySelector<HTMLElement>("#lab-exp-feedback");
  if (!el) return;
  el.textContent = message;
  el.dataset["tone"] = tone;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
}
