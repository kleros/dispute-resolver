// @vitest-environment node
// The headers file and its plugin are Node-side build code (ARCHITECTURE.md §10.3).
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ResolvedConfig } from "vite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { headerValues, matchesPattern, matchingRules, parseNetlifyHeaders, policies } from "../../test/routing/netlifyHeaders";
import { APP_ROUTE_PATTERNS } from "../paths";
import { APP_CSP_PLACEHOLDER, WALLET_ORIGINS, applyAppCsp, buildAppCsp, connectSources } from "./appCsp";
import { headersPlugin } from "./index";

const HEADERS_PATH = fileURLToPath(new URL("../../../public/_headers", import.meta.url));
const HEADERS_TEXT = await readFile(HEADERS_PATH, "utf8");
const RULES = parseNetlifyHeaders(HEADERS_TEXT);

/** The chain-less legacy prefixes that ARCHITECTURE.md §10.1 adds to C1's list. */
const LEGACY_PATTERNS = ["/cases/*", "/interact/*"] as const;
const APP_PATTERNS: readonly string[] = [...APP_ROUTE_PATTERNS, ...LEGACY_PATTERNS];
const FRAME_ANCESTORS_NONE = "frame-ancestors 'none'";
const RUNNER_PATHS = ["/__runner/index.html", "/__runner/bootstrap.js"] as const;
/** The sample paths of ARCHITECTURE.md §10.4 and the other app routes. */
const APP_SAMPLE_PATHS = ["/", "/1", "/1/ongoing", "/1/create", "/1/cases", "/1/cases/5", "/1/interact/5", "/1/disputes", "/ongoing", "/cases/5", "/interact/5"];

/** A policy whose keyed RPC URLs must never leak past their origin. */
const KEYED_ENV = {
  REACT_APP_WEB3_PROVIDER_URL: "https://mainnet.infura.io/v3/KEY-MAINNET-0001",
  REACT_APP_WEB3_XDAI_PROVIDER_URL: "https://gnosis.example-rpc.io:8545/rpc/KEY-GNOSIS-0002?token=KEY-QUERY-0003#KEY-HASH-0004",
  REACT_APP_PUBLIC_RPC_1: "https://public.example-rpc.io/eth/KEY-PUBLIC-0005",
  REACT_APP_WEB3_SEPOLIA_PROVIDER_URL: "wss://sepolia.example-rpc.io/ws/KEY-WSS-0006",
  REACT_APP_ATLAS_URI: "https://atlas.example.org/graphql",
  REACT_APP_METAEVIDENCE_URL: "https://metaevidence.example.org/api/meta-evidence",
  REACT_APP_IPFS_GATEWAY: "https://cdn.example-ipfs.io",
} as const;

/** Parts of the keyed values that only a path, query or fragment carries. */
const KEY_FRAGMENTS = ["KEY-", "token="];

function connectSrc(policy: string): readonly string[] {
  const directive = policy
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("connect-src "));
  return directive === undefined ? [] : directive.split(" ").slice(1);
}

describe("public/_headers (ARCHITECTURE.md §10.4)", () => {
  it("C1: /* carries exactly the four headers of every path", () => {
    const all = RULES.find((rule) => rule.pattern === "/*");
    expect(all?.headers).toEqual([
      ["X-Content-Type-Options", "nosniff"],
      ["Referrer-Policy", "strict-origin-when-cross-origin"],
      ["Permissions-Policy", "camera=(), microphone=(), geolocation=()"],
      ["X-Frame-Options", "SAMEORIGIN"],
    ]);
  });

  it.each(APP_PATTERNS)("C1, C2: the app pattern %s carries frame-ancestors 'none' and the report-only policy", (pattern) => {
    const rule = RULES.find((candidate) => candidate.pattern === pattern);
    expect(rule?.headers).toEqual([
      ["Content-Security-Policy", FRAME_ANCESTORS_NONE],
      ["Content-Security-Policy-Report-Only", APP_CSP_PLACEHOLDER],
    ]);
  });

  it("B9, C1, D-41: the file has no rule besides /*, the app patterns and the runner", () => {
    expect(RULES.map((rule) => rule.pattern)).toEqual(["/*", ...APP_PATTERNS, "/__runner/*"]);
  });

  it.each(APP_SAMPLE_PATHS)("C1: %s resolves to exactly one enforced policy, frame-ancestors 'none'", (samplePath) => {
    expect(policies(RULES, samplePath, "Content-Security-Policy")).toEqual([FRAME_ANCESTORS_NONE]);
    expect(policies(RULES, samplePath, "Content-Security-Policy-Report-Only")).toEqual([APP_CSP_PLACEHOLDER]);
    expect(headerValues(RULES, samplePath, "X-Frame-Options")).toEqual(["SAMEORIGIN"]);
  });

  it("C1: /index.html, which /:chain also matches, gets only frame-ancestors 'none' and the report-only policy", () => {
    expect(new Set(policies(RULES, "/index.html", "Content-Security-Policy"))).toEqual(new Set([FRAME_ANCESTORS_NONE]));
    expect(new Set(policies(RULES, "/index.html", "Content-Security-Policy-Report-Only"))).toEqual(new Set([APP_CSP_PLACEHOLDER]));
  });

  it.each(RUNNER_PATHS)("C3: %s matches no app pattern and gets exactly the runner's one policy", (runnerPath) => {
    expect(APP_PATTERNS.filter((pattern) => matchesPattern(pattern, runnerPath))).toEqual([]);
    expect(matchingRules(RULES, runnerPath).map((rule) => rule.pattern)).toEqual(["/*", "/__runner/*"]);
    const runnerPolicies = policies(RULES, runnerPath, "Content-Security-Policy");
    expect(runnerPolicies).toHaveLength(1);
    const [policy = ""] = runnerPolicies;
    expect(policy).toContain("sandbox allow-scripts");
    expect(policy).not.toContain("allow-same-origin");
    expect(policy).toContain("frame-ancestors 'self'");
    expect(headerValues(RULES, runnerPath, "Content-Security-Policy-Report-Only")).toEqual([]);
  });

  it("C3: no app path's enforced or report-only policy contains the runner's 'unsafe-eval', before or after the build", () => {
    const built = parseNetlifyHeaders(applyAppCsp(HEADERS_TEXT, buildAppCsp(KEYED_ENV)));
    for (const rules of [RULES, built]) {
      for (const samplePath of APP_SAMPLE_PATHS) {
        const values = [...headerValues(rules, samplePath, "Content-Security-Policy"), ...headerValues(rules, samplePath, "Content-Security-Policy-Report-Only")];
        expect(values.length).toBeGreaterThan(0);
        for (const value of values) expect(value).not.toContain("'unsafe-eval'");
      }
    }
  });
});

describe("the report-only policy (C2, ARCHITECTURE.md §10.2)", () => {
  it("C2: is the strict policy with the configured origins in connect-src", () => {
    expect(buildAppCsp(KEYED_ENV)).toBe(
      [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' https: data:",
        "font-src 'self'",
        `connect-src 'self' ${connectSources(KEYED_ENV).join(" ")}`,
        "frame-src https:",
        "frame-ancestors 'none'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'none'",
      ].join("; "),
    );
  });

  it("C2: connect-src lists the RPC, Atlas, meta-evidence, gateway and wallet origins, and only origins", () => {
    const sources = connectSources(KEYED_ENV);
    expect(sources).toEqual(
      expect.arrayContaining([
        "https://mainnet.infura.io",
        "https://gnosis.example-rpc.io:8545",
        "https://public.example-rpc.io",
        "wss://sepolia.example-rpc.io",
        "https://atlas.example.org",
        "https://metaevidence.example.org",
        "https://cdn.example-ipfs.io",
        ...WALLET_ORIGINS,
      ]),
    );
    for (const source of sources) {
      expect(source).toMatch(/^(?:https?|wss?):\/\/[^/?#]+$/);
      for (const fragment of KEY_FRAGMENTS) expect(source).not.toContain(fragment);
    }
    expect(new Set(sources).size).toBe(sources.length);
  });

  it("C2: without any variable, lists zkSync's literal RPCs, the default gateway and the wallet origins only", () => {
    expect(connectSources({})).toEqual(
      ["https://cdn.kleros.link", "https://mainnet.era.zksync.io", "https://sepolia.era.zksync.dev", ...WALLET_ORIGINS].sort((left, right) => left.localeCompare(right)),
    );
  });

  it("C2: skips a value that is not a URL the app can connect to", () => {
    const sources = connectSources({ REACT_APP_ATLAS_URI: "not a url", REACT_APP_METAEVIDENCE_URL: "javascript:alert(1)" });
    expect(sources.some((source) => source.includes("javascript"))).toBe(false);
    expect(sources.some((source) => source.includes("not a url"))).toBe(false);
  });

  it("C2: refuses a headers file without the placeholder, and a policy that is not one header value", () => {
    expect(() => applyAppCsp("/*\n  X-Frame-Options: SAMEORIGIN\n", "default-src 'self'")).toThrow("placeholder");
    expect(() => applyAppCsp(HEADERS_TEXT, "default-src 'self'\n/evil\n  X: y")).toThrow("not a single header value");
    expect(() => applyAppCsp(HEADERS_TEXT, `default-src ${APP_CSP_PLACEHOLDER}`)).toThrow("not a single header value");
  });

  it("C2: a $ in the policy is written as it is", () => {
    expect(applyAppCsp(`/\n  Content-Security-Policy-Report-Only: ${APP_CSP_PLACEHOLDER}\n`, "connect-src https://a.example$&")).toContain("https://a.example$&");
  });
});

describe("headersPlugin (ARCHITECTURE.md §10.3)", () => {
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

  it("C2: given an env with keyed RPC URLs, writes a policy with their origins only", async () => {
    for (const [name, value] of Object.entries(KEYED_ENV)) vi.stubEnv(name, value);
    const written = await runPlugin(HEADERS_TEXT);
    expect(written).not.toContain(APP_CSP_PLACEHOLDER);
    for (const fragment of ["KEY-", "token=", "/v3/", "/rpc/"]) expect(written).not.toContain(fragment);
    const built = parseNetlifyHeaders(written);
    const [reportOnly = ""] = headerValues(built, "/1/cases/5", "Content-Security-Policy-Report-Only");
    const sources = connectSrc(reportOnly);
    expect(sources).toEqual(expect.arrayContaining(["'self'", "https://mainnet.infura.io", "https://gnosis.example-rpc.io:8545", "wss://sepolia.example-rpc.io"]));
    for (const source of sources.slice(1)) expect(source).toMatch(/^(?:https?|wss?):\/\/[^/?#]+$/);
    expect(policies(built, "/__runner/index.html", "Content-Security-Policy")).toHaveLength(1);
  });

  it("ARCHITECTURE.md §10.3: fails the build when _headers is missing from the output", async () => {
    await expect(runPlugin(null)).rejects.toThrow("_headers is missing from the build output");
  });

  it("ARCHITECTURE.md §10.3: fails the build when the placeholder is missing, without printing any value", async () => {
    vi.stubEnv("REACT_APP_WEB3_PROVIDER_URL", "https://mainnet.infura.io/v3/KEY-MAINNET-0001");
    const failure = runPlugin("/*\n  X-Frame-Options: SAMEORIGIN\n");
    await expect(failure).rejects.toThrow(APP_CSP_PLACEHOLDER);
    await expect(failure).rejects.not.toThrow("KEY-");
  });
});
