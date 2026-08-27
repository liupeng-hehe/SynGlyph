/**
 * Start `next dev`, using DEFAULT_PORT (default 3002) if free; otherwise the next free port.
 * If PORT is set in the environment, that port is required (exit 1 if busy).
 */
import { createServer } from "net";
import { spawn } from "child_process";
import { createRequire } from "module";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = join(__dirname, "..");

const require = createRequire(import.meta.url);
const nextPkgDir = dirname(require.resolve("next/package.json"));
const nextBin = join(nextPkgDir, "dist/bin/next");

function portFree(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
  });
}

async function pickPort(start, maxAttempts = 64) {
  for (let i = 0; i < maxAttempts; i++) {
    const p = start + i;
    if (await portFree(p)) return p;
  }
  throw new Error(
    `No free port in range ${start}–${start + maxAttempts - 1}`,
  );
}

async function main() {
  const explicit = process.env.PORT;
  let port;

  if (explicit !== undefined && explicit !== "") {
    port = Number(explicit);
    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      console.error(`[web-presentation] Invalid PORT: ${explicit}`);
      process.exit(1);
    }
    if (!(await portFree(port))) {
      console.error(`[web-presentation] Port ${port} is in use (PORT is set).`);
      process.exit(1);
    }
  } else {
    const start = Number(process.env.DEFAULT_PORT ?? "3002");
    if (!Number.isFinite(start) || start < 1 || start > 65535) {
      console.error(`[web-presentation] Invalid DEFAULT_PORT`);
      process.exit(1);
    }
    port = await pickPort(start);
    if (port !== start) {
      console.info(
        `[web-presentation] Port ${start} is in use; starting on ${port}`,
      );
    }
  }

  const extraArgs = process.argv.slice(2);

  const child = spawn(
    process.execPath,
    [nextBin, "dev", "-p", String(port), ...extraArgs],
    {
      cwd: appRoot,
      stdio: "inherit",
      env: { ...process.env, PORT: String(port) },
    },
  );

  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 1);
  });
}

main().catch((err) => {
  console.error("[web-presentation]", err);
  process.exit(1);
});
