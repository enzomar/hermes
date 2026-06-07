import { spawn } from "node:child_process";
import http from "node:http";

const host = "127.0.0.1";
const port = 1420;
const reusePollMs = 2000;
const devUrl = `http://${host}:${port}`;
const markers = ["<title>Hermes</title>", "/src/main.ts", "/@vite/client"];

const probe = await probeFrontend();

if (probe.status === "reuse") {
  console.log(`Reusing existing Hermes frontend dev server at ${devUrl}`);
  holdUntilStopped();
} else if (probe.status === "busy") {
  console.error(`Port ${port} is already in use, but the listener at ${devUrl} does not look like Hermes Vite.`);
  console.error("Stop the conflicting process or free the port, then retry `make start`.");
  process.exit(1);
} else {
  runVite();
}

function runVite() {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const child = spawn(npmCommand, ["run", "dev:vite"], {
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
    void probeFrontend()
      .then((nextProbe) => {
        if (nextProbe.status !== "reuse") {
          console.error(`The reused Hermes frontend dev server at ${devUrl} stopped responding.`);
          process.exit(1);
        }
      })
      .catch((error) => {
        console.error(`Failed while monitoring ${devUrl}: ${formatError(error)}`);
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

async function probeFrontend() {
  try {
    const body = await requestText();
    const isHermesVite = markers.every((marker) => body.includes(marker));
    return { status: isHermesVite ? "reuse" : "busy" };
  } catch (error) {
    if (isConnectionRefused(error)) {
      return { status: "free" };
    }
    return { status: "busy", error };
  }
}

function requestText() {
  return new Promise((resolve, reject) => {
    const request = http.get(
      {
        host,
        port,
        path: "/",
        timeout: 1500,
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          resolve(body);
        });
      },
    );

    request.on("timeout", () => {
      request.destroy(new Error(`Timed out while probing ${devUrl}`));
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