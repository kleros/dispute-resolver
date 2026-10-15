import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import type { ScriptResult } from "../../../../packages/core/src/types";
import type { GoldenGateWindow, NewRunInput, OldRunInput, OldRunOutput } from "../../browser/protocol";
import { redactUrlsIn } from "../../../../packages/web/e2e/golden/redact";
import type { HarnessBundles } from "./bundle";

/**
 * Production's origin. The old harness page is answered by the gate itself at this origin (no request reaches the real
 * host), so a same-origin script frame has the origin, the secure context and the `Origin` header it has in production.
 */
const PRODUCTION_ORIGIN = "https://resolve.kleros.io";
const HARNESS_PATH = "/__golden-gate/harness.html";

/** Today's app document declares UTF-8 (public/index.html), which a same-origin `blob:` frame without a charset inherits. */
const HARNESS_HTML = '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" /><title>Golden gate harness</title></head><body></body></html>';

/** Console and error lines kept per run, each cut to this length once redacted. */
const MAX_DIAGNOSTICS = 8;
const MAX_DIAGNOSTIC_LENGTH = 300;

/** What a page logged while a script ran, for the run log: every line already redacted, then cut. */
export interface Diagnostics {
  readonly console: readonly string[];
  readonly pageErrors: readonly string[];
  readonly blockedRequests: number;
}

export interface GateBrowser {
  readonly version: string;
  runOld(input: OldRunInput): Promise<{ readonly output: OldRunOutput; readonly diagnostics: Diagnostics }>;
  runNew(input: NewRunInput): Promise<{ readonly output: ScriptResult; readonly diagnostics: Diagnostics }>;
  close(): Promise<void>;
}

/** The page events the diagnostics are read from (a Playwright `Page`). */
export interface DiagnosticSource {
  on(event: "console", listener: (message: { type(): string; text(): string }) => void): unknown;
  on(event: "pageerror", listener: (error: Error) => void): unknown;
}

/**
 * Collects a page's warnings, errors and uncaught exceptions. Each line is redacted whole before it is cut, `.env`
 * values first and then every remaining URL (a request URL a script logged, which can carry a third party's key) as its
 * host and fingerprint: the redactors match complete secrets, so a key cut at the boundary would otherwise survive in part.
 */
export function collectDiagnostics(page: DiagnosticSource, redact: (text: string) => string): { readonly done: () => Diagnostics; blocked: () => void } {
  const console: string[] = [];
  const pageErrors: string[] = [];
  let blockedRequests = 0;
  const keep = (list: string[], line: string) => {
    if (list.length < MAX_DIAGNOSTICS) list.push(redactUrlsIn(redact(line)).slice(0, MAX_DIAGNOSTIC_LENGTH));
  };
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") keep(console, `${message.type()}: ${message.text()}`);
  });
  page.on("pageerror", (error) => {
    keep(pageErrors, `${error.name}: ${error.message}`);
  });
  return {
    done: () => ({ console, pageErrors, blockedRequests }),
    blocked: () => {
      blockedRequests += 1;
    },
  };
}

/**
 * Opens a fresh page on the harness of `origin` with one harness script loaded; one page per run, so no run sees
 * another's frames or its reassigned `window.onmessage`. The harness document is answered locally; any other request to
 * production's origin is blocked and counted, so nothing reaches the real host.
 */
async function openHarness(
  context: BrowserContext,
  origin: string,
  script: string,
  redact: (text: string) => string,
): Promise<{ readonly page: Page; readonly done: () => Diagnostics }> {
  const page = await context.newPage();
  const diagnostics = collectDiagnostics(page, redact);
  // At the preview origin only the harness document is answered locally: the runner page and its bootstrap come from
  // the preview server untouched, with their policy headers.
  const pattern = origin === PRODUCTION_ORIGIN ? `${origin}/**` : `${origin}${HARNESS_PATH}`;
  await page.route(pattern, async (route) => {
    if (new URL(route.request().url()).pathname === HARNESS_PATH) {
      await route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: HARNESS_HTML });
      return;
    }
    diagnostics.blocked();
    await route.abort("blockedbyclient");
  });
  await page.goto(`${origin}${HARNESS_PATH}`);
  await page.addScriptTag({ content: script });
  return { page, done: diagnostics.done };
}

/**
 * Launches Chromium with the two harnesses: the old runner replica at production's origin and the new runner host at
 * the preview server's origin, whose runner frames load the built app's /__runner/index.html. `redact` is applied to
 * every diagnostic line the pages log.
 */
export async function openGateBrowser(previewOrigin: string, bundles: HarnessBundles, redact: (text: string) => string): Promise<GateBrowser> {
  const browser: Browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();

  return {
    version: browser.version(),
    async runOld(input) {
      const { page, done } = await openHarness(context, PRODUCTION_ORIGIN, bundles.oldRunner, redact);
      try {
        const output = await page.evaluate(async (run) => {
          const runner = (window as GoldenGateWindow).__goldenGateOldRunner;
          if (runner === undefined) throw new Error("The old runner harness did not load.");
          return runner.run(run);
        }, input);
        return { output, diagnostics: done() };
      } finally {
        await page.close();
      }
    },
    async runNew(input) {
      const { page, done } = await openHarness(context, previewOrigin, bundles.newRunner, redact);
      try {
        const output = await page.evaluate(async (run) => {
          const runner = (window as GoldenGateWindow).__goldenGateNewRunner;
          if (runner === undefined) throw new Error("The new runner harness did not load.");
          return runner.run(run);
        }, input);
        return { output, diagnostics: done() };
      } finally {
        await page.close();
      }
    },
    close: () => browser.close(),
  };
}
