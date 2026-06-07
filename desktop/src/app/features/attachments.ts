/**
 * Attachment handling — file reading, MIME detection, normalization.
 */

import type { PendingAttachment } from "../types";

export const MAX_CHAT_ATTACHMENTS = 6;
export const MAX_ATTACHMENT_BYTES = 64 * 1024;

const TEXT_ATTACHMENT_EXTENSIONS = new Set([
  "c", "cc", "cpp", "cs", "css", "csv", "go", "h", "hpp", "html", "ini", "java", "js", "json",
  "jsx", "kt", "md", "mjs", "py", "rb", "rs", "scss", "sh", "sql", "svg", "toml", "ts", "tsx",
  "txt", "xml", "yaml", "yml",
]);

export async function readPendingAttachment(file: File): Promise<PendingAttachment> {
  const truncated = file.size > MAX_ATTACHMENT_BYTES;
  const contentSlice = file.slice(0, MAX_ATTACHMENT_BYTES);
  const rawContent = await contentSlice.text();
  const normalizedContent = normalizeAttachmentContent(file, rawContent, truncated);

  return {
    name: file.name,
    mimeType: file.type || guessAttachmentMimeType(file.name),
    size: file.size,
    content: normalizedContent,
    truncated,
  };
}

function normalizeAttachmentContent(file: File, rawContent: string, truncated: boolean): string {
  const sanitized = rawContent.replace(/\u0000/g, "").trimEnd();
  if (!looksTextAttachment(file, sanitized)) {
    return `[Binary or unsupported attachment omitted: ${file.name}]`;
  }
  if (!truncated) {
    return sanitized;
  }
  return `${sanitized}\n\n[Attachment truncated to ${MAX_ATTACHMENT_BYTES} bytes before sending.]`;
}

function looksTextAttachment(file: File, content: string): boolean {
  if (file.type.startsWith("text/")) return true;
  if (["application/json", "application/xml", "image/svg+xml"].includes(file.type)) return true;
  const extension = file.name.includes(".") ? file.name.split(".").pop()?.toLowerCase() ?? "" : "";
  if (TEXT_ATTACHMENT_EXTENSIONS.has(extension)) return true;
  return !/\u0000/.test(content);
}

export function guessAttachmentMimeType(fileName: string): string {
  const extension = fileName.includes(".") ? fileName.split(".").pop()?.toLowerCase() ?? "" : "";
  if (extension === "json") return "application/json";
  if (extension === "md") return "text/markdown";
  if (["yaml", "yml"].includes(extension)) return "application/yaml";
  return "text/plain";
}
