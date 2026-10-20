import { expect, test, type Page } from "@playwright/test";
import {
  CASE_PATH,
  DISPUTE_ID,
  OPTIONS_BEFORE_SCRIPT,
  RUNNER_FRAME,
  RUNNER_PATH,
  SCRIPT_OPTIONS,
  SCRIPT_TITLE,
  expectConfiguredBuild,
  expectEveryDependencyServed,
  routeCasePage,
} from "./casePageRoutes";
import { caseSectionHeader, expectCaseSectionsSettled, openCaseSection } from "./caseSections";

// The dynamic-script path of a case page end to end (ADR 0004, ARCHITECTURE.md §7), in every engine the runner projects
// of playwright.config.ts name, against the built app under `vite preview`: the host frames the runner, the classic
// bootstrap runs the script in an opaque-origin document and the result is rendered. Run with `yarn e2e:runner`. The
// case page's routes, network-free, are those of casePageRoutes.ts.

/** The case page's meta-evidence budget: `CASE_PAGE_BUDGET_MS` of packages/core/src/metaEvidence/load.ts (D-38). */
const CASE_PAGE_BUDGET_MS = 120_000;
/** "Well within the budget": a quarter of the case page's meta-evidence budget (D-38). */
const RENDER_LIMIT_MS = CASE_PAGE_BUDGET_MS / 4;

const FORGED_TITLE = "Title forged by a foreign window";

/** A foreign window's page, served by the route; its address is never resolved. */
const FOREIGN_ORIGIN = "http://foreign-window.test";
const FORGER_URL = `${FOREIGN_ORIGIN}/forger.html`;
const FORGER_ONCE_URL = `${FOREIGN_ORIGIN}/forger-once.html`;
/** The same forger page on the app's own origin: its messages pass the runner's origin check, so only the source check can stop them. */
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
 * A well-formed run request carrying a script that would replace the title with `FORGED_TITLE`, so only the sender's
 * identity can stop it. The title is spelled out in the script text, which is a plain literal.
 */
const FORGED_REQUEST = {
  type: "dr-runner/run",
  version: 2,
  scriptText: 'var getMetaEvidence = function () { resolveScript({ title: "Title forged by a foreign window" }); };',
  params: FORGED_PARAMS,
  guardSource: null,
  rpcRedirects: [],
};

/** A forged result, as a window posting straight to the app would send it (B1, D-05). */
const FORGED_RESULT = { type: "dr-runner/result", value: { title: FORGED_TITLE }, jsonDuplicateKeys: false };

/**
 * Posts the forged request, with a port of its own, to every other frame of its parent and the forged result to the
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

/** Posts the forged request once to its parent's first frame (the runner), then tells the parent it did. */
const FORGER_ONCE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Foreign window</title></head><body><script>
var forgedReplies = 0;
var channel = new MessageChannel();
channel.port1.onmessage = function () { forgedReplies += 1; };
parent.frames[0].postMessage(${JSON.stringify(FORGED_REQUEST)}, "*", [channel.port2]);
parent.postMessage("forged-request-sent", "*");
</script></body></html>`;

const HARNESS_PATH = "/__runner-e2e/harness.html";
const HARNESS_HTML = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Runner harness</title></head><body></body></html>';

/** The title the script set: the heading of the dispute's summary. */
function scriptTitle(page: Page) {
  return page.getByRole("heading", { name: SCRIPT_TITLE, exact: true });
}

test.describe("case page dynamic script (ADR 0004)", () => {
  test("§7.3, D-38: an allowlisted script's title and ruling options are rendered well within the budget", async ({ page, baseURL }) => {
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
    // The Question panel lists the script's options, not the meta-evidence file's. Opened once the page settled (P16-R3).
    const question = await openCaseSection(page, "Question");
    await expect(question.getByText("Multiple choice: single select", { exact: true })).toBeVisible();
    await expect(question.getByRole("region", { name: "Voting options", exact: true }).getByRole("listitem")).toHaveText([
      "Option 0 - Refuse to Arbitrate / Invalid",
      `Option 1 - ${SCRIPT_OPTIONS[0]}`,
      `Option 2 - ${SCRIPT_OPTIONS[1]}`,
    ]);
    for (const option of OPTIONS_BEFORE_SCRIPT) await expect(question.getByText(option)).toHaveCount(0);
    // The run settled: the host removed its frame (B8).
    await expect(page.locator(RUNNER_FRAME)).toHaveCount(0);
    expect(renderedMs).toBeLessThan(RENDER_LIMIT_MS);
    expectEveryDependencyServed(traffic);
  });

  test("P16-R3: once no case section is loading, the accordion stays in place, so a click on its header is not lost", async ({ page, baseURL }) => {
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
    // The sections that render last on this dispute, and the end of the run (B8): the header has not moved.
    await expect(page.getByRole("list", { name: "Dispute timeline", exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Winner", exact: true }).getByText(SCRIPT_OPTIONS[1], { exact: true })).toBeVisible();
    await expect(page.locator(RUNNER_FRAME)).toHaveCount(0);
    expect(await header.boundingBox()).toEqual(settled);
  });

  test("B4, C4, B1, D-05: the app's runner frame is sandboxed without allow-same-origin, runs at an opaque origin and ignores a foreign window", async ({ page, baseURL }) => {
    test.setTimeout(RENDER_LIMIT_MS + 30_000);
    const traffic = await routeCasePage(page, baseURL, { [FORGER_URL]: FORGER_HTML });
    const appOrigin = new URL(baseURL ?? "http://localhost").origin;

    await page.goto(CASE_PATH);
    // A foreign window joins the page before the runner frame exists and keeps forging requests and results.
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
    // the run's parameters carry the public RPC URL.
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

  // The forger is a sibling frame of the runner. On the app's own origin its request passes the runner's origin check, so
  // only the source check (event.source === window.parent) can stop it; on a foreign origin the origin check stops it first.
  const forgers = [
    { name: "a same-origin sibling window", forgerUrl: (appOrigin: string) => `${appOrigin}${SAME_ORIGIN_FORGER_PATH}` },
    { name: "a foreign-origin window", forgerUrl: () => FORGER_ONCE_URL },
  ] as const;
  for (const forgerCase of forgers) {
    test(`C4: a run request from ${forgerCase.name} other than the parent is ignored, and the parent's own request still runs`, async ({ page, baseURL }) => {
      const appOrigin = new URL(baseURL ?? "http://localhost").origin;
      const forgerUrl = forgerCase.forgerUrl(appOrigin);
      await page.route(`**${HARNESS_PATH}`, (route) => route.fulfill({ contentType: "text/html; charset=utf-8", body: HARNESS_HTML }));
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
          // The forger posts its request first, while the runner still waits for its one run.
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

          // Every message on the port until the result (P-16: the acknowledgement comes first) or the wait ends.
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
          // eslint-disable-next-line sonarjs/post-message -- ADR 0004: "*" is the only target origin an opaque-origin runner accepts.
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
      // The parent's own request is acknowledged first (P-16); the forger's, refused, got no acknowledgement (C4).
      expect(messages).toEqual([{ type: "dr-runner/accepted" }, reply]);
      const forger = page.frames().find((frame) => frame.url() === forgerUrl);
      expect(forger).toBeDefined();
      expect(await forger?.evaluate(() => Number(Reflect.get(globalThis, "forgedReplies")))).toBe(0);
    });
  }
});
