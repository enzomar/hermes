import { spawn } from "node:child_process";
import http from "node:http";

const host = process.env.HERMES_API_HOST || "127.0.0.1";
const port = normalizePort(process.env.HERMES_API_PORT, 8765);
const reusePollMs = 2000;
const healthPath = "/api/health";
const backendUrl = `http://${host}:${port}`;

const probe = await probeBackend();

if (probe.status === "reuse") {
  console.log(`Reusing existing Hermes backend at ${backendUrl}`);
  holdUntilStopped();
} else if (probe.status === "busy") {
  console.error(`Port ${port} is already in use, but the listener at ${backendUrl}${healthPath} does not look like Hermes.`);
  console.error("Stop the conflicting process or free the port, then retry `make start`.");
  process.exit(1);
} else {
  runBackend();
}

function runBackend() {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const child = spawn(npmCommand, ["run", "backend:serve", "--", "--host", host, "--port", String(port)], {
    stdio: "inherit",
    env: process.env,
  });

  const forwardSignal = (signal) => {
    if (!child.killed) {
      child.kill(signal);
    }
  };

  process.once("SIGINT", () => forwardSignal("SIGINT"));
  process.once("SIGTERM", () => forwardSignal("SIGTERM"));

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

function holdUntilStopped() {
  let checking = false;
  const timer = setInterval(() => {
    if (checking) {
      return;
    }
    checking = true;
    void probeBackend()
      .then((nextProbe) => {
        if (nextProbe.status !== "reuse") {
          console.error(`The reused Hermes backend at ${backendUrl} stopped responding.`);
          process.exit(1);
        }
      })
      .catch((error) => {
        console.error(`Failed while monitoring ${backendUrl}: ${formatError(error)}`);
        process.exit(1);
      })
      .finally(() => {
        checking = false;
      });
  }, reusePollMs);

  const stop = () => {
    clearInterval(timer);
    process.exit(0);
  };

  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

async function probeBackend() {
  try {
    const payload = await requestJson();
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

function requestJson() {
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
      request.destroy(new Error(`Timed out while probing ${backendUrl}${healthPath}`));
    });
    request.on("error", reject);
  });
}

function isConnectionRefused(error) {
  return error && typeof error === "object" && "code" in error && error.code === "ECONNREFUSED";
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

function normalizePort(rawValue, fallback) {
  const parsed = Number.parseInt(String(rawValue ?? fallback), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}