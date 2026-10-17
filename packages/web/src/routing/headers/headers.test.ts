// @vitest-environment node
// The headers file and its policy are build-time code, tested in Node (ARCHITECTURE.md §10.3, §10.4).
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { APP_ROUTE_PATTERNS } from "../../test/routing/appRoutePatterns";
import { KEYED_ENV, headerValues, matchesPattern, matchingRules, parseNetlifyHeaders, policies } from "../../test/routing/netlifyHeaders";
import { APP_CSP_PLACEHOLDER, WALLET_ORIGINS, applyAppCsp, buildAppCsp, connectSources } from "./appCsp";

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

/** Parts of the keyed values that only a path, query or fragment carries. */
const KEY_FRAGMENTS = ["KEY-", "token="];

/** The message `connectSources(env)` fails with; the test fails if it does not throw. */
function failureOf(env: Record<string, string>): string {
  try {
    connectSources(env);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("connectSources accepted the environment.");
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
      expect(source).toMatch(/^(?:https|wss):\/\/[^/?#]+$/);
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

  it.each([
    ["REACT_APP_WEB3_PROVIDER_URL", "http://mainnet.rpc.example/v3/KEY-PLAIN-0007"],
    ["REACT_APP_PUBLIC_RPC_1", "http://public.rpc.example:8545/eth/KEY-PLAIN-0008"],
    ["REACT_APP_WEB3_SEPOLIA_PROVIDER_URL", "ws://sepolia.rpc.example/ws/KEY-PLAIN-0009"],
    ["REACT_APP_ATLAS_URI", "http://atlas.host.example/graphql"],
  ])("C2: fails the build when %s is a plain http or ws URL, naming the variable and never its value", (name, value) => {
    const message = failureOf({ ...KEYED_ENV, [name]: value });
    expect(message).toContain(name);
    expect(message).toContain("plain http or ws URL");
    for (const part of ["KEY-", "rpc.example", "host.example", "8545", "/v3/", "/eth/", "/ws/", "/graphql"]) expect(message).not.toContain(part);
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
