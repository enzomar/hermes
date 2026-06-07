/**
 * Lab Dataset Manager — CRUD UI for versioned task datasets.
 */

import { API_BASE } from "../config";
import { escapeHtml } from "../utils";

type LabTask = {
  task_id: string;
  prompt: string;
  expected: {
    tool_calls: string[];
    tool_calls_ordered: boolean;
    assertions: string[];
  };
};

type LabDatasetSummary = {
  dataset_id: string;
  version: number;
  name: string;
  description: string;
  task_count: number;
  created_at: string;
};

type LabDataset = LabDatasetSummary & { tasks: LabTask[] };

async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) throw new Error((await res.text()) || `Request failed: ${path}`);
  return res.json() as Promise<T>;
}

export function renderLabDatasets(container: HTMLElement): void {
  container.innerHTML = `
    <div class="lab-panel">
      <div class="lab-panel-header">
        <div>
          <h2 class="lab-panel-title">Dataset Manager</h2>
          <p class="lab-panel-subtitle">Define versioned task collections with expected outcomes for experiments.</p>
        </div>
        <div class="lab-actions">
          <button class="lab-btn primary" id="lab-ds-create-btn">+ New Dataset</button>
          <button class="lab-btn" id="lab-ds-import-btn">Import JSON</button>
          <input type="file" id="lab-ds-import-file" accept=".json" hidden />
        </div>
      </div>

      <div id="lab-ds-feedback" class="lab-feedback" data-tone="idle"></div>

      <div id="lab-ds-create-form" hidden>
        <div class="lab-form" style="margin-bottom: var(--space-6);">
          <div class="lab-field">
            <label for="lab-ds-name">Dataset Name</label>
            <input id="lab-ds-name" type="text" placeholder="e.g. File Ops Benchmark v1" />
          </div>
          <div class="lab-field">
            <label for="lab-ds-desc">Description (optional)</label>
            <input id="lab-ds-desc" type="text" placeholder="What does this dataset test?" />
          </div>
          <div class="lab-field">
            <label for="lab-ds-tasks">Tasks (one per line — format: prompt | expected_tool1,tool2 | assertion_regex)</label>
            <textarea id="lab-ds-tasks" rows="6" placeholder="Read file.txt | read_file | file content&#10;List directory | list_directory,read_file |"></textarea>
            <span class="lab-field-hint">Fields separated by | — expected tools and assertions are optional.</span>
          </div>
          <div class="lab-actions">
            <button class="lab-btn primary" id="lab-ds-save-btn">Save Dataset</button>
            <button class="lab-btn" id="lab-ds-cancel-btn">Cancel</button>
          </div>
        </div>
      </div>

      <div id="lab-ds-list"></div>
    </div>
  `;

  void loadDatasets(container);
  bindDatasetActions(container);
}

async function loadDatasets(container: HTMLElement): Promise<void> {
  const listEl = container.querySelector<HTMLElement>("#lab-ds-list");
  if (!listEl) return;

  try {
    const { datasets } = await api<{ datasets: LabDatasetSummary[] }>("/api/lab/datasets");
    if (!datasets.length) {
      listEl.innerHTML = `
        <div class="lab-empty">
          <div class="lab-empty-icon">📋</div>
          <p class="lab-empty-title">No datasets yet</p>
          <p class="lab-empty-desc">Create a dataset to define the tasks your experiments will run against.</p>
        </div>`;
      return;
    }

    listEl.innerHTML = `
      <table class="lab-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Version</th>
            <th>Tasks</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${datasets.map((d) => `
            <tr>
              <td class="lab-cell-primary">${escapeHtml(d.name)}</td>
              <td class="lab-cell-mono">v${d.version}</td>
              <td>${d.task_count}</td>
              <td>${formatDate(d.created_at)}</td>
              <td>
                <div class="lab-actions">
                  <button class="lab-btn"
                    data-action="lab-ds-export"
                    data-id="${escapeHtml(d.dataset_id)}"
                    data-version="${d.version}">Export</button>
                  <button class="lab-btn danger"
                    data-action="lab-ds-delete"
                    data-id="${escapeHtml(d.dataset_id)}"
                    data-version="${d.version}">Delete</button>
                </div>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>`;
  } catch (err) {
    listEl.innerHTML = `<p style="color: var(--danger)">Failed to load datasets: ${escapeHtml(String(err))}</p>`;
  }
}

function bindDatasetActions(container: HTMLElement): void {
  container.addEventListener("click", async (e) => {
    const target = e.target as HTMLElement;
    const btn = target.closest<HTMLElement>("[data-action]");

    if (target.id === "lab-ds-create-btn") {
      toggleCreateForm(container, true);
      return;
    }
    if (target.id === "lab-ds-cancel-btn") {
      toggleCreateForm(container, false);
      return;
    }
    if (target.id === "lab-ds-save-btn") {
      await saveDataset(container);
      return;
    }
    if (target.id === "lab-ds-import-btn") {
      container.querySelector<HTMLInputElement>("#lab-ds-import-file")?.click();
      return;
    }

    if (!btn) return;
    const action = btn.dataset["action"];
    const id = btn.dataset["id"] ?? "";
    const version = parseInt(btn.dataset["version"] ?? "1", 10);

    if (action === "lab-ds-export") {
      await exportDataset(container, id, version);
    } else if (action === "lab-ds-delete") {
      await deleteDataset(container, id, version);
    }
  });

  const fileInput = container.querySelector<HTMLInputElement>("#lab-ds-import-file");
  if (fileInput) {
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const payload = JSON.parse(text);
        const { dataset } = await api<{ dataset: LabDataset }>("/api/lab/datasets/import", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        showFeedback(container, `Imported dataset "${dataset.name}".`, "success");
        await loadDatasets(container);
      } catch (err) {
        showFeedback(container, `Import failed: ${String(err)}`, "error");
      }
      fileInput.value = "";
    });
  }
}

function toggleCreateForm(container: HTMLElement, show: boolean): void {
  const form = container.querySelector<HTMLElement>("#lab-ds-create-form");
  if (form) form.hidden = !show;
  if (!show) {
    (container.querySelector<HTMLInputElement>("#lab-ds-name"))!.value = "";
    (container.querySelector<HTMLInputElement>("#lab-ds-desc"))!.value = "";
    (container.querySelector<HTMLTextAreaElement>("#lab-ds-tasks"))!.value = "";
  }
}

async function saveDataset(container: HTMLElement): Promise<void> {
  const name = (container.querySelector<HTMLInputElement>("#lab-ds-name"))!.value.trim();
  const description = (container.querySelector<HTMLInputElement>("#lab-ds-desc"))!.value.trim();
  const rawTasks = (container.querySelector<HTMLTextAreaElement>("#lab-ds-tasks"))!.value;

  if (!name) { showFeedback(container, "Dataset name is required.", "error"); return; }

  const tasks = rawTasks
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [prompt, toolsPart, assertionsPart] = line.split("|").map((s) => s.trim());
      const tool_calls = toolsPart
        ? toolsPart.split(",").map((t) => t.trim()).filter(Boolean)
        : [];
      const assertions = assertionsPart
        ? assertionsPart.split(",").map((a) => a.trim()).filter(Boolean)
        : [];
      return { prompt, expected: { tool_calls, assertions } };
    });

  if (!tasks.length) { showFeedback(container, "At least one task is required.", "error"); return; }

  try {
    const { dataset } = await api<{ dataset: LabDataset }>("/api/lab/datasets", {
      method: "POST",
      body: JSON.stringify({ name, description, tasks }),
    });
    showFeedback(container, `Dataset "${dataset.name}" created (v${dataset.version}).`, "success");
    toggleCreateForm(container, false);
    await loadDatasets(container);
  } catch (err) {
    showFeedback(container, `Failed to create dataset: ${String(err)}`, "error");
  }
}

async function exportDataset(container: HTMLElement, id: string, version: number): Promise<void> {
  try {
    const data = await api(`/api/lab/datasets/${encodeURIComponent(id)}/versions/${version}/export`);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), {
      href: url,
      download: `dataset-${id.slice(0, 8)}-v${version}.json`,
    });
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    showFeedback(container, `Export failed: ${String(err)}`, "error");
  }
}

async function deleteDataset(container: HTMLElement, id: string, version: number): Promise<void> {
  if (!confirm(`Delete dataset version v${version}? This cannot be undone.`)) return;
  try {
    await api(`/api/lab/datasets/${encodeURIComponent(id)}/versions/${version}`, {
      method: "DELETE",
    });
    showFeedback(container, "Dataset version deleted.", "success");
    await loadDatasets(container);
  } catch (err) {
    showFeedback(container, `Delete failed: ${String(err)}`, "error");
  }
}

function showFeedback(container: HTMLElement, message: string, tone: string): void {
  const el = container.querySelector<HTMLElement>("#lab-ds-feedback");
  if (!el) return;
  el.textContent = message;
  el.dataset["tone"] = tone;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short", day: "numeric", year: "numeric",
    });
  } catch {
    return iso;
  }
}
