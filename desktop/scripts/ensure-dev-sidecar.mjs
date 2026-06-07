import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, "../..");
const binariesDir = resolve(root, "desktop", "src-tauri", "binaries");
const triple = process.env.TAURI_TARGET_TRIPLE || detectTargetTriple();
const ext = process.platform === "win32" ? ".exe" : "";
const destination = resolve(binariesDir, `hermes-backend-${triple}${ext}`);

if (!existsSync(destination)) {
  mkdirSync(binariesDir, { recursive: true });
  const content = process.platform === "win32" ? "Hermes dev sidecar placeholder\r\n" : "#!/bin/sh\nexit 0\n";
  writeFileSync(destination, content, "utf8");
  if (process.platform !== "win32") {
    chmodSync(destination, 0o755);
  }
  console.log(`Created dev sidecar placeholder at ${destination}`);
}

function detectTargetTriple() {
  const key = `${process.platform}:${process.arch}`;
  const table = {
    "darwin:arm64": "aarch64-apple-darwin",
    "darwin:x64": "x86_64-apple-darwin",
    "linux:arm64": "aarch64-unknown-linux-gnu",
    "linux:x64": "x86_64-unknown-linux-gnu",
    "win32:arm64": "aarch64-pc-windows-msvc",
    "win32:x64": "x86_64-pc-windows-msvc",
  };
  const triple = table[key];
  if (!triple) {
    throw new Error(`Unsupported platform/arch combination: ${key}`);
  }
  return triple;
}