import path from "node:path";
import { build, type Connect, type Plugin } from "vite";

// Node-side build code for the runner page (ARCHITECTURE.md §7.1), wired by vite.config.ts. It lives outside src/, so it
// never enters the app's module graph.

/** The page's entry, relative to the web package root. */
const BOOTSTRAP_ENTRY = "src/runner/page/main.ts";

/** Changes under this directory, relative to the web package root, invalidate the dev server's bootstrap. */
const RUNNER_SOURCE_DIR = "src/runner";

/** The runner page's directory as served. */
const RUNNER_DIRECTORY = "/__runner/";

/** The classic bootstrap that public/__runner/index.html loads. */
const RUNNER_BOOTSTRAP_PATH = "/__runner/bootstrap.js";

/**
 * The runner path's enforced policy of ARCHITECTURE.md §10.1 (C3), sent by the dev and preview servers too, so the
 * runner behaves locally as on the deploy, where `public/_headers` sends it.
 */
export const RUNNER_CONTENT_SECURITY_POLICY = "sandbox allow-scripts; frame-ancestors 'self'; script-src 'self' 'unsafe-eval'; object-src 'none'; base-uri 'none'";

/**
 * Builds the runner bootstrap as one classic IIFE (ARCHITECTURE.md §7.1): a nested library build of the page's
 * entry, kept in memory. A classic script loads in the opaque-origin runner document, where a module script would be
 * refused (its CORS request carries `Origin: null`).
 */
export async function buildRunnerBootstrap(root: string): Promise<string> {
  const result = await build({
    configFile: false,
    envDir: false,
    publicDir: false,
    root,
    logLevel: "warn",
    build: {
      write: false,
      emptyOutDir: false,
      copyPublicDir: false,
      sourcemap: false,
      minify: true,
      lib: { entry: path.resolve(root, BOOTSTRAP_ENTRY), formats: ["iife"], name: "disputeResolverRunner", fileName: () => "bootstrap.js" },
    },
  });
  const outputs = Array.isArray(result) ? result : [result];
  const chunks = outputs.flatMap((output) => ("output" in output ? output.output : [])).filter((item) => item.type === "chunk");
  const [chunk] = chunks;
  if (chunk === undefined || chunks.length !== 1) throw new Error(`The runner bootstrap build produced ${String(chunks.length)} chunks instead of one.`);
  return chunk.code;
}

function pathname(url: string | undefined): string {
  return new URL(url ?? "/", "http://localhost").pathname;
}

/** Adds the runner policy to every response under the runner's directory. */
const runnerPolicyHeaders: Connect.NextHandleFunction = (request, response, next) => {
  if (pathname(request.url).startsWith(RUNNER_DIRECTORY)) response.setHeader("Content-Security-Policy", RUNNER_CONTENT_SECURITY_POLICY);
  next();
};

/**
 * Emits `__runner/bootstrap.js` next to the static runner page in `vite build`, serves the same build from memory in
 * `vite dev`, and sends the runner policy on the runner's path in dev and preview (ARCHITECTURE.md §7.1, §7.4).
 */
export function runnerBootstrapPlugin(): Plugin {
  let root = process.cwd();

  return {
    name: "dispute-resolver:runner-bootstrap",
    configResolved(config) {
      root = config.root;
    },
    async generateBundle() {
      this.emitFile({ type: "asset", fileName: RUNNER_BOOTSTRAP_PATH.slice(1), source: await buildRunnerBootstrap(root) });
    },
    configureServer(server) {
      const sourceDir = path.resolve(server.config.root, RUNNER_SOURCE_DIR);
      let bootstrap: Promise<string> | undefined;
      server.watcher.on("change", (file) => {
        if (path.resolve(file).startsWith(sourceDir)) bootstrap = undefined;
      });

      server.middlewares.use(runnerPolicyHeaders);
      server.middlewares.use((request, response, next) => {
        if (pathname(request.url) !== RUNNER_BOOTSTRAP_PATH) {
          next();
          return;
        }
        bootstrap ??= buildRunnerBootstrap(server.config.root);
        bootstrap.then(
          (code) => {
            response.setHeader("Content-Type", "text/javascript; charset=utf-8");
            response.setHeader("Cache-Control", "no-store");
            response.end(code);
          },
          (error: unknown) => {
            bootstrap = undefined;
            next(error);
          },
        );
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use(runnerPolicyHeaders);
    },
  };
}
