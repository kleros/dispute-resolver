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

function hookHandler(hook: unknown): Hook {
  if (typeof hook !== "function") throw new Error("The plugin does not declare this hook as a function.");
  return hook as Hook;
}

/**
 * Sends one request through the middlewares a server hook installed: the headers set on the response, and the body it
 * ended with (`undefined` when every middleware passed it on).
 */
function respond(middlewares: Connect.NextHandleFunction[], url: string): Promise<{ readonly headers: Record<string, string>; readonly body: unknown }> {
  const headers: Record<string, string> = {};
  return new Promise((resolve) => {
    const response = {
      setHeader(name: string, value: string) {
        headers[name.toLowerCase()] = value;
      },
      end(body: unknown) {
        resolve({ headers, body });
      },
    };
    const runFrom = (index: number): void => {
      const middleware = middlewares[index];
      if (middleware === undefined) {
        resolve({ headers, body: undefined });
        return;
      }
      middleware({ url } as Connect.IncomingMessage, response as never, () => {
        runFrom(index + 1);
      });
    };
    runFrom(0);
  });
}

describe("runner bootstrap build", () => {
  let bootstrap = "";

  beforeAll(async () => {
    bootstrap = await buildRunnerBootstrap(webRoot);
  }, 60_000);

  it("the bootstrap is one classic IIFE without module syntax", () => {
    expect(bootstrap.trimStart().startsWith("(function")).toBe(true);
    expect(bootstrap).not.toMatch(/\bimport\s*[{*\w(]|\bexport\s*[{*\w]|\brequire\(/);
  });

  it("the bootstrap carries the runner protocol (run, accepted, version 2) and bundles neither React nor core", () => {
    expect(bootstrap).not.toMatch(/react|@dispute-resolver|zod/i);
    expect(bootstrap).toContain("dr-runner/run");
    expect(bootstrap).toContain("dr-runner/accepted");
    expect(bootstrap).toMatch(/version\s*[!=]==?\s*2\b/);
  });

  it("the bootstrap is pure ASCII, so its own charset can never garble it", () => {
    expect(Array.from(bootstrap).filter((character) => (character.codePointAt(0) ?? 0) > 0x7e)).toEqual([]);
  });

  it("vite dev serves the same bootstrap from memory, with the runner policy", async () => {
    const middlewares: Connect.NextHandleFunction[] = [];
    const server = {
      config: { root: webRoot },
      watcher: new EventEmitter(),
      middlewares: { use: (middleware: Connect.NextHandleFunction) => middlewares.push(middleware) },
    };
    hookHandler(runnerBootstrapPlugin().configureServer)(server);

    const { headers, body } = await respond(middlewares, "/__runner/bootstrap.js");

    expect(body).toBe(bootstrap);
    expect(headers["content-type"]).toBe("text/javascript; charset=utf-8");
    expect(headers["content-security-policy"]).toBe(RUNNER_CONTENT_SECURITY_POLICY);
  }, 60_000);
});

describe("runner policy on the preview server", () => {
  function previewMiddlewares(): Connect.NextHandleFunction[] {
    const middlewares: Connect.NextHandleFunction[] = [];
    const server = { middlewares: { use: (middleware: Connect.NextHandleFunction) => middlewares.push(middleware) } };
    hookHandler(runnerBootstrapPlugin().configurePreviewServer)(server);
    return middlewares;
  }

  it("the runner's files carry its enforced sandbox policy", async () => {
    for (const url of ["/__runner/index.html", "/__runner/bootstrap.js", "/__runner/index.html?x=1"]) {
      expect((await respond(previewMiddlewares(), url)).headers["content-security-policy"]).toBe(RUNNER_CONTENT_SECURITY_POLICY);
    }
  });

  it("the runner rule of public/_headers sends exactly the policy the dev and preview servers send", async () => {
    const rules = parseNetlifyHeaders(await readFile(new URL("../public/_headers", import.meta.url), "utf8"));
    const runnerRules = rules.filter((rule) => rule.pattern === "/__runner/*");
    expect(runnerRules).toHaveLength(1);
    expect(headerValues(runnerRules, "/__runner/index.html", "Content-Security-Policy")).toEqual([RUNNER_CONTENT_SECURITY_POLICY]);
  });

  it("no app path gets the runner policy", async () => {
    for (const url of ["/", "/1/cases/1650", "/__runner", "/assets/index.js"]) {
      expect((await respond(previewMiddlewares(), url)).headers["content-security-policy"]).toBeUndefined();
    }
  });
});
