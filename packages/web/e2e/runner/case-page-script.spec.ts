import { expect, test, type Page, type Route } from "@playwright/test";
import { answerFromFixture, CORS_HEADERS, fulfillJson, jsonRpcCall, loadRpcFixture, type JsonRpcRequest } from "./rpcFixture";

// The dynamic-script path of a case page end to end (ADR 0004, ARCHITECTURE.md §7), in every engine the runner projects
// of playwright.config.ts name, against the built app under `vite preview`: the host frames the runner, the classic
// bootstrap runs the script in an opaque-origin document and the result is rendered. Run with `yarn e2e:runner`.
//
// Network-free: one catch-all route of each page serves every dependency the case page has outside the app (C9: the
// doubles live in this file only). The meta-evidence locator answers with a test meta-evidence file, the gateway serves
// that file and a test script under an allowlisted CID (the allowlist compares paths, not bytes), and the chain-1
// JSON-RPC reads are answered from fixtures/mainnet-1621.rpc.json. Requests are recognized by their shape, never by
// host, so the build's configured URLs (which carry API keys) appear nowhere here and are never printed. Anything else
// is aborted. The build must have the meta-evidence API and the chain-1 read RPC configured, as a deploy does.
//
// Nothing is imported from @dispute-resolver/core at runtime: its module graph loads jsdom, which Playwright's loader
// cannot load under every Node version the engines field allows, and one load error stops every spec of the run.

const DISPUTE_ID = "1621";
const CASE_PATH = `/1/cases/${DISPUTE_ID}`;
const RUNNER_PATH = "/__runner/index.html";
const RUNNER_FRAME = `iframe[src="${RUNNER_PATH}"]`;

/** A content-addressed path no real file has: the meta-evidence the locator names. */
const META_EVIDENCE_CID = "QmRunnerEngineFixtureMetaEvidenceJsonForTestsX";
/** The mainnet governor script's CID (`registry/scripts.ts`), served here with the test script below. */
const SCRIPT_CID = "QmdpXXmNxmdmLqZCabRUC9bZ65c2BN54EuUTRi5SdtiHQ4";

const TITLE_BEFORE_SCRIPT = "Title before the dynamic script";
const SCRIPT_TITLE = "Title set by the fixture script";
const FORGED_TITLE = "Title forged by a foreign window";
const SCRIPT_OPTIONS = ["Fixture script option one", "Fixture script option two"] as const;

/** How long the test script waits before resolving, so the runner frame is still open to be inspected. */
const SCRIPT_DELAY_MS = 2_000;
/** The case page's meta-evidence budget: `CASE_PAGE_BUDGET_MS` of packages/core/src/metaEvidence/load.ts (D-38). */
const CASE_PAGE_BUDGET_MS = 120_000;
/** "Well within the budget": a quarter of the case page's meta-evidence budget (D-38). */
const RENDER_LIMIT_MS = CASE_PAGE_BUDGET_MS / 4;

const META_EVIDENCE = {
  title: TITLE_BEFORE_SCRIPT,
  description: "Meta-evidence served by the runner engine test.",
  question: "Which option does the fixture script choose?",
  rulingOptions: { type: "single-select", titles: ["Option before the script A", "Option before the script B"] },
  dynamicScriptURI: `/ipfs/${SCRIPT_CID}`,
};

const SCRIPT_TEXT = `
var getMetaEvidence = function () {
  setTimeout(function () {
    resolveScript({ title: ${JSON.stringify(SCRIPT_TITLE)}, rulingOptions: { type: "single-select", titles: ${JSON.stringify(SCRIPT_OPTIONS)} } });
  }, ${String(SCRIPT_DELAY_MS)});
};`;

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
  version: 1,
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

const RPC_FIXTURE = loadRpcFixture("mainnet-1621.rpc.json");

/** What the routes served, as counts and method names only. */
interface Traffic {
  locator: number;
  metaEvidence: number;
  script: number;
  rpcAnswered: number;
  readonly rpcUnanswered: string[];
  otherIpfs: number;
  readonly aborted: Map<string, number>;
}

function newTraffic(): Traffic {
  return { locator: 0, metaEvidence: 0, script: 0, rpcAnswered: 0, rpcUnanswered: [], otherIpfs: 0, aborted: new Map() };
}

async function answerRpc(route: Route, call: JsonRpcRequest, traffic: Traffic): Promise<void> {
  if (await answerFromFixture(route, RPC_FIXTURE, call)) traffic.rpcAnswered += 1;
  else traffic.rpcUnanswered.push(call.method);
}

/** The meta-evidence locator, recognized by its query (spec 9.1 step 1), whatever host the build names. */
function isLocator(url: URL): boolean {
  return url.searchParams.get("chainId") === "1" && url.searchParams.get("disputeId") === DISPUTE_ID;
}

/** Serves one request of the case page: the app's own files from the preview server, everything else from this file. */
async function serve(route: Route, appOrigin: string, traffic: Traffic): Promise<void> {
  const request = route.request();
  const url = new URL(request.url());
  if (url.origin === appOrigin) {
    await route.continue();
    return;
  }
  if (request.method() === "OPTIONS") {
    await route.fulfill({ status: 204, headers: CORS_HEADERS });
    return;
  }
  const call = jsonRpcCall(request);
  if (call !== undefined) {
    await answerRpc(route, call, traffic);
    return;
  }
  if (request.method() === "GET" && isLocator(url)) {
    traffic.locator += 1;
    await fulfillJson(route, { metaEvidenceUri: `/ipfs/${META_EVIDENCE_CID}` });
    return;
  }
  if (url.pathname === `/ipfs/${META_EVIDENCE_CID}`) {
    traffic.metaEvidence += 1;
    await fulfillJson(route, META_EVIDENCE);
    return;
  }
  if (url.pathname === `/ipfs/${SCRIPT_CID}`) {
    traffic.script += 1;
    await route.fulfill({ headers: CORS_HEADERS, contentType: "application/javascript; charset=utf-8", body: SCRIPT_TEXT });
    return;
  }
  if (url.pathname.startsWith("/ipfs/")) {
    // Court policies and any other file: not part of this test, so the gateway has none of them.
    traffic.otherIpfs += 1;
    await route.fulfill({ status: 404, headers: CORS_HEADERS, body: "" });
    return;
  }
  if (url.href === FORGER_URL) {
    await route.fulfill({ contentType: "text/html; charset=utf-8", body: FORGER_HTML });
    return;
  }
  traffic.aborted.set(url.host, (traffic.aborted.get(url.host) ?? 0) + 1);
  await route.abort("blockedbyclient");
}

async function routeCasePage(page: Page, baseURL: string | undefined): Promise<Traffic> {
  const traffic = newTraffic();
  const appOrigin = new URL(baseURL ?? "http://localhost").origin;
  await page.route("**/*", (route) => serve(route, appOrigin, traffic));
  return traffic;
}

/** Fails early, and says why, when the build lacks the configuration the page needs to reach the routed dependencies. */
async function expectConfiguredBuild(traffic: Traffic): Promise<void> {
  await expect
    .poll(() => traffic.locator, { message: "meta-evidence locator never requested (needs REACT_APP_METAEVIDENCE_URL in the build)", timeout: 15_000 })
    .toBeGreaterThan(0);
  await expect
    .poll(() => traffic.rpcAnswered, { message: "no JSON-RPC read answered from fixtures (needs the chain-1 read RPC in the build)", timeout: 15_000 })
    .toBeGreaterThan(0);
  // The host fetches only an allowlisted script, so a script never requested means its CID left the allowlist.
  await expect
    .poll(() => traffic.script, {
      message: `dynamic script never requested (is ${SCRIPT_CID} still on the chain-1 allowlist of packages/core/src/registry/scripts.ts?)`,
      timeout: 30_000,
    })
    .toBeGreaterThan(0);
}

/** Fails with the routed dependency the page never asked for, so a build without the needed configuration says why. */
function expectEveryDependencyServed(traffic: Traffic): void {
  expect(traffic.locator, "meta-evidence locator requests (needs REACT_APP_METAEVIDENCE_URL in the build)").toBeGreaterThan(0);
  expect(traffic.metaEvidence, "meta-evidence file requests").toBeGreaterThan(0);
  expect(traffic.script, "dynamic script requests").toBeGreaterThan(0);
  expect(traffic.rpcAnswered, "JSON-RPC reads answered from fixtures (needs the chain-1 read RPC in the build)").toBeGreaterThan(0);
  expect(traffic.rpcUnanswered, "JSON-RPC reads missing from the fixtures").toEqual([]);
}

test.describe("case page dynamic script (ADR 0004)", () => {
  test("§7.3, D-38: an allowlisted script's title and ruling options are rendered well within the budget", async ({ page, baseURL }) => {
    test.setTimeout(RENDER_LIMIT_MS + 30_000);
    const traffic = await routeCasePage(page, baseURL);

    const started = Date.now();
    await page.goto(CASE_PATH);
    await expectConfiguredBuild(traffic);
    await expect(page.getByTestId("case-title")).toHaveText(SCRIPT_TITLE, { timeout: RENDER_LIMIT_MS });
    const renderedMs = Date.now() - started;
    test.info().annotations.push({ type: "script-rendered-ms", description: String(renderedMs) });

    const options = await page.getByTestId("case-ruling-options").getAttribute("data-ruling-options");
    expect(JSON.parse(options ?? "null")).toMatchObject({ type: "single-select", titles: SCRIPT_OPTIONS });
    // Dispute 1621's recorded ruling is 2, so the decision names the script's second option.
    await expect(page.getByTestId("case-decision-ruling")).toHaveText(SCRIPT_OPTIONS[1]);
    // The run settled: the host removed its frame (B8).
    await expect(page.locator(RUNNER_FRAME)).toHaveCount(0);
    expect(renderedMs).toBeLessThan(RENDER_LIMIT_MS);
    expectEveryDependencyServed(traffic);
  });

  test("B4, C4, B1, D-05: the app's runner frame is sandboxed without allow-same-origin, runs at an opaque origin and ignores a foreign window", async ({ page, baseURL }) => {
    test.setTimeout(RENDER_LIMIT_MS + 30_000);
    const traffic = await routeCasePage(page, baseURL);
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

    await expect(page.getByTestId("case-title")).toHaveText(SCRIPT_TITLE, { timeout: RENDER_LIMIT_MS });
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

      const reply = await page.evaluate(
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

          const channel = new MessageChannel();
          const answer = new Promise<unknown>((resolve) => {
            channel.port1.onmessage = (event: MessageEvent<unknown>) => {
              resolve(event.data);
            };
            setTimeout(() => {
              resolve(null);
            }, 10_000);
          });
          // eslint-disable-next-line sonarjs/post-message -- ADR 0004: "*" is the only target origin an opaque-origin runner accepts.
          runner.contentWindow?.postMessage({ type: "dr-runner/run", version: 1, scriptText, params, guardSource: null, rpcRedirects: [] }, "*", [channel.port2]);
          return answer;
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
      const forger = page.frames().find((frame) => frame.url() === forgerUrl);
      expect(forger).toBeDefined();
      expect(await forger?.evaluate(() => Number(Reflect.get(globalThis, "forgedReplies")))).toBe(0);
    });
  }
});
