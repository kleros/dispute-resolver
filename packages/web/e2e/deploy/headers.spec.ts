import { readFileSync } from "node:fs";
import { expect, test, type APIResponse } from "@playwright/test";
import { headerValues, parseNetlifyHeaders, policies } from "../../src/test/routing/netlifyHeaders";

// The deploy tests of checklist C1 to C3 (ledger D-41): the branch deploy's actual response headers, for the paths the
// checklist names, against public/_headers read with Netlify's matching rules. Only a Netlify deploy applies the file
// (`vite preview` does not), so the suite runs when DR_E2E_DEPLOY_URL names the branch deploy's origin.

const DEPLOY_URL = process.env.DR_E2E_DEPLOY_URL?.trim() ?? "";

const RULES = parseNetlifyHeaders(readFileSync(new URL("../../public/_headers", import.meta.url), "utf8"));
/** Every header the file sets: a path must carry exactly the ones its matching rules add, and none of the others. */
const MANAGED = [...new Set(RULES.flatMap((rule) => rule.headers.map(([name]) => name.toLowerCase())))];
const POLICY_HEADERS = new Set(["content-security-policy", "content-security-policy-report-only"]);
/** The build replaces it with the app's report-only policy (ARCHITECTURE.md §10.2). */
const APP_POLICY_PLACEHOLDER = "__APP_CSP__";
const RUNNER_PATH = "/__runner/index.html";

/** The paths of C1: the root, two app routes, an unknown path and the runner; the static asset is read from the page. */
const PATHS = ["/", "/1/ongoing", "/1/cases/5", "/1/no-such-page", RUNNER_PATH] as const;

function splitPolicies(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((policy) => policy.trim())
    .filter((policy) => policy !== "");
}

/** The app's report-only policy as C2 builds it: strict, framed by no one, and without the runner's eval allowance. */
function isAppPolicy(policy: string): boolean {
  return policy.startsWith("default-src 'self';") && policy.includes("frame-ancestors 'none'") && !policy.includes("unsafe-eval");
}

/** Asserts that `response` carries exactly the managed headers `path` gets from the file, with their values. */
function expectHeadersOf(path: string, response: APIResponse): void {
  const actual = response.headers();
  for (const name of MANAGED) {
    const value = actual[name];
    if (!POLICY_HEADERS.has(name)) {
      const expected = headerValues(RULES, path, name);
      expect(value, `${name} on ${path}`).toBe(expected.length === 0 ? undefined : expected.join(", "));
      continue;
    }
    const expected = policies(RULES, path, name);
    const received = splitPolicies(value);
    expect(received.length, `${name} policies on ${path}`).toBe(expected.length);
    expected.forEach((policy, index) => {
      const sent = received[index] ?? "";
      if (policy === APP_POLICY_PLACEHOLDER) expect(isAppPolicy(sent), `${name} on ${path} is the app's report-only policy`).toBe(true);
      else expect(sent, `${name} on ${path}`).toBe(policy);
    });
  }
}

async function fetchHeaders(path: string, fetch: (url: string) => Promise<APIResponse>): Promise<APIResponse> {
  const response = await fetch(new URL(path, DEPLOY_URL).href);
  expect(response.status(), `status of ${path}`).toBe(200);
  return response;
}

test.describe("deploy headers (C1, C2, C3, D-41)", () => {
  // Skipped without a deploy URL: only a Netlify deploy sends public/_headers.
  test.skip(DEPLOY_URL === "", "needs DR_E2E_DEPLOY_URL (the branch deploy) for the headers of public/_headers");

  for (const path of PATHS) {
    test(`C1, C2, C3, D-41: ${path} carries exactly the headers public/_headers gives it`, async ({ request }) => {
      expectHeadersOf(path, await fetchHeaders(path, (url) => request.get(url, { maxRedirects: 0 })));
    });
  }

  test("C1, D-41: a static asset of the build carries exactly the headers of every path", async ({ request }) => {
    const page = await (await fetchHeaders("/", (url) => request.get(url))).text();
    const asset = /<script[^>]+src="(\/assets\/[^"]+\.js)"/.exec(page)?.[1];
    expect(asset, "the page names no entry script under /assets/").toBeDefined();
    const path = asset ?? "";
    expectHeadersOf(path, await fetchHeaders(path, (url) => request.get(url, { maxRedirects: 0 })));
  });

  test("C3: the runner sends one enforced sandbox policy, and no app path carries its eval allowance", async ({ request }) => {
    const runner = await fetchHeaders(RUNNER_PATH, (url) => request.get(url, { maxRedirects: 0 }));
    const [policy, ...others] = splitPolicies(runner.headers()["content-security-policy"]);
    expect(others).toEqual([]);
    expect(policy).toContain("sandbox allow-scripts");
    expect(policy).not.toContain("allow-same-origin");
    expect(policy).toContain("frame-ancestors 'self'");
    expect(runner.headers()["content-security-policy-report-only"]).toBeUndefined();
    for (const path of PATHS.filter((candidate) => candidate !== RUNNER_PATH)) {
      const headers = (await fetchHeaders(path, (url) => request.get(url, { maxRedirects: 0 }))).headers();
      for (const name of POLICY_HEADERS) expect(headers[name] ?? "", `${name} on ${path}`).not.toContain("unsafe-eval");
    }
  });
});
