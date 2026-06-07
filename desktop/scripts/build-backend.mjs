import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, "../..");
const binariesDir = resolve(root, "desktop", "src-tauri", "binaries");

const triple = process.env.TAURI_TARGET_TRIPLE || detectTargetTriple();
const ext = process.platform === "win32" ? ".exe" : "";

const build = spawnSync("pyinstaller", ["--noconfirm", "hermes-backend.spec"], {
  cwd: root,
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const source = resolve(root, "dist", `hermes-backend${ext}`);
if (!existsSync(source)) {
  throw new Error(`PyInstaller output not found at ${source}`);
}

mkdirSync(binariesDir, { recursive: true });
const destination = resolve(binariesDir, `hermes-backend-${triple}${ext}`);
copyFileSync(source, destination);
console.log(`Copied backend sidecar to ${destination}`);

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
