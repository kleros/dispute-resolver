import { expect, test, type Page } from "@playwright/test";
import { appOriginOf } from "../support/network";
import {
  CASE_PATH,
  DISPUTE_ID,
  HARNESS_PATH,
  OPTIONS_BEFORE_SCRIPT,
  RUNNER_FRAME,
  RUNNER_PATH,
  SCRIPT_OPTIONS,
  SCRIPT_TITLE,
  expectConfiguredBuild,
  expectEveryDependencyServed,
  routeCasePage,
  serveHarness,
} from "./casePageRoutes";
import { caseSectionHeader, expectCaseSectionsSettled, openCaseSection } from "./caseSections";

// Runs against the built app under `vite preview` with the network-free routes of casePageRoutes.ts. Run with
// `yarn e2e:runner`, which covers every engine of the runner projects in playwright.config.ts.

/** Mirrors `CASE_PAGE_BUDGET_MS` in packages/core/src/metaEvidence/load.ts. */
const CASE_PAGE_BUDGET_MS = 120_000;
const RENDER_LIMIT_MS = CASE_PAGE_BUDGET_MS / 4;

const FORGED_TITLE = "Title forged by a foreign window";

/** A foreign window's page, served by the route; its address is never resolved. */
const FOREIGN_ORIGIN = "http://foreign-window.test";
const FORGER_URL = `${FOREIGN_ORIGIN}/forger.html`;
const FORGER_ONCE_URL = `${FOREIGN_ORIGIN}/forger-once.html`;
/** The same page on the app's own origin: its messages pass the runner's origin check, so the source check decides. */
const SAME_ORIGIN_FORGER_PATH = "/__runner-e2e/forger-once.html";

const FORGED_PARAMS = {
  disputeID: DISPUTE_ID,
  arbitrableContractAddress: "0x327a29fce0a6490e4236240be176daa282eccfdf",
  arbitratorChainID: 1,
  arbitrableChainID: 1,
  arbitratorJsonRpcUrl: "https://rpc.invalid/mainnet",
  arbitrableJsonRpcUrl: "https://rpc.invalid/mainnet",
};

/**
 * A well-formed run request whose script would set the title to `FORGED_TITLE`, so only the sender's identity decides
 * whether it runs. The title is spelled out in the script text, which is a plain literal.
 */
const FORGED_REQUEST = {
  type: "dr-runner/run",
  version: 2,
  scriptText: 'var getMetaEvidence = function () { resolveScript({ title: "Title forged by a foreign window" }); };',
  params: FORGED_PARAMS,
  guardSource: null,
  rpcRedirects: [],
};

/** A result message in the runner's shape, posted to the app outside any run's port. */
const FORGED_RESULT = { type: "dr-runner/result", value: { title: FORGED_TITLE }, jsonDuplicateKeys: false };

/**
 * Posts the run request, with a port of its own, to every other frame of its parent and the result message to the
 * parent, every 20 ms; counts what comes back on its ports.
 */
const FORGER_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Foreign window</title></head><body><script>
var forgedPosts = 0;
var forgedReplies = 0;
function forge() {
  for (var index = 0; index < parent.frames.length; index += 1) {
    var target = parent.frames[index];
    if (target === window) continue;
    var channel = new MessageChannel();
    channel.port1.onmessage = function () { forgedReplies += 1; };
    target.postMessage(${JSON.stringify(FORGED_REQUEST)}, "*", [channel.port2]);
    forgedPosts += 1;
  }
  parent.postMessage(${JSON.stringify(FORGED_RESULT)}, "*");
}
setInterval(forge, 20);
</script></body></html>`;

/** Posts the run request once to its parent's first frame (the runner), then tells the parent it did. */
const FORGER_ONCE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Foreign window</title></head><body><script>
var forgedReplies = 0;
var channel = new MessageChannel();
channel.port1.onmessage = function () { forgedReplies += 1; };
parent.frames[0].postMessage(${JSON.stringify(FORGED_REQUEST)}, "*", [channel.port2]);
parent.postMessage("forged-request-sent", "*");
</script></body></html>`;

function scriptTitle(page: Page) {
  return page.getByRole("heading", { name: SCRIPT_TITLE, exact: true });
}

test.describe("case page dynamic script", () => {
  test("renders an allowlisted script's title and ruling options well within the budget", async ({ page, baseURL }) => {
    test.setTimeout(RENDER_LIMIT_MS + 30_000);
    const traffic = await routeCasePage(page, baseURL);

    const started = Date.now();
    await page.goto(CASE_PATH);
    await expectConfiguredBuild(traffic);
    await expect(scriptTitle(page)).toBeVisible({ timeout: RENDER_LIMIT_MS });
    const renderedMs = Date.now() - started;
    test.info().annotations.push({ type: "script-rendered-ms", description: String(renderedMs) });

    // Dispute 1621's recorded ruling is 2, so the decision names the script's second option.
    await expect(page.getByRole("region", { name: /^(Jury decision|Winner)$/ }).getByText(SCRIPT_OPTIONS[1], { exact: true })).toBeVisible();
    // The Question panel lists the script's options, not the meta-evidence file's.
    const question = await openCaseSection(page, "Question");
    await expect(question.getByText("Multiple choice: single select", { exact: true })).toBeVisible();
    await expect(question.getByRole("region", { name: "Voting options", exact: true }).getByRole("listitem")).toHaveText([
      "Option 0 - Refuse to Arbitrate / Invalid",
      `Option 1 - ${SCRIPT_OPTIONS[0]}`,
      `Option 2 - ${SCRIPT_OPTIONS[1]}`,
    ]);
    for (const option of OPTIONS_BEFORE_SCRIPT) await expect(question.getByText(option)).toHaveCount(0);
    // The run settled: the host removed its frame.
    await expect(page.locator(RUNNER_FRAME)).toHaveCount(0);
    expect(renderedMs).toBeLessThan(RENDER_LIMIT_MS);
    expectEveryDependencyServed(traffic);
  });

  test("once no case section is loading, the accordion stays in place, so a click on its header is not lost", async ({ page, baseURL }) => {
    test.setTimeout(RENDER_LIMIT_MS + 30_000);
    const traffic = await routeCasePage(page, baseURL);
    await page.goto(CASE_PATH);
    await expectConfiguredBuild(traffic);
    await expect(scriptTitle(page)).toBeVisible({ timeout: RENDER_LIMIT_MS });

    // Where openCaseSection clicks. The script's title is not that point: the timeline and the decision render after it.
    await expectCaseSectionsSettled(page);
    const header = caseSectionHeader(page, "Question");
    const settled = await header.boundingBox();
    expect(settled, "the Question header's box").not.toBeNull();
    // The sections that render last on this dispute, and the end of the run: the header has not moved.
    await expect(page.getByRole("region", { name: "Dispute timeline", exact: true }).getByRole("list")).toBeVisible();
    await expect(page.getByRole("region", { name: "Winner", exact: true }).getByText(SCRIPT_OPTIONS[1], { exact: true })).toBeVisible();
    await expect(page.locator(RUNNER_FRAME)).toHaveCount(0);
    expect(await header.boundingBox()).toEqual(settled);
  });

  test("the app's runner frame is sandboxed without allow-same-origin, runs at an opaque origin and ignores a foreign window", async ({ page, baseURL }) => {
    test.setTimeout(RENDER_LIMIT_MS + 30_000);
    const traffic = await routeCasePage(page, baseURL, { [FORGER_URL]: FORGER_HTML });
    const appOrigin = appOriginOf(baseURL);

    await page.goto(CASE_PATH);
    // A foreign window joins the page before the runner frame exists and keeps posting run requests and results.
    await page.evaluate((src) => {
      const frame = document.createElement("iframe");
      frame.title = "Foreign window";
      frame.src = src;
      document.body.append(frame);
    }, FORGER_URL);
    await expectConfiguredBuild(traffic);

    const runnerElement = page.locator(RUNNER_FRAME);
    await runnerElement.waitFor({ state: "attached", timeout: RENDER_LIMIT_MS });
    expect(await runnerElement.getAttribute("sandbox")).toBe("allow-scripts");
    expect(await runnerElement.evaluate((frame) => (frame as HTMLIFrameElement).sandbox.contains("allow-same-origin"))).toBe(false);
    expect(await runnerElement.getAttribute("referrerpolicy")).toBe("no-referrer");

    const runner = await (await runnerElement.elementHandle()).contentFrame();
    if (runner === null) throw new Error("The runner iframe has no frame.");
    // The script resolves after SCRIPT_DELAY_MS, so the frame is open while its accepted run is inspected. Booleans only:
    // the run's parameters carry the read RPC URL.
    await runner.waitForFunction(() => typeof Reflect.get(globalThis, "resolveScript") === "function", undefined, { polling: 50, timeout: RENDER_LIMIT_MS });
    const inside = await runner.evaluate((origin) => {
      let storageBlocked = false;
      try {
        window.localStorage.getItem("dr-e2e");
      } catch {
        storageBlocked = true;
      }
      return { opaqueOrigin: self.origin === "null", framed: window.top !== window, locationOriginIsApp: location.origin === origin, storageBlocked };
    }, appOrigin);
    expect(inside).toEqual({ opaqueOrigin: true, framed: true, locationOriginIsApp: true, storageBlocked: true });

    await expect(scriptTitle(page)).toBeVisible({ timeout: RENDER_LIMIT_MS });
    const forger = page.frames().find((frame) => frame.url() === FORGER_URL);
    expect(forger).toBeDefined();
    const forged = await forger?.evaluate(() => ({ posts: Number(Reflect.get(globalThis, "forgedPosts")), replies: Number(Reflect.get(globalThis, "forgedReplies")) }));
    expect(forged?.posts).toBeGreaterThan(0);
    expect(forged?.replies).toBe(0);
    await expect(page.getByText(FORGED_TITLE)).toHaveCount(0);
    expectEveryDependencyServed(traffic);
  });

  // A sibling frame of the runner sends a run request. From the app's own origin it passes the origin check and the source
  // check (event.source === window.parent) ignores it; from a foreign origin the origin check ignores it first.
  const forgers = [
    { name: "a same-origin sibling window", forgerUrl: (appOrigin: string) => `${appOrigin}${SAME_ORIGIN_FORGER_PATH}` },
    { name: "a foreign-origin window", forgerUrl: () => FORGER_ONCE_URL },
  ] as const;
  for (const forgerCase of forgers) {
    test(`a run request from ${forgerCase.name} other than the parent is ignored, and the parent's own request still runs`, async ({ page, baseURL }) => {
      const appOrigin = appOriginOf(baseURL);
      const forgerUrl = forgerCase.forgerUrl(appOrigin);
      await serveHarness(page, `**${HARNESS_PATH}`);
      await page.route(forgerUrl, (route) => route.fulfill({ contentType: "text/html; charset=utf-8", body: FORGER_ONCE_HTML }));
      await page.goto(HARNESS_PATH);

      const { reply, messages } = await page.evaluate(
        async ({ runnerUrl, forgerSrc, forgerOrigin, scriptText, params }) => {
          const runner = document.createElement("iframe");
          runner.setAttribute("sandbox", "allow-scripts");
          runner.src = runnerUrl;
          await new Promise<void>((resolve) => {
            runner.addEventListener("load", () => {
              resolve();
            });
            document.body.append(runner);
          });
          // The sibling posts its request first, while the runner still waits for its one run.
          const forger = document.createElement("iframe");
          const forgedSent = new Promise<void>((resolve) => {
            window.addEventListener("message", (event) => {
              if (event.origin === forgerOrigin && event.source === forger.contentWindow && event.data === "forged-request-sent") resolve();
            });
          });
          forger.src = forgerSrc;
          document.body.append(forger);
          await forgedSent;
          await new Promise((resolve) => setTimeout(resolve, 300));

          // Every message on the port until the result (the acknowledgement comes first) or the wait ends.
          const channel = new MessageChannel();
          const messages: unknown[] = [];
          const answer = new Promise<unknown>((resolve) => {
            channel.port1.onmessage = (event: MessageEvent<unknown>) => {
              messages.push(event.data);
              const data: unknown = event.data;
              if (typeof data === "object" && data !== null && Reflect.get(data, "type") !== "dr-runner/accepted") resolve(data);
            };
            setTimeout(() => {
              resolve(null);
            }, 10_000);
          });
          // eslint-disable-next-line sonarjs/post-message -- "*" is the only target origin an opaque-origin runner accepts.
          runner.contentWindow?.postMessage({ type: "dr-runner/run", version: 2, scriptText, params, guardSource: null, rpcRedirects: [] }, "*", [channel.port2]);
          return { reply: await answer, messages };
        },
        {
          runnerUrl: RUNNER_PATH,
          forgerSrc: forgerUrl,
          forgerOrigin: new URL(forgerUrl).origin,
          scriptText: "var getMetaEvidence = function () { resolveScript({ from: 'parent' }); };",
          params: FORGED_PARAMS,
        },
      );

      expect(reply).toEqual({ type: "dr-runner/result", value: { from: "parent" }, jsonDuplicateKeys: false });
      // The parent's own request is acknowledged; the sibling's got no acknowledgement.
      expect(messages).toEqual([{ type: "dr-runner/accepted" }, reply]);
      const forger = page.frames().find((frame) => frame.url() === forgerUrl);
      expect(forger).toBeDefined();
      expect(await forger?.evaluate(() => Number(Reflect.get(globalThis, "forgedReplies")))).toBe(0);
    });
  }
});
