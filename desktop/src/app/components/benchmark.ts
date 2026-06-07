import type { BenchmarkEntry, HermesState, LlmProfileConfig } from "../types";
import { escapeHtml, formatTime, setText } from "../utils";

export function renderBenchmarkWorkspace(state: HermesState): void {
  const container = document.querySelector<HTMLElement>("#benchmark-compare");
  const trigger = document.querySelector<HTMLButtonElement>("#benchmark-report-trigger");
  if (!container || !trigger) {
    return;
  }

  const report = getCurrentBenchmarkReport(state);
  trigger.hidden = !report;

  if (!report || state.activeSessionId !== report.source_session_id) {
    container.hidden = true;
    container.innerHTML = "";
    return;
  }

  const entries = sortBenchmarkEntries(report.entries, state.ui.benchmarkSort);
  container.hidden = false;
  container.innerHTML = `
    <div class="benchmark-compare-header">
      <div class="benchmark-compare-copy">
        <p class="timeline-empty-kicker">Benchmark compare</p>
        <h3>${escapeHtml(report.prompt_preview || report.source_title)}</h3>
        <p>${escapeHtml(report.completed ? "All targets completed. Open the report for a KPI breakdown." : "Hermes is still collecting benchmark responses.")}</p>
      </div>
      <div class="benchmark-compare-actions">
        <span class="subtle-chip">${entries.length} target${entries.length === 1 ? "" : "s"}</span>
        <button type="button" class="inline-action" data-action="open-benchmark-report">Report</button>
      </div>
    </div>
    <div class="benchmark-grid">
      ${entries.map((entry) => renderBenchmarkCard(entry)).join("")}
    </div>
  `;
}

export function renderBenchmarkSplitView(state: HermesState): void {
  const leftTimeline = document.querySelector<HTMLElement>("#benchmark-timeline-left");
  const rightTimeline = document.querySelector<HTMLElement>("#benchmark-timeline-right");
  const leftModel = document.querySelector<HTMLElement>("#benchmark-model-left");
  const rightModel = document.querySelector<HTMLElement>("#benchmark-model-right");
  const benchmarkContext = document.querySelector<HTMLElement>("#benchmark-composer-context");
  const benchmarkProfileSummary = document.querySelector<HTMLElement>("#benchmark-profile-summary");

  if (!leftTimeline || !rightTimeline || !leftModel || !rightModel) {
    return;
  }

  const report = getCurrentBenchmarkReport(state);
  const leftProfile = getSelectedBenchmarkProfile(state, "left");
  const rightProfile = getSelectedBenchmarkProfile(state, "right");
  const entries = report?.entries.slice(0, 2) ?? [];
  const leftEntry = entries[0] ?? null;
  const rightEntry = entries[1] ?? null;

  setText("#benchmark-model-left", leftEntry ? getEntryLabel(leftEntry) : leftProfile?.name ?? "Choose profile");
  setText("#benchmark-model-right", rightEntry ? getEntryLabel(rightEntry) : rightProfile?.name ?? "Choose profile");
  setMetric("#benchmark-tokens-left", leftEntry ? String(Number(leftEntry.kpis.total_tokens ?? 0)) : "—");
  setMetric("#benchmark-latency-left", leftEntry ? `${formatNumber(leftEntry.kpis.last_latency_ms)} ms` : "—");
  setMetric("#benchmark-tools-left", leftEntry ? String(Number(leftEntry.kpis.tool_calls ?? 0)) : "—");
  setMetric("#benchmark-tokens-right", rightEntry ? String(Number(rightEntry.kpis.total_tokens ?? 0)) : "—");
  setMetric("#benchmark-latency-right", rightEntry ? `${formatNumber(rightEntry.kpis.last_latency_ms)} ms` : "—");
  setMetric("#benchmark-tools-right", rightEntry ? String(Number(rightEntry.kpis.tool_calls ?? 0)) : "—");

  leftTimeline.innerHTML = renderBenchmarkPane(leftEntry, leftProfile, report?.completed === true, "Profile A");
  rightTimeline.innerHTML = renderBenchmarkPane(rightEntry, rightProfile, report?.completed === true, "Profile B");

  if (benchmarkContext) {
    const chips = [
      `<span class="subtle-chip">${escapeHtml(leftProfile?.name ?? "Choose left profile")}</span>`,
      `<span class="subtle-chip">${escapeHtml(rightProfile?.name ?? "Choose right profile")}</span>`,
      report ? `<span class="subtle-chip">${report.completed ? "Report ready" : "Collecting responses"}</span>` : `<span class="subtle-chip">Run one prompt across both selected profiles</span>`,
    ];
    benchmarkContext.innerHTML = chips.join("");
  }

  if (benchmarkProfileSummary) {
    benchmarkProfileSummary.innerHTML = [
      renderProfileSummaryCard("Left", leftProfile),
      renderProfileSummaryCard("Right", rightProfile),
    ].join("");
  }
}

export function renderBenchmarkReportOverlay(state: HermesState): void {
  const overlay = document.querySelector<HTMLElement>("#benchmark-report-overlay");
  const content = document.querySelector<HTMLElement>("#benchmark-report-content");
  const sort = document.querySelector<HTMLSelectElement>("#benchmark-sort");
  if (!overlay || !content || !sort) {
    return;
  }

  const report = getCurrentBenchmarkReport(state);
  overlay.hidden = !(state.ui.benchmarkReportOpen && report);
  overlay.setAttribute("aria-hidden", overlay.hidden ? "true" : "false");
  sort.value = state.ui.benchmarkSort;

  if (!report) {
    content.innerHTML = `<p class="empty small-empty">Run a benchmark first to compare responses.</p>`;
    return;
  }

  const entries = sortBenchmarkEntries(report.entries, state.ui.benchmarkSort);
  const recommendedEntry = getRecommendedBenchmarkEntry(entries);
  const completedCount = entries.filter((entry) => entry.status === "completed").length;
  const fastestEntry = getBestEntry(entries, (entry) => Number(entry.kpis.last_latency_ms ?? Number.POSITIVE_INFINITY));
  const leanestEntry = getBestEntry(entries, (entry) => Number(entry.kpis.total_tokens ?? Number.POSITIVE_INFINITY));
  const totalErrors = entries.reduce((sum, entry) => sum + Number(entry.kpis.error_count ?? 0), 0);

  content.innerHTML = `
    <section class="benchmark-report-hero">
      <div class="benchmark-report-hero-copy">
        <p class="timeline-empty-kicker">Source conversation</p>
        <h3>${escapeHtml(report.source_title)}</h3>
        <p>${escapeHtml(report.prompt_preview || "Benchmark prompt captured.")}</p>
      </div>
      <article class="benchmark-report-decision-card${recommendedEntry ? " winner" : ""}">
        <span class="benchmark-report-decision-label">Recommended target</span>
        <strong>${escapeHtml(recommendedEntry ? getEntryLabel(recommendedEntry) : report.completed ? "No finished target" : "Waiting for the first finished run")}</strong>
        <p>${escapeHtml(describeBenchmarkDecision(report.completed, recommendedEntry))}</p>
        <div class="benchmark-report-decision-meta">
          <span class="subtle-chip">Group ${escapeHtml(report.group_id.slice(0, 8))}</span>
          <span class="subtle-chip">${report.completed ? "Complete" : "Running"}</span>
          ${recommendedEntry ? `<span class="subtle-chip">${escapeHtml(`${formatNumber(recommendedEntry.kpis.last_latency_ms)} ms • ${Number(recommendedEntry.kpis.total_tokens ?? 0)} tokens`)}</span>` : ""}
        </div>
      </article>
    </section>
    <section class="benchmark-report-kpi-strip">
      ${renderBenchmarkKpiCard("Completed", `${completedCount}/${entries.length}`, report.completed ? "All compared targets finished." : "Hermes is still collecting responses.")}
      ${renderBenchmarkKpiCard("Fastest", fastestEntry ? `${formatNumber(fastestEntry.kpis.last_latency_ms)} ms` : "—", fastestEntry ? getEntryLabel(fastestEntry) : "No timing data yet.")}
      ${renderBenchmarkKpiCard("Leanest", leanestEntry ? `${Number(leanestEntry.kpis.total_tokens ?? 0)} tokens` : "—", leanestEntry ? getEntryLabel(leanestEntry) : "No token data yet.")}
      ${renderBenchmarkKpiCard("Errors", String(totalErrors), totalErrors ? "Errors matter more than speed in the recommendation." : "No errors recorded across compared targets.")}
    </section>
    <section class="benchmark-report-section">
      <div class="benchmark-report-section-header">
        <div class="benchmark-report-section-copy">
          <p class="timeline-empty-kicker">Comparison matrix</p>
          <h4>Target breakdown</h4>
          <p>Scan status, latency, token use, and prompt/completion ratios side by side before opening the raw evidence.</p>
        </div>
      </div>
      <div class="benchmark-report-matrix">
        ${entries.map((entry) => renderBenchmarkMatrixCard(entry, recommendedEntry?.session_id === entry.session_id)).join("")}
      </div>
    </section>
    <section class="benchmark-report-section">
      <div class="benchmark-report-section-header">
        <div class="benchmark-report-section-copy">
          <p class="timeline-empty-kicker">Evidence</p>
          <h4>Raw response snapshots</h4>
          <p>Use the evidence view to compare the actual outputs after the recommendation and KPI scan.</p>
        </div>
      </div>
      <div class="benchmark-report-evidence-list">
        ${entries.map((entry) => renderBenchmarkEvidenceCard(entry)).join("")}
      </div>
    </section>
  `;
}

function renderBenchmarkCard(entry: BenchmarkEntry): string {
  const label = String(entry.target.label ?? entry.target.model ?? entry.title ?? "Benchmark target");
  const model = String(entry.target.model ?? entry.title ?? "");
  const latency = formatNumber(entry.kpis.last_latency_ms);
  const tokens = Number(entry.kpis.total_tokens ?? 0);
  const errors = Number(entry.kpis.error_count ?? 0);
  const body = entry.response_text || entry.error_message || (entry.status === "running" ? "Running benchmark response..." : "Waiting for response...");

  return `
    <article class="benchmark-card" data-status="${escapeHtml(entry.status)}">
      <div class="benchmark-card-header">
        <div>
          <strong>${escapeHtml(label)}</strong>
          <p>${escapeHtml(model)}</p>
        </div>
        <span class="state-pill" data-state="${escapeHtml(getBenchmarkState(entry.status))}">${escapeHtml(entry.status)}</span>
      </div>
      <div class="benchmark-card-metrics">
        <span class="subtle-chip">${escapeHtml(`${latency} ms`)}</span>
        <span class="subtle-chip">${escapeHtml(`${tokens} tokens`)}</span>
        <span class="subtle-chip">${escapeHtml(`${errors} errors`)}</span>
      </div>
      <pre class="benchmark-card-body">${escapeHtml(body)}</pre>
      <div class="benchmark-card-footer">
        <span class="meta-chip">${escapeHtml(entry.updated_at ? formatTime(entry.updated_at) : "Pending")}</span>
        <button type="button" class="inline-action" data-action="switch-session" data-session-id="${escapeHtml(entry.session_id)}">Open Session</button>
      </div>
    </article>
  `;
}

function renderBenchmarkPane(
  entry: BenchmarkEntry | null,
  profile: LlmProfileConfig | null,
  complete: boolean,
  fallbackLabel: string,
): string {
  if (!entry) {
    return `
      <section class="timeline-empty-state benchmark-pane-empty">
        <p class="timeline-empty-kicker">${escapeHtml(profile?.name ?? fallbackLabel)}</p>
        <h2>${escapeHtml(profile ? getProfileTarget(profile) : "Choose AI profile")}</h2>
        <p>${escapeHtml(complete ? "No response captured for this profile." : profile ? "This side is ready. Send one benchmark prompt to compare both selected profiles." : "Choose a saved AI profile above for this side of the benchmark split." )}</p>
      </section>
    `;
  }

  const body = entry.response_text || entry.error_message || (entry.status === "running" ? "Waiting for the model response..." : "Benchmark response pending.");
  return `
    <article class="benchmark-pane-card" data-status="${escapeHtml(entry.status)}">
      <div class="benchmark-pane-card-header">
        <div>
          <p class="timeline-empty-kicker">${escapeHtml(getEntryLabel(entry))}</p>
          <h3>${escapeHtml(String(entry.target.model ?? getProfileTarget(profile) ?? "Target"))}</h3>
        </div>
        <span class="state-pill" data-state="${escapeHtml(getBenchmarkState(entry.status))}">${escapeHtml(entry.status)}</span>
      </div>
      <pre class="benchmark-pane-card-body">${escapeHtml(body)}</pre>
      <div class="benchmark-pane-card-footer">
        <span class="meta-chip">${escapeHtml(entry.updated_at ? formatTime(entry.updated_at) : "Pending")}</span>
        <button type="button" class="inline-action" data-action="switch-session" data-session-id="${escapeHtml(entry.session_id)}">Open Session</button>
      </div>
    </article>
  `;
}

function renderBenchmarkKpiCard(label: string, value: string, detail: string): string {
  return `
    <article class="benchmark-report-kpi-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <p>${escapeHtml(detail)}</p>
    </article>
  `;
}

function renderBenchmarkMatrixCard(entry: BenchmarkEntry, recommended: boolean): string {
  return `
    <article class="benchmark-report-matrix-card${recommended ? " recommended" : ""}">
      <div class="benchmark-report-matrix-header">
        <div class="benchmark-report-model">
          <span class="benchmark-report-card-kicker">${escapeHtml(recommended ? "Recommended" : "Compared target")}</span>
          <strong>${escapeHtml(getEntryLabel(entry))}</strong>
          <span>${escapeHtml(String(entry.target.model ?? "Model pending"))}</span>
        </div>
        <div class="benchmark-report-matrix-status">
          <span class="state-pill" data-state="${escapeHtml(getBenchmarkState(entry.status))}">${escapeHtml(entry.status)}</span>
          ${recommended ? '<span class="tag">Best signal</span>' : ""}
        </div>
      </div>
      <div class="benchmark-report-matrix-metrics">
        <div class="benchmark-report-metric-pair">
          <span>Latency</span>
          <strong>${escapeHtml(`${formatNumber(entry.kpis.last_latency_ms)} ms`)}</strong>
        </div>
        <div class="benchmark-report-metric-pair">
          <span>Total Tokens</span>
          <strong>${escapeHtml(String(Number(entry.kpis.total_tokens ?? 0)))}</strong>
        </div>
        <div class="benchmark-report-metric-pair">
          <span>Prompt Tokens</span>
          <strong>${escapeHtml(String(Number(entry.kpis.prompt_tokens ?? 0)))}</strong>
        </div>
        <div class="benchmark-report-metric-pair">
          <span>Completion Tokens</span>
          <strong>${escapeHtml(String(Number(entry.kpis.completion_tokens ?? 0)))}</strong>
        </div>
        <div class="benchmark-report-metric-pair">
          <span>Errors</span>
          <strong>${escapeHtml(String(Number(entry.kpis.error_count ?? 0)))}</strong>
        </div>
        <div class="benchmark-report-metric-pair">
          <span>Updated</span>
          <strong>${escapeHtml(entry.updated_at ? formatTime(entry.updated_at) : "Pending")}</strong>
        </div>
      </div>
      <p class="benchmark-report-matrix-note">${escapeHtml(truncateText(entry.response_text || entry.error_message || entry.status, 180))}</p>
    </article>
  `;
}

function renderBenchmarkEvidenceCard(entry: BenchmarkEntry): string {
  const body = entry.response_text || entry.error_message || (entry.status === "running" ? "Benchmark response still in progress." : "No response captured for this target yet.");
  return `
    <article class="benchmark-report-evidence-card">
      <div class="benchmark-report-evidence-header">
        <div class="benchmark-report-model">
          <strong>${escapeHtml(getEntryLabel(entry))}</strong>
          <span>${escapeHtml(String(entry.target.model ?? "Model pending"))}</span>
        </div>
        <div class="benchmark-report-matrix-status">
          <span class="state-pill" data-state="${escapeHtml(getBenchmarkState(entry.status))}">${escapeHtml(entry.status)}</span>
          <span class="meta-chip">${escapeHtml(entry.updated_at ? formatTime(entry.updated_at) : "Pending")}</span>
        </div>
      </div>
      <pre class="benchmark-report-evidence-body">${escapeHtml(body)}</pre>
    </article>
  `;
}

function getRecommendedBenchmarkEntry(entries: BenchmarkEntry[]): BenchmarkEntry | null {
  const completedEntries = entries.filter((entry) => entry.status === "completed");
  const pool = completedEntries.length ? completedEntries : entries;
  if (!pool.length) {
    return null;
  }

  return [...pool].sort((left, right) => getBenchmarkDecisionScore(left) - getBenchmarkDecisionScore(right))[0] ?? null;
}

function getBestEntry(entries: BenchmarkEntry[], valueOf: (entry: BenchmarkEntry) => number): BenchmarkEntry | null {
  const pool = entries.filter((entry) => entry.status === "completed");
  if (!pool.length) {
    return null;
  }
  return [...pool].sort((left, right) => valueOf(left) - valueOf(right))[0] ?? null;
}

function getBenchmarkDecisionScore(entry: BenchmarkEntry): number {
  const errors = Number(entry.kpis.error_count ?? 0);
  const latency = Number(entry.kpis.last_latency_ms ?? 0);
  const tokens = Number(entry.kpis.total_tokens ?? 0);
  const runningPenalty = entry.status === "completed" ? 0 : 10_000_000;
  return (errors * 1_000_000_000) + runningPenalty + (latency * 1_000) + tokens;
}

function describeBenchmarkDecision(reportComplete: boolean, entry: BenchmarkEntry | null): string {
  if (!entry) {
    return reportComplete
      ? "Hermes did not capture a finished target, so there is no recommendation yet."
      : "Hermes is still waiting for the first target to finish before it can recommend one.";
  }

  const errors = Number(entry.kpis.error_count ?? 0);
  const latency = formatNumber(entry.kpis.last_latency_ms);
  const tokens = Number(entry.kpis.total_tokens ?? 0);
  if (!reportComplete && entry.status !== "completed") {
    return `${getEntryLabel(entry)} is the best current signal so far. Hermes will refine the recommendation when the remaining targets finish.`;
  }
  if (errors > 0) {
    return `${getEntryLabel(entry)} still leads because it has the strongest current tradeoff across stability, latency, and token usage: ${errors} error${errors === 1 ? "" : "s"}, ${latency} ms, ${tokens} tokens.`;
  }
  return `${getEntryLabel(entry)} leads on stability first, then latency and token usage: ${latency} ms, ${tokens} tokens, and no recorded errors.`;
}

function getCurrentBenchmarkReport(state: HermesState) {
  const report = state.ui.benchmarkReport;
  if (!report || !state.activeSessionId) {
    return null;
  }

  const activeSession = state.sessions.find((session) => session.session_id === state.activeSessionId);
  const metadata = (activeSession?.metadata ?? {}) as Record<string, unknown>;
  const sourceSessionId = metadata.kind === "benchmark_target"
    ? String(metadata.benchmark_source_session_id ?? "")
    : String(activeSession?.session_id ?? "");

  return sourceSessionId === report.source_session_id ? report : null;
}

function getSelectedBenchmarkProfile(state: HermesState, side: "left" | "right"): LlmProfileConfig | null {
  const profileName = side === "left" ? state.ui.benchmarkLeftProfileName : state.ui.benchmarkRightProfileName;
  if (!profileName) {
    return null;
  }
  return state.llmProfiles.find((profile) => profile.name === profileName) ?? null;
}

function getEntryLabel(entry: BenchmarkEntry): string {
  return String(entry.target.label ?? entry.target.model ?? entry.title ?? "Benchmark target");
}

function getProfileTarget(profile: LlmProfileConfig | null): string {
  if (!profile) {
    return "Choose AI profile";
  }
  return profile.provider === "local-cli"
    ? profile.cli_command?.trim() || "CLI runtime"
    : profile.model?.trim() || "Model pending";
}

function getProfileMeta(profile: LlmProfileConfig | null): string {
  if (!profile) {
    return "Pick a saved profile for this side.";
  }
  return `${humanizeProvider(profile.provider)} • ${getProfileTarget(profile)}`;
}

function humanizeProvider(provider: string): string {
  if (provider === "local-cli") return "Local CLI";
  if (provider === "github-copilot") return "GitHub Models";
  if (provider === "local") return "Local Compatible API";
  return "Hosted API";
}

function renderProfileSummaryCard(label: string, profile: LlmProfileConfig | null): string {
  return `
    <article class="benchmark-profile-summary-card">
      <span class="benchmark-profile-summary-label">${escapeHtml(label)}</span>
      <strong>${escapeHtml(profile?.name ?? "Choose profile")}</strong>
      <p>${escapeHtml(getProfileMeta(profile))}</p>
    </article>
  `;
}

function setMetric(selector: string, value: string): void {
  setText(selector, value);
}

function sortBenchmarkEntries(entries: BenchmarkEntry[], sortKey: HermesState["ui"]["benchmarkSort"]): BenchmarkEntry[] {
  const sorted = [...entries];
  sorted.sort((left, right) => {
    if (sortKey === "model") {
      return String(left.target.label ?? left.target.model ?? left.title).localeCompare(
        String(right.target.label ?? right.target.model ?? right.title),
      );
    }
    if (sortKey === "errors") {
      return Number(left.kpis.error_count ?? 0) - Number(right.kpis.error_count ?? 0);
    }
    if (sortKey === "tokens") {
      return Number(left.kpis.total_tokens ?? 0) - Number(right.kpis.total_tokens ?? 0);
    }
    return Number(left.kpis.last_latency_ms ?? 0) - Number(right.kpis.last_latency_ms ?? 0);
  });
  return sorted;
}

function getBenchmarkState(status: string): string {
  switch (status) {
    case "completed":
      return "completed";
    case "error":
      return "error";
    case "running":
      return "streaming";
    default:
      return "waiting_tool";
  }
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 1)}…`;
}

function formatNumber(value: unknown): string {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? Math.round(numeric).toString() : "0";
}