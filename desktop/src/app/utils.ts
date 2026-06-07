import type { JsonObject, MessageState, TimelineDisclosure } from "./types";

export async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textArea = document.createElement("textarea");
  textArea.value = value;
  textArea.setAttribute("readonly", "true");
  textArea.style.position = "absolute";
  textArea.style.left = "-9999px";
  document.body.append(textArea);
  textArea.select();
  document.execCommand("copy");
  textArea.remove();
}

export function getTokenUsageLabel(value: unknown): string {
  if (!hasDisplayValue(value) || typeof value !== "object" || value === null) {
    return "";
  }
  const usage = value as JsonObject;
  const totalTokens = Number(usage.total_tokens ?? 0);
  return totalTokens ? `${totalTokens} tok` : "";
}

export function getCacheStatusLabel(value: unknown): string {
  if (!value || typeof value !== "object") {
    return "";
  }

  const payload = value as JsonObject;
  const explicit = String(payload.cache_status ?? payload.cache ?? payload.response_json?.result?.cacheStatus ?? "").trim();
  if (explicit) {
    return explicit.toUpperCase();
  }
  if (payload.cache_hit === true || payload.is_cached === true || payload.cached === true || payload.response_json?.result?.isCached === true) {
    return "HIT";
  }
  if (payload.cache_miss === true || payload.response_json?.result?.isCached === false) {
    return "MISS";
  }
  return "";
}

export function renderTag(value: string): string {
  const lower = value.toLowerCase();
  const className =
    lower.includes("error") || lower.includes("failed") || lower.includes("miss")
      ? " error"
      : lower.includes("success") || lower.includes("cached") || lower.includes("hit")
        ? " ok"
        : "";
  return `<span class="tag${className}">${escapeHtml(value)}</span>`;
}

export function getDefaultStatusLabel(stateValue: MessageState): string {
  switch (stateValue) {
    case "idle":
      return "idle";
    case "streaming":
      return "streaming";
    case "waiting_tool":
      return "waiting tool";
    case "error":
      return "failed";
    case "completed":
      return "completed";
  }
}

export function buildPreview(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
}

export function formatJsonValue(value: unknown, fallback = "Not available."): string {
  if (!hasDisplayValue(value)) {
    return fallback;
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function hasDisplayValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (typeof value === "object") {
    return Object.keys(value as Record<string, unknown>).length > 0;
  }
  return true;
}

export function compactText(values: Array<string | null | undefined>): string[] {
  return values.filter((value): value is string => Boolean(value));
}

export function compactDisclosures(values: Array<TimelineDisclosure | null>): TimelineDisclosure[] {
  return values.filter((value): value is TimelineDisclosure => Boolean(value));
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function setText(selector: string, value: string): void {
  const element = document.querySelector<HTMLElement>(selector);
  if (element) {
    element.textContent = value;
  }
}

export function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleTimeString();
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function getConsoleState(status: string): MessageState {
  if (status === "failed") {
    return "error";
  }
  if (status === "running") {
    return "streaming";
  }
  return "completed";
}