// @vitest-environment node
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Connect } from "vite";
import { EventEmitter } from "node:events";
import { beforeAll, describe, expect, it } from "vitest";
// The parser alone: the routing doubles index also renders React, which this Node-side test cannot load.
import { headerValues, parseNetlifyHeaders } from "../src/test/routing/netlifyHeaders";
import { RUNNER_CONTENT_SECURITY_POLICY, buildRunnerBootstrap, runnerBootstrapPlugin } from "./runnerBootstrapPlugin";

const webRoot = fileURLToPath(new URL("..", import.meta.url));

type Hook = (...args: unknown[]) => unknown;

/** A plugin hook declared as a function (the runner plugin declares no `{ handler }` objects). */
function hookHandler(hook: unknown): Hook {
  if (typeof hook !== "function") throw new Error("The plugin does not declare this hook as a function.");
  return hook as Hook;
}

/** Sends one request through the middlewares a server hook installed and returns the headers set on the response. */
function respond(middlewares: Connect.NextHandleFunction[], url: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const response = {
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = value;
    },
  };
  const runFrom = (index: number): void => {
    middlewares[index]?.({ url } as Connect.IncomingMessage, response as never, () => {
      runFrom(index + 1);
    });
  };
  runFrom(0);
  return headers;
}

describe("runner bootstrap build (ARCHITECTURE.md §7.1)", () => {
  let bootstrap = "";

  beforeAll(async () => {
    bootstrap = await buildRunnerBootstrap(webRoot);
  }, 60_000);

  it("§7.1: the bootstrap is one classic IIFE without module syntax", () => {
    expect(bootstrap.trimStart().startsWith("(function")).toBe(true);
    expect(bootstrap).not.toMatch(/\bimport\s*[{*\w(]|\bexport\s*[{*\w]|\brequire\(/);
  });

  it("§7.1: the bootstrap bundles neither React nor core", () => {
    expect(bootstrap).not.toMatch(/react|@dispute-resolver|zod/i);
    expect(bootstrap).toContain("dr-runner/run");
  });

  it("C7: the bootstrap is pure ASCII, so its own charset can never garble it", () => {
    expect(Array.from(bootstrap).filter((character) => (character.codePointAt(0) ?? 0) > 0x7e)).toEqual([]);
  });

  it("§7.1: vite build emits the bootstrap next to the static runner page", async () => {
    const plugin = runnerBootstrapPlugin();
    hookHandler(plugin.configResolved)({ root: webRoot });
    const emitted: unknown[] = [];
    await hookHandler(plugin.generateBundle).call({ emitFile: (file: unknown) => emitted.push(file) });
    expect(emitted).toEqual([{ type: "asset", fileName: "__runner/bootstrap.js", source: bootstrap }]);
  }, 60_000);
});

describe("runner policy on the preview server (C3, ARCHITECTURE.md §7.4)", () => {
  function previewMiddlewares(): Connect.NextHandleFunction[] {
    const middlewares: Connect.NextHandleFunction[] = [];
    const server = { middlewares: { use: (middleware: Connect.NextHandleFunction) => middlewares.push(middleware) } };
    hookHandler(runnerBootstrapPlugin().configurePreviewServer)(server);
    return middlewares;
  }

  it("C3: the runner's files carry its enforced sandbox policy", () => {
    for (const url of ["/__runner/index.html", "/__runner/bootstrap.js", "/__runner/index.html?x=1"]) {
      expect(respond(previewMiddlewares(), url)["content-security-policy"]).toBe(RUNNER_CONTENT_SECURITY_POLICY);
    }
    expect(RUNNER_CONTENT_SECURITY_POLICY).toContain("sandbox allow-scripts;");
    expect(RUNNER_CONTENT_SECURITY_POLICY).toContain("frame-ancestors 'self'");
    expect(RUNNER_CONTENT_SECURITY_POLICY).not.toContain("allow-same-origin");
  });

  it("C3, §7.4: the runner rule of public/_headers sends exactly the policy the dev and preview servers send", async () => {
    const rules = parseNetlifyHeaders(await readFile(new URL("../public/_headers", import.meta.url), "utf8"));
    const runnerRules = rules.filter((rule) => rule.pattern === "/__runner/*");
    expect(runnerRules).toHaveLength(1);
    expect(headerValues(runnerRules, "/__runner/index.html", "Content-Security-Policy")).toEqual([RUNNER_CONTENT_SECURITY_POLICY]);
  });

  it("C3: no app path gets the runner policy", () => {
    for (const url of ["/", "/1/cases/1650", "/__runner", "/assets/index.js"]) {
      expect(respond(previewMiddlewares(), url)["content-security-policy"]).toBeUndefined();
    }
  });
});

describe("runner bootstrap on the dev server (ARCHITECTURE.md §7.1)", () => {
  it("§7.1: vite dev serves the same bootstrap from memory, with the runner policy", async () => {
    const middlewares: Connect.NextHandleFunction[] = [];
    const server = {
      config: { root: webRoot },
      watcher: new EventEmitter(),
      middlewares: { use: (middleware: Connect.NextHandleFunction) => middlewares.push(middleware) },
    };
    hookHandler(runnerBootstrapPlugin().configureServer)(server);

    const headers: Record<string, string> = {};
    const body = await new Promise<unknown>((resolve, reject) => {
      const response = {
        setHeader(name: string, value: string) {
          headers[name.toLowerCase()] = value;
        },
        end: resolve,
      };
      const runFrom = (index: number): void => {
        const middleware = middlewares[index];
        if (middleware === undefined) {
          reject(new Error("No middleware answered /__runner/bootstrap.js."));
          return;
        }
        middleware({ url: "/__runner/bootstrap.js" } as Connect.IncomingMessage, response as never, () => {
          runFrom(index + 1);
        });
      };
      runFrom(0);
    });

    expect(body).toBe(await buildRunnerBootstrap(webRoot));
    expect(headers["content-type"]).toBe("text/javascript; charset=utf-8");
    expect(headers["content-security-policy"]).toBe(RUNNER_CONTENT_SECURITY_POLICY);
  }, 60_000);
});
