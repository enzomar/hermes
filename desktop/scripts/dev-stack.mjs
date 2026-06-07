import { spawn } from "node:child_process";
import http from "node:http";

const host = process.env.HERMES_API_HOST || "127.0.0.1";
const preferredPort = normalizePort(process.env.HERMES_API_PORT, 8765);
const maxPortAttempts = 25;
const healthPath = "/api/health";

const selection = await selectBackendPort();
const backendUrl = `http://${host}:${selection.port}`;
const sharedEnv = {
  ...process.env,
  HERMES_API_HOST: host,
  HERMES_API_PORT: String(selection.port),
  VITE_HERMES_API_BASE: backendUrl,
  VITE_HERMES_WS_URL: `ws://${host}:${selection.port}/ws`,
};

if (selection.status === "reuse") {
  console.log(`Reusing Hermes backend at ${backendUrl}`);
} else if (selection.port !== preferredPort) {
  console.log(`Preferred Hermes backend port ${preferredPort} is busy. Using ${selection.port} instead.`);
} else {
  console.log(`Using Hermes backend port ${selection.port}.`);
}

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const children = [
  spawn(npmCommand, ["run", "dev"], { stdio: "inherit", env: sharedEnv }),
  spawn(npmCommand, ["run", "backend:dev"], { stdio: "inherit", env: sharedEnv }),
];

let exitCode = 0;
let exitSignal = null;
let shuttingDown = false;

const stopChildren = (signal = "SIGTERM") => {
  for (const child of children) {
    if (!child.killed) {
      child.kill(signal);
    }
  }
};

const finalizeIfDone = () => {
  const allDone = children.every((child) => child.exitCode !== null || child.signalCode !== null);
  if (!allDone) {
    return;
  }
  if (exitSignal) {
    process.kill(process.pid, exitSignal);
    return;
  }
  process.exit(exitCode);
};

for (const child of children) {
  child.on("exit", (code, signal) => {
    if (!shuttingDown) {
      shuttingDown = true;
      exitCode = code ?? 0;
      exitSignal = signal ?? null;
      stopChildren(signal ?? "SIGTERM");
    }
    finalizeIfDone();
  });
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    if (!shuttingDown) {
      shuttingDown = true;
      exitSignal = signal;
      stopChildren(signal);
    }
    finalizeIfDone();
  });
}

async function selectBackendPort() {
  for (let offset = 0; offset < maxPortAttempts; offset += 1) {
    const port = preferredPort + offset;
    const probe = await probeBackend(port);
    if (probe.status === "reuse") {
      return { port, status: "reuse" };
    }
    if (probe.status === "free") {
      return { port, status: "free" };
    }
  }

  throw new Error(`Could not find a free Hermes backend port starting at ${preferredPort}.`);
}

async function probeBackend(port) {
  try {
    const payload = await requestJson(port);
    const isHermes =
      payload &&
      typeof payload === "object" &&
      payload.status === "ok" &&
      Array.isArray(payload.servers) &&
      typeof payload.tools === "number";
    return { status: isHermes ? "reuse" : "busy" };
  } catch (error) {
    if (isConnectionRefused(error)) {
      return { status: "free" };
    }
    return { status: "busy", error };
  }
}

function requestJson(port) {
  return new Promise((resolve, reject) => {
    const request = http.get(
      {
        host,
        port,
        path: healthPath,
        timeout: 1500,
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(error);
          }
        });
      },
    );

    request.on("timeout", () => {
      request.destroy(new Error(`Timed out while probing http://${host}:${port}${healthPath}`));
    });
    request.on("error", reject);
  });
}

function isConnectionRefused(error) {
  return error && typeof error === "object" && "code" in error && error.code === "ECONNREFUSED";
}

function normalizePort(rawValue, fallback) {
  const parsed = Number.parseInt(String(rawValue ?? fallback), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}