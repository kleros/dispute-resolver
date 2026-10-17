import { expect, test } from "@playwright/test";
import { captureCspViolations } from "./csp";

// The C2 capture in a real browser, without the network: routed pages send a report-only policy, an enforced policy and a
// third-party frame's own policy, and only the app's report-only violations are collected.

const APP = "https://app.example.invalid";
const THIRD_PARTY = "https://display.example.invalid";
const KEY = "0123456789abcdef0123456789abcdef";
const REPORT_ONLY = "default-src 'self'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-src https:";

function html(body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>CSP capture</title></head><body>${body}</body></html>`;
}

test("C2: the capture collects the app's report-only violations across navigations, by origin, and nothing else", async ({ browser }) => {
  const context = await browser.newContext();
  try {
    const csp = await captureCspViolations(context, APP);
    await context.route(`${APP}/**`, (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/enforced") {
        return route.fulfill({
          contentType: "text/html",
          headers: { "Content-Security-Policy": "default-src 'self'; script-src 'unsafe-inline'; img-src 'none'" },
          body: html('<img src="/blocked.png" alt="">'),
        });
      }
      if (path === "/blocked.png") return route.fulfill({ status: 404 });
      const target = path === "/first" ? `https://rpc.example.invalid/v3/${KEY}` : "https://policy.example.invalid/policy.json";
      const script = `fetch("${target}").catch(() => undefined);`;
      return route.fulfill({
        contentType: "text/html",
        headers: { "Content-Security-Policy-Report-Only": REPORT_ONLY },
        body: html(`<iframe src="${THIRD_PARTY}/frame" title="display"></iframe><script>${script}</script>`),
      });
    });
    await context.route(/^https:\/\/(rpc|policy)\.example\.invalid\//, (route) => route.fulfill({ body: "{}" }));
    await context.route(`${THIRD_PARTY}/**`, (route) =>
      route.fulfill({
        contentType: "text/html",
        headers: { "Content-Security-Policy-Report-Only": "connect-src 'none'" },
        body: html(`<script>fetch("${THIRD_PARTY}/data").catch(() => undefined);</script>`),
      }),
    );
    const page = await context.newPage();

    await page.goto(`${APP}/first`);
    await expect.poll(() => csp.violations().length).toBe(1);
    await page.goto(`${APP}/second`);
    await expect.poll(() => csp.violations().length).toBe(2);
    await page.goto(`${APP}/enforced`);
    await page.waitForLoadState("load");

    // Chromium reports a blocked fetch more than once, so only the pairs are exact.
    const violations = csp.violations();
    expect(violations.map(({ directive, blocked }) => ({ directive, blocked }))).toEqual([
      { directive: "connect-src", blocked: "https://policy.example.invalid" },
      { directive: "connect-src", blocked: "https://rpc.example.invalid" },
    ]);
    expect(violations.every((violation) => violation.count >= 1)).toBe(true);
    expect(JSON.stringify(violations).includes(KEY)).toBe(false);
  } finally {
    await context.close();
  }
});
