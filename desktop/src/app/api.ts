/**
 * Centralized API client for all backend HTTP calls.
 * Single point of configuration, error handling, and typing.
 */

import { API_BASE } from "./config";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly path: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Generic typed fetch wrapper.
 * All API calls in the app should go through this function.
 */
export async function request<T = any>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new ApiError(response.status, path, body || `Request failed: ${path} (${response.status})`);
  }
  return response.json() as Promise<T>;
}

// ─── Typed API methods ───────────────────────────────────────────────────────

export const api = {
  // Health
  health: () => request<{ status: string; servers: any[]; tools: number }>("/api/health"),

  // Bootstrap
  bootstrap: (sessionId?: string) => {
    const query = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : "";
    return request<any>(`/api/bootstrap${query}`);
  },

  // Sessions
  createSession: (title?: string) =>
    request<any>("/api/sessions", {
      method: "POST",
      body: JSON.stringify({ title: title ?? null }),
    }),

  deleteSession: (sessionId: string) =>
    request<any>(`/api/sessions/${encodeURIComponent(sessionId)}`, { method: "DELETE" }),

  renameSession: (sessionId: string, title: string) =>
    request<any>(`/api/sessions/${encodeURIComponent(sessionId)}`, {
      method: "PATCH",
      body: JSON.stringify({ title }),
    }),

  duplicateSession: (sessionId: string, title?: string) =>
    request<any>(`/api/sessions/${encodeURIComponent(sessionId)}/duplicate`, {
      method: "POST",
      body: JSON.stringify({ title: title ?? null }),
    }),

  // Chat
  sendMessage: (sessionId: string, message: string, attachments: any[] = []) =>
    request<any>("/api/chat", {
      method: "POST",
      body: JSON.stringify({ session_id: sessionId, message, attachments }),
    }),

  // Tools
  runTool: (sessionId: string, toolName: string, args: Record<string, unknown>, preferredServer?: string) =>
    request<{ result: any }>("/api/tools/run", {
      method: "POST",
      body: JSON.stringify({
        session_id: sessionId,
        tool_name: toolName,
        arguments: args,
        preferred_server: preferredServer ?? null,
      }),
    }),

  // MCP
  refreshMcp: () => request<any>("/api/mcp/refresh", { method: "POST" }),

  // Config
  getConfig: () => request<any>("/api/config"),
  updateConfig: (body: any) => request<any>("/api/config", { method: "PUT", body: JSON.stringify(body) }),
  testLlm: (body: any) => request<any>("/api/config/test/llm", { method: "POST", body: JSON.stringify(body) }),
  testMcp: () => request<any>("/api/config/test/mcp", { method: "POST" }),

  // MCP server management
  addMcpServer: (body: any) => request<any>("/api/config/mcp-server", { method: "POST", body: JSON.stringify(body) }),
  deleteMcpServer: (name: string) => request<any>(`/api/config/mcp-server/${encodeURIComponent(name)}`, { method: "DELETE" }),
  updateMcpServer: (name: string, body: any) =>
    request<any>(`/api/config/mcp-server/${encodeURIComponent(name)}`, { method: "PATCH", body: JSON.stringify(body) }),

  // Benchmarks
  runBenchmark: (body: any) => request<any>("/api/benchmarks/run", { method: "POST", body: JSON.stringify(body) }),
  getBenchmarkReport: (sessionId: string, groupId?: string) => {
    const params = new URLSearchParams({ session_id: sessionId });
    if (groupId) params.set("group_id", groupId);
    return request<any>(`/api/benchmarks/report?${params}`);
  },

  // Replay
  branchSession: (sourceSessionId: string, eventId: string, title?: string) =>
    request<any>("/api/replay/branch", {
      method: "POST",
      body: JSON.stringify({ source_session_id: sourceSessionId, event_id: eventId, title: title ?? null }),
    }),

  replayStep: (sessionId: string, cursor: number, step: number) =>
    request<any>(`/api/replay/step?session_id=${encodeURIComponent(sessionId)}&cursor=${cursor}&step=${step}`),

  replayTool: (eventId: string, sessionId?: string) =>
    request<any>("/api/replay/tool", {
      method: "POST",
      body: JSON.stringify({ event_id: eventId, session_id: sessionId ?? null }),
    }),

  // Lab API
  lab: {
    listDatasets: () => request<any>("/api/lab/datasets"),
    createDataset: (body: any) => request<any>("/api/lab/datasets", { method: "POST", body: JSON.stringify(body) }),
    getDataset: (id: string, version: number) => request<any>(`/api/lab/datasets/${encodeURIComponent(id)}/versions/${version}`),
    updateDataset: (id: string, body: any) => request<any>(`/api/lab/datasets/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(body) }),
    deleteDataset: (id: string, version: number) => request<any>(`/api/lab/datasets/${encodeURIComponent(id)}/versions/${version}`, { method: "DELETE" }),
    importDataset: (body: any) => request<any>("/api/lab/datasets/import", { method: "POST", body: JSON.stringify(body) }),
    exportDataset: (id: string, version: number) => request<any>(`/api/lab/datasets/${encodeURIComponent(id)}/versions/${version}/export`),

    listExperiments: () => request<any>("/api/lab/experiments"),
    createExperiment: (body: any) => request<any>("/api/lab/experiments", { method: "POST", body: JSON.stringify(body) }),
    getExperiment: (id: string) => request<any>(`/api/lab/experiments/${encodeURIComponent(id)}`),
    runExperiment: (id: string) => request<any>(`/api/lab/experiments/${encodeURIComponent(id)}/run`, { method: "POST" }),
    cancelExperiment: (id: string) => request<any>(`/api/lab/experiments/${encodeURIComponent(id)}/cancel`, { method: "POST" }),
    deleteExperiment: (id: string) => request<any>(`/api/lab/experiments/${encodeURIComponent(id)}`, { method: "DELETE" }),

    listRuns: (experimentId: string) => request<any>(`/api/lab/experiments/${encodeURIComponent(experimentId)}/runs`),
    getRun: (runId: string) => request<any>(`/api/lab/runs/${encodeURIComponent(runId)}`),
    getTrace: (runId: string) => request<any>(`/api/lab/runs/${encodeURIComponent(runId)}/trace`),
    rerun: (runId: string) => request<any>(`/api/lab/runs/${encodeURIComponent(runId)}/rerun`, { method: "POST" }),

    listResults: (experimentId: string) => request<any>(`/api/lab/experiments/${encodeURIComponent(experimentId)}/results`),
    setBaseline: (experimentId: string) => request<any>(`/api/lab/experiments/${encodeURIComponent(experimentId)}/set-baseline`, { method: "POST" }),
    getRegressionReport: (experimentId: string) => request<any>(`/api/lab/experiments/${encodeURIComponent(experimentId)}/regression-report`),

    listModelConfigs: () => request<any>("/api/lab/model-configs"),
    createModelConfig: (body: any) => request<any>("/api/lab/model-configs", { method: "POST", body: JSON.stringify(body) }),
    deleteModelConfig: (id: string) => request<any>(`/api/lab/model-configs/${encodeURIComponent(id)}`, { method: "DELETE" }),

    listWorkflowConfigs: () => request<any>("/api/lab/workflow-configs"),
    createWorkflowConfig: (body: any) => request<any>("/api/lab/workflow-configs", { method: "POST", body: JSON.stringify(body) }),
    deleteWorkflowConfig: (id: string) => request<any>(`/api/lab/workflow-configs/${encodeURIComponent(id)}`, { method: "DELETE" }),

    listMcpVersions: () => request<any>("/api/lab/mcp-versions"),
    registerMcpVersion: (body: any) => request<any>("/api/lab/mcp-versions", { method: "POST", body: JSON.stringify(body) }),
    deleteMcpVersion: (id: string) => request<any>(`/api/lab/mcp-versions/${encodeURIComponent(id)}`, { method: "DELETE" }),
    getMcpSchema: (id: string) => request<any>(`/api/lab/mcp-versions/${encodeURIComponent(id)}/schema`),
    registerToolVariant: (mcpVersionId: string, body: any) =>
      request<any>(`/api/lab/mcp-versions/${encodeURIComponent(mcpVersionId)}/tool-variants`, { method: "POST", body: JSON.stringify(body) }),

    listFixtures: () => request<any>("/api/lab/mock-fixtures"),
    createFixture: (body: any) => request<any>("/api/lab/mock-fixtures", { method: "POST", body: JSON.stringify(body) }),
    deleteFixture: (id: string) => request<any>(`/api/lab/mock-fixtures/${encodeURIComponent(id)}`, { method: "DELETE" }),
  },
} as const;
