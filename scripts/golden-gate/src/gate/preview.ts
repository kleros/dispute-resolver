import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { WEB_DIR, WEB_DIST_DIR } from "../paths";

/** How long `vite preview` may take to answer before the gate gives up. */
const PREVIEW_START_LIMIT_MS = 60_000;

/** Interval between readiness probes of the preview server. */
const PROBE_INTERVAL_MS = 250;

/** How many lines of a failed build's output are shown. */
const BUILD_LOG_TAIL = 40;

/** The runner policy `vite preview` must send on the runner page (ARCHITECTURE.md §10.1), proof it serves the built app. */
const RUNNER_POLICY_DIRECTIVE = "sandbox allow-scripts";

const RUNNER_FILES = ["__runner/index.html", "__runner/bootstrap.js"];

/** The web package's own Vite command line, run with this Node binary rather than through a command found on `PATH`. */
function viteCommand(): string {
  const vitePackage = createRequire(resolve(WEB_DIR, "package.json")).resolve("vite/package.json");
  return resolve(dirname(vitePackage), "bin/vite.js");
}

function startVite(args: readonly string[], options: { readonly capture: boolean }): ChildProcess {
  return spawn(process.execPath, [viteCommand(), ...args], { cwd: WEB_DIR, stdio: options.capture ? ["ignore", "pipe", "pipe"] : "ignore", detached: !options.capture });
}

/**
 * Builds the web app's bundle with its own Vite configuration (`vite build` in packages/web, the second half of the
 * package's `build` script; its type check is the package's own `typecheck`) and checks the runner page is in it.
 */
export async function buildWebApp(): Promise<void> {
  const { code, output } = await new Promise<{ readonly code: number | null; readonly output: string }>((done, fail) => {
    const child = startVite(["build"], { capture: true });
    let text = "";
    child.stdout?.on("data", (chunk: Buffer) => (text += chunk.toString()));
    child.stderr?.on("data", (chunk: Buffer) => (text += chunk.toString()));
    child.on("error", fail);
    child.on("close", (exitCode) => {
      done({ code: exitCode, output: text });
    });
  });
  if (code !== 0) {
    const tail = output.trimEnd().split("\n").slice(-BUILD_LOG_TAIL).join("\n");
    throw new Error(`The web app does not build (exit code ${String(code)}). Last lines of the build:\n${tail}`);
  }
  assertBuilt();
}

/** Fails clearly when the built app lacks the runner page. */
export function assertBuilt(): void {
  const missing = RUNNER_FILES.filter((file) => !existsSync(resolve(WEB_DIST_DIR, file)));
  if (missing.length > 0) throw new Error(`packages/web/dist lacks ${missing.join(", ")}: build the web app first, or run without --skip-build.`);
}

/** A free TCP port on the loopback interface. */
function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const server = createServer();
    server.once("error", fail);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address === null || typeof address === "string") fail(new Error("No free port was assigned."));
        else done(address.port);
      });
    });
  });
}

/** The running preview server of the built app. */
export interface PreviewServer {
  readonly origin: string;
  stop(): Promise<void>;
}

async function runnerServed(origin: string): Promise<boolean> {
  try {
    const response = await fetch(`${origin}/__runner/index.html`);
    return response.ok && (response.headers.get("content-security-policy") ?? "").includes(RUNNER_POLICY_DIRECTIVE);
  } catch {
    return false;
  }
}

/** Stops the preview server and every process it started (it runs as the leader of its own process group). */
function stopChild(child: ChildProcess): Promise<void> {
  return new Promise((done) => {
    if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) {
      done();
      return;
    }
    child.once("exit", () => {
      done();
    });
    process.kill(-child.pid, "SIGTERM");
  });
}

/**
 * Starts `vite preview` of the built app on a free port and waits until it serves the runner page with its policy
 * header, or fails when the server exits or does not answer within `PREVIEW_START_LIMIT_MS`.
 */
export async function startPreview(): Promise<PreviewServer> {
  assertBuilt();
  const port = await freePort();
  const origin = `http://localhost:${String(port)}`;
  const child = startVite(["preview", "--port", String(port), "--strictPort"], { capture: false });
  const state = { exited: false };
  child.once("exit", () => {
    state.exited = true;
  });
  const deadline = Date.now() + PREVIEW_START_LIMIT_MS;
  while (!(await runnerServed(origin))) {
    if (state.exited) throw new Error("vite preview exited before serving the app.");
    if (Date.now() > deadline) {
      await stopChild(child);
      throw new Error(`vite preview did not serve /__runner/index.html with its policy within ${String(PREVIEW_START_LIMIT_MS / 1000)} s.`);
    }
    await sleep(PROBE_INTERVAL_MS);
  }
  return { origin, stop: () => stopChild(child) };
}
