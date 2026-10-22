// @vitest-environment node
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ResolvedConfig } from "vite";
import { afterEach, describe, expect, it, vi } from "vitest";
// The parser alone: the routing doubles index also renders React, which this Node-side test cannot load.
import { KEYED_ENV, headerValues, parseNetlifyHeaders, policies } from "../src/test/routing/netlifyHeaders";
import { APP_CSP_PLACEHOLDER } from "../src/routing/headers/appCsp";
import { headersPlugin } from "./headersPlugin";

const HEADERS_TEXT = await readFile(new URL("../public/_headers", import.meta.url), "utf8");

function connectSrc(policy: string): readonly string[] {
  const directive = policy
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("connect-src "));
  return directive === undefined ? [] : directive.split(" ").slice(1);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

describe("headersPlugin", () => {
  let workDir: string | null = null;

  afterEach(async () => {
    vi.unstubAllEnvs();
    if (workDir !== null) await rm(workDir, { recursive: true, force: true });
    workDir = null;
  });

  async function runPlugin(headers: string | null): Promise<string> {
    workDir = await mkdtemp(path.join(tmpdir(), "headers-plugin-"));
    const outDir = path.join(workDir, "dist");
    await mkdir(outDir);
    if (headers !== null) await writeFile(path.join(outDir, "_headers"), headers, "utf8");
    const plugin = headersPlugin();
    expect(plugin.apply).toBe("build");
    const { configResolved, writeBundle } = plugin;
    if (typeof configResolved !== "function" || typeof writeBundle !== "function") throw new Error("The plugin's hooks are not plain functions.");
    const config = { root: workDir, mode: "production", envDir: false, build: { outDir: "dist" } } as unknown as ResolvedConfig;
    await configResolved.call({} as ThisParameterType<typeof configResolved>, config);
    await writeBundle.call({} as ThisParameterType<typeof writeBundle>, {} as Parameters<typeof writeBundle>[0], {});
    return readFile(path.join(outDir, "_headers"), "utf8");
  }

  it("given an env with keyed RPC URLs, writes a policy with their origins only", async () => {
    for (const [name, value] of Object.entries(KEYED_ENV)) vi.stubEnv(name, value);
    const written = await runPlugin(HEADERS_TEXT);
    expect(written).not.toContain(APP_CSP_PLACEHOLDER);
    for (const fragment of ["KEY-", "token=", "/v3/", "/rpc/"]) expect(written).not.toContain(fragment);
    const built = parseNetlifyHeaders(written);
    const [reportOnly = ""] = headerValues(built, "/1/cases/5", "Content-Security-Policy-Report-Only");
    const sources = connectSrc(reportOnly);
    expect(sources).toEqual(expect.arrayContaining(["'self'", "https://mainnet.infura.io", "https://gnosis.example-rpc.io:8545", "wss://sepolia.example-rpc.io"]));
    for (const source of sources.slice(1)) expect(source).toMatch(/^(?:https|wss):\/\/[^/?#]+$/);
    expect(policies(built, "/__runner/index.html", "Content-Security-Policy")).toHaveLength(1);
  });

  it("fails the build when _headers is missing from the output", async () => {
    await expect(runPlugin(null)).rejects.toThrow("_headers is missing from the build output");
  });

  it("fails the build when the placeholder is missing, without printing any value", async () => {
    vi.stubEnv("REACT_APP_WEB3_PROVIDER_URL", "https://mainnet.infura.io/v3/KEY-MAINNET-0001");
    const failure = runPlugin("/*\n  X-Frame-Options: SAMEORIGIN\n");
    await expect(failure).rejects.toThrow(APP_CSP_PLACEHOLDER);
    await expect(failure).rejects.not.toThrow("KEY-");
  });

  it("fails the build when an RPC endpoint is a plain http URL, naming the variable and never its value", async () => {
    vi.stubEnv("REACT_APP_WEB3_PROVIDER_URL", "http://mainnet.rpc.example/v3/KEY-PLAIN-0007");
    const message = await runPlugin(HEADERS_TEXT).then(() => "the build succeeded", messageOf);
    expect(message).toContain("REACT_APP_WEB3_PROVIDER_URL is a plain http or ws URL");
    for (const part of ["KEY-", "rpc.example", "/v3/"]) expect(message).not.toContain(part);
  });
});
