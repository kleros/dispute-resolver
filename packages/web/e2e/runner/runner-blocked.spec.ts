import { expect, test, type Page, type Route } from "@playwright/test";
import { CASE_PATH, DISPUTE_ID, RUNNER_FRAME, expectConfiguredBuild, expectEveryDependencyServed, routeCasePage } from "./casePageRoutes";
import { openCaseSection } from "./caseSections";

/** How soon the sections must be unavailable: the 5 s window, one attempt's reads and rendering, far below 120 s. */
const DEGRADED_WITHIN_MS = 15_000;
const NOT_STARTED = /did not start within 5 seconds/;

interface Blocker {
  readonly name: string;
  readonly pattern: string;
  readonly block: (route: Route) => Promise<void>;
}

const BLOCKERS: readonly Blocker[] = [
  { name: "a content blocker cancelling the runner page", pattern: "**/__runner/index.html", block: (route) => route.abort("blockedbyclient") },
  {
    name: "an HTML page without the bootstrap served as the runner page",
    pattern: "**/__runner/index.html",
    block: (route) =>
      route.fulfill({
        contentType: "text/html; charset=utf-8",
        body: '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Portal</title></head><body></body></html>',
      }),
  },
  { name: "a content blocker cancelling the runner's bootstrap", pattern: "**/__runner/bootstrap.js", block: (route) => route.abort("blockedbyclient") },
];

/** A page route, so it wins over the case page's network route. */
async function blockRunner(page: Page, blocker: Blocker): Promise<() => number> {
  let requests = 0;
  await page.route(blocker.pattern, (route) => {
    requests += 1;
    return blocker.block(route);
  });
  return () => requests;
}

test.describe("blocked script runner", () => {
  for (const blocker of BLOCKERS) {
    test(`a blocked runner page degrades the case page within seconds, once, and leaves no frame (${blocker.name})`, async ({ page, baseURL }) => {
      test.setTimeout(DEGRADED_WITHIN_MS + 60_000);
      const traffic = await routeCasePage(page, baseURL);
      const runnerRequests = await blockRunner(page, blocker);

      const started = Date.now();
      await page.goto(CASE_PATH);
      await expectConfiguredBuild(traffic);
      await expect(page.getByText("Dispute summary unavailable", { exact: true })).toBeVisible({ timeout: DEGRADED_WITHIN_MS });
      const degradedMs = Date.now() - started;
      test.info().annotations.push({ type: "degraded-ms", description: String(degradedMs) });

      const question = await openCaseSection(page, "Question");
      await expect(question.getByText("Question unavailable", { exact: true })).toBeVisible();
      await expect(page.locator("body")).toContainText(NOT_STARTED);
      expect(degradedMs).toBeLessThan(DEGRADED_WITHIN_MS);

      // A runner error is final in core: one run, never retried, and its frame removed on the acknowledgement timeout.
      expect(runnerRequests(), "runner requests").toBe(1);
      expect(traffic.locator, "meta-evidence locator requests").toBe(1);
      await expect(page.locator(RUNNER_FRAME)).toHaveCount(0);

      await expect(page.getByRole("heading", { level: 1, name: `Dispute #${DISPUTE_ID}` })).toBeVisible();
      await expect(page.getByText("Timeline unavailable", { exact: true })).toHaveCount(0);
      await expect(page.getByText("Evidence submission unavailable", { exact: true })).toHaveCount(0);
      expectEveryDependencyServed(traffic);
    });
  }
});
