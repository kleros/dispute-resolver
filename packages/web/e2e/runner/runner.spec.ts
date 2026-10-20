import { expect, test, type Browser, type BrowserType, type LaunchOptions, type Page } from "@playwright/test";
import { answerFromFixture, CORS_HEADERS, jsonRpcCall, loadRpcFixture, type RpcFixture } from "./rpcFixture";

// Playwright checks of the script runner (ADR 0004, ARCHITECTURE.md §7.4), run against `vite preview`, whose runner
// plugin sends the runner policy of §10.1 on /__runner/*. Guard tests strip that header, as a header misconfiguration
// would, so they prove the bootstrap's own checks (C4). Run with `yarn e2e:runner` (Chromium, Firefox and WebKit).

const RUNNER_URL = "/__runner/index.html";
const SAME_ORIGIN_HARNESS = "/__runner-e2e/harness.html";
const FOREIGN_HARNESS = "http://foreign-parent.test/harness.html";

// A runner page served through a test route has no network address, so Chromium's local network access checks would
// stop it from loading its bootstrap from the loopback preview server and a guard test would pass without the
// bootstrap ever running. Guard tests that strip the runner policy therefore run with those checks off (Firefox and
// WebKit have none) and assert that the bootstrap loaded.
const WITHOUT_LOCAL_NETWORK_CHECKS = "--disable-features=LocalNetworkAccessChecks";
const HARNESS_HTML = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Runner harness</title></head><body></body></html>';
const RUNNER_POLICY = "sandbox allow-scripts; frame-ancestors 'self'; script-src 'self' 'unsafe-eval'; object-src 'none'; base-uri 'none'";

/** How long a guard test waits for a reply that must never come. */
const SILENCE_MS = 2_000;

const PARAMS_1650 = {
  disputeID: "1650",
  arbitrableContractAddress: "0x2018038203aee8e7a29dabd73771b0355d4f85ad",
  arbitratorChainID: 1,
  arbitrableChainID: 1,
  arbitratorJsonRpcUrl: "https://rpc.invalid/mainnet",
  arbitrableJsonRpcUrl: "https://rpc.invalid/mainnet",
};

// Probes what a script can reach from inside the runner: its origin, its own and its parent's storage, its parent's
// DOM, the document's charset and a literal non-ASCII delimiter. It also signals the parent window directly, so a
// guard test sees any evaluation even when no port reply is accepted.
const PROBE_SCRIPT = `
window.parent.postMessage("evaluated", "*");
var getMetaEvidence = function () {
  function attempt(read) { try { return read(); } catch (error) { return "blocked:" + error.name; } }
  resolveScript({
    origin: self.origin,
    ownStorage: attempt(function () { return typeof window.localStorage.getItem("dr-e2e"); }),
    parentStorage: attempt(function () { return window.parent.localStorage.getItem("dr-e2e"); }),
    parentDocument: attempt(function () { return window.parent.document.title; }),
    charset: document.characterSet,
    delimiterParts: "Harris␟Trump".split("␟"),
    disputeID: scriptParameters.disputeID,
  });
};`;

/** What the probe resolves with in a correctly sandboxed runner (§7.1, B4, C7). */
const PROBE_RESULT = {
  type: "dr-runner/result",
  value: {
    origin: "null",
    ownStorage: "blocked:SecurityError",
    parentStorage: "blocked:SecurityError",
    parentDocument: "blocked:SecurityError",
    charset: "UTF-8",
    delimiterParts: ["Harris", "Trump"],
    disputeID: "1650",
  },
  jsonDuplicateKeys: false,
};

interface RunInput {
  readonly scriptText: string;
  readonly params?: Record<string, unknown>;
  readonly runnerUrl?: string;
  readonly sandbox: boolean;
  readonly waitMs: number;
}

interface RunOutput {
  /** Every message the port carried, in order, until the reply or the end of the wait (P-16). */
  readonly messages: unknown[];
  /** The first message that is not the acknowledgement, or `null` when none came within the wait. */
  readonly reply: unknown;
  readonly evaluatedSignal: boolean;
  /** Milliseconds from appending the frame to the acknowledgement, as the host's window counts them; `null` without one. */
  readonly ackLatencyMs: number | null;
}

/** Frames the runner from the current page, posts one run request with a fresh port and collects what comes back. */
async function runInRunner(page: Page, input: RunInput): Promise<RunOutput> {
  return page.evaluate(
    async ({ scriptText, params, runnerUrl, sandbox, waitMs }) => {
      const frame = document.createElement("iframe");
      if (sandbox) frame.setAttribute("sandbox", "allow-scripts");
      frame.src = runnerUrl;
      let evaluatedSignal = false;
      // The probe signals from the runner frame: "null" when sandboxed, the runner URL's origin when not.
      const runnerOrigins = new Set(["null", new URL(runnerUrl, location.href).origin]);
      window.addEventListener("message", (event) => {
        if (runnerOrigins.has(event.origin) && event.data === "evaluated") evaluatedSignal = true;
      });
      const appendedAt = performance.now();
      await new Promise<void>((resolve) => {
        frame.addEventListener("load", () => {
          resolve();
        });
        document.body.append(frame);
      });
      const channel = new MessageChannel();
      const messages: unknown[] = [];
      let ackLatencyMs: number | null = null;
      const reply = new Promise<unknown>((resolve) => {
        channel.port1.onmessage = (event: MessageEvent<unknown>) => {
          const data: unknown = event.data;
          messages.push(data);
          const isAcknowledgement = typeof data === "object" && data !== null && Reflect.get(data, "type") === "dr-runner/accepted";
          if (!isAcknowledgement) resolve(data);
          else ackLatencyMs ??= Math.round(performance.now() - appendedAt);
        };
        setTimeout(() => {
          resolve(null);
        }, waitMs);
      });
      // eslint-disable-next-line sonarjs/post-message -- ADR 0004: "*" is the only target origin an opaque-origin runner accepts.
      frame.contentWindow?.postMessage({ type: "dr-runner/run", version: 2, scriptText, params, guardSource: null, rpcRedirects: [] }, "*", [channel.port2]);
      return { reply: await reply, messages: [...messages], evaluatedSignal, ackLatencyMs };
    },
    { scriptText: input.scriptText, params: input.params ?? PARAMS_1650, runnerUrl: input.runnerUrl ?? RUNNER_URL, sandbox: input.sandbox, waitMs: input.waitMs },
  );
}

async function serveHarness(page: Page, url: string): Promise<void> {
  await page.route(url, (route) => route.fulfill({ contentType: "text/html; charset=utf-8", body: HARNESS_HTML }));
}

/** Records whether the runner bootstrap was served and whether any request for it failed. */
function trackBootstrap(page: Page): () => { readonly served: boolean; readonly failed: boolean } {
  let served = false;
  let failed = false;
  page.on("requestfinished", (request) => {
    if (request.url().endsWith("/__runner/bootstrap.js")) served = true;
  });
  page.on("requestfailed", (request) => {
    if (request.url().endsWith("/__runner/bootstrap.js")) failed = true;
  });
  return () => ({ served, failed });
}

/** Asserts the runner frame loaded its bootstrap and that no script-facing global was ever defined in it. */
async function expectLoadedButIdle(page: Page, bootstrap: () => { readonly served: boolean; readonly failed: boolean }): Promise<void> {
  expect(bootstrap()).toEqual({ served: true, failed: false });
  const runnerFrame = page.frames().find((frame) => frame.url().endsWith(RUNNER_URL));
  expect(runnerFrame).toBeDefined();
  expect(await runnerFrame?.evaluate(() => typeof Reflect.get(globalThis, "scriptParameters"))).toBe("undefined");
}

/** A browser of the project's engine with its launch options, without Chromium's local network access checks. */
async function launchWithoutLocalNetworkChecks(engine: BrowserType, launchOptions: LaunchOptions): Promise<Browser> {
  if (engine.name() !== "chromium") return engine.launch(launchOptions);
  return engine.launch({ ...launchOptions, args: [...(launchOptions.args ?? []), WITHOUT_LOCAL_NETWORK_CHECKS] });
}

/** Serves the runner without its policy header, as a misconfigured deploy would. */
async function stripRunnerPolicy(page: Page): Promise<void> {
  await page.route(`**${RUNNER_URL}`, async (route) => {
    const response = await route.fetch();
    const headers = Object.fromEntries(Object.entries(response.headers()).filter(([name]) => name.toLowerCase() !== "content-security-policy"));
    await route.fulfill({ response, headers });
  });
}

test.describe("script runner page (ADR 0004)", () => {
  test("C3: the runner is served with its enforced sandbox policy", async ({ request }) => {
    const response = await request.get(RUNNER_URL);
    expect(response.headers()["content-security-policy"]).toBe(RUNNER_POLICY);
    expect((await request.get("/__runner/bootstrap.js")).headers()["content-security-policy"]).toBe(RUNNER_POLICY);
  });

  test("§7.1, B4, C7: a sandboxed runner loads its classic bootstrap, runs the script with an opaque origin and replies through the port", async ({ page }) => {
    await serveHarness(page, `**${SAME_ORIGIN_HARNESS}`);
    await page.goto(SAME_ORIGIN_HARNESS);
    await page.evaluate(() => {
      window.localStorage.setItem("dr-e2e", "app secret");
    });

    const { reply } = await runInRunner(page, { scriptText: PROBE_SCRIPT, sandbox: true, waitMs: 15_000 });

    expect(reply).toEqual(PROBE_RESULT);
  });

  test("P-16, §7.1: the sandboxed runner acknowledges on the port before it replies", async ({ page }) => {
    await serveHarness(page, `**${SAME_ORIGIN_HARNESS}`);
    await page.goto(SAME_ORIGIN_HARNESS);

    const { messages, reply, ackLatencyMs } = await runInRunner(page, { scriptText: PROBE_SCRIPT, sandbox: true, waitMs: 15_000 });

    test.info().annotations.push({ type: "ack-latency-ms", description: String(ackLatencyMs) });
    expect(messages).toEqual([{ type: "dr-runner/accepted" }, PROBE_RESULT]);
    expect(reply).toEqual(PROBE_RESULT);
    expect(ackLatencyMs).not.toBeNull();
  });

  test("C4: the runner loaded without the sandbox attribute or its header evaluates nothing", async ({ page }) => {
    const bootstrap = trackBootstrap(page);
    await stripRunnerPolicy(page);
    await serveHarness(page, `**${SAME_ORIGIN_HARNESS}`);
    await page.goto(SAME_ORIGIN_HARNESS);

    const { messages, reply, evaluatedSignal } = await runInRunner(page, { scriptText: PROBE_SCRIPT, sandbox: false, waitMs: SILENCE_MS });

    // Not even an acknowledgement: a refused request learns nothing (C4, P-16).
    expect(messages).toEqual([]);
    expect(reply).toBeNull();
    expect(evaluatedSignal).toBe(false);
    await expectLoadedButIdle(page, bootstrap);
  });

  test("C4: the runner framed by a parent outside the app evaluates nothing", async ({ playwright, browserName, launchOptions, baseURL }) => {
    const browser = await launchWithoutLocalNetworkChecks(playwright[browserName], launchOptions);
    try {
      const page = await browser.newPage();
      const bootstrap = trackBootstrap(page);
      await stripRunnerPolicy(page);
      await serveHarness(page, FOREIGN_HARNESS);
      await page.goto(FOREIGN_HARNESS);

      const { messages, reply, evaluatedSignal } = await runInRunner(page, {
        scriptText: PROBE_SCRIPT,
        runnerUrl: `${baseURL ?? ""}${RUNNER_URL}`,
        sandbox: true,
        waitMs: SILENCE_MS,
      });

      // Not even an acknowledgement: a refused request learns nothing (C4, P-16).
      expect(messages).toEqual([]);
      expect(reply).toBeNull();
      expect(evaluatedSignal).toBe(false);
      await expectLoadedButIdle(page, bootstrap);
    } finally {
      await browser.close();
    }
  });

  test("C4: the runner opened as the top-level page evaluates nothing", async ({ page }) => {
    const bootstrap = trackBootstrap(page);
    await page.goto(RUNNER_URL);
    const evaluated = await page.evaluate(
      async ({ scriptText, params, waitMs }) => {
        // Every message on the port for the whole wait: a refused request gets none, not even an acknowledgement (P-16).
        const channel = new MessageChannel();
        const messages: unknown[] = [];
        channel.port1.onmessage = (event: MessageEvent<unknown>) => {
          messages.push(event.data);
        };
        // eslint-disable-next-line sonarjs/post-message -- the top-level runner is sandboxed by its header, so its own origin is opaque.
        window.postMessage({ type: "dr-runner/run", version: 2, scriptText, params, guardSource: null, rpcRedirects: [] }, "*", [channel.port2]);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        return { messages, reply: messages[0] ?? null, scriptParameters: typeof Reflect.get(globalThis, "scriptParameters") };
      },
      { scriptText: "var getMetaEvidence = function () { resolveScript({}); };", params: PARAMS_1650, waitMs: SILENCE_MS },
    );
    expect(evaluated).toEqual({ messages: [], reply: null, scriptParameters: "undefined" });
    expect(bootstrap()).toEqual({ served: true, failed: false });
  });
});

// C7, ADR 0004: the charset-sensitive Reality renderer against mainnet dispute 1650. The script is fetched from the IPFS
// gateway by its content address; its chain reads are answered from fixtures/mainnet-1650.rpc.json, recorded at the
// block it names, and anything else it requests is aborted, so the test needs no RPC configuration.
const QMQGMR_URL = "https://cdn.kleros.link/ipfs/QmQGMR6MyC851poYVyBfGthzmCdvTuRFKp1UDB19p89Gcn/bundle.js";
const RPC_FIXTURE_1650 = loadRpcFixture("mainnet-1650.rpc.json");
/** Reality's reserved "Answered Too Soon" answer. */
const ANSWERED_TOO_SOON = "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF";

/** What the script's routes served, as counts and method names only. */
interface ScriptTraffic {
  rpcAnswered: number;
  readonly rpcUnanswered: string[];
  aborted: number;
}

/** Answers the script's JSON-RPC calls from `fixture` and aborts every other request that leaves the app's origin. */
async function routeScriptReads(page: Page, appOrigin: string, fixture: RpcFixture): Promise<ScriptTraffic> {
  const traffic: ScriptTraffic = { rpcAnswered: 0, rpcUnanswered: [], aborted: 0 };
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (new URL(request.url()).origin === appOrigin) {
      await route.continue();
      return;
    }
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: CORS_HEADERS });
      return;
    }
    const call = jsonRpcCall(request);
    if (call === undefined) {
      traffic.aborted += 1;
      await route.abort("blockedbyclient");
      return;
    }
    if (await answerFromFixture(route, fixture, call)) traffic.rpcAnswered += 1;
    else traffic.rpcUnanswered.push(call.method);
  });
  return traffic;
}

test.describe("script runner on a recorded dispute (C7)", () => {
  test("C7: QmQGMR… against mainnet dispute 1650 returns Harris, Trump and Answered Too Soon", async ({ page, request, baseURL }) => {
    test.setTimeout(120_000);
    const scriptResponse = await request.get(QMQGMR_URL);
    expect(scriptResponse.ok()).toBe(true);
    const scriptText = await scriptResponse.text();

    const traffic = await routeScriptReads(page, new URL(baseURL ?? "http://localhost").origin, RPC_FIXTURE_1650);
    await serveHarness(page, `**${SAME_ORIGIN_HARNESS}`);
    await page.goto(SAME_ORIGIN_HARNESS);
    const { reply } = await runInRunner(page, { scriptText, sandbox: true, waitMs: 90_000 });

    expect(reply).toEqual({
      type: "dr-runner/result",
      value: { rulingOptions: { type: "single-select", titles: ["Harris", "Trump"], reserved: { [ANSWERED_TOO_SOON]: "Answered Too Soon" } } },
      jsonDuplicateKeys: false,
    });
    expect(traffic.rpcAnswered, "JSON-RPC reads answered from the fixture").toBeGreaterThan(0);
    expect(traffic.rpcUnanswered, "JSON-RPC reads missing from the fixture").toEqual([]);
    expect(traffic.aborted, "requests other than JSON-RPC reads").toBe(0);
  });
});

// B1 needs the C1 headers (frame-ancestors 'none' on the app), which only the deploy sends: `vite preview` does not
// apply public/_headers. Set DR_E2E_DEPLOY_URL to the branch deploy's origin to run it.
const DEPLOY_URL = process.env.DR_E2E_DEPLOY_URL;
const PUBLIC_FOREIGN_HARNESS = "https://foreign-parent.example/harness.html";

test.describe("app framing (B1)", () => {
  // Skipped without a deploy URL: only the deploy sends the C1 headers this test proves.
  test.skip(DEPLOY_URL === undefined || DEPLOY_URL.trim() === "", "needs DR_E2E_DEPLOY_URL (the branch deploy) for the C1 headers");

  test("B1: a page outside the app cannot frame it, so it has no app window to inject a result into", async ({ page }) => {
    const appUrl = new URL("/1/cases/1650", DEPLOY_URL).href;
    const refusals: string[] = [];
    page.on("console", (message) => {
      if (message.text().includes("frame-ancestors")) refusals.push(message.text());
    });
    await serveHarness(page, PUBLIC_FOREIGN_HARNESS);
    await page.goto(PUBLIC_FOREIGN_HARNESS);

    await page.evaluate((url) => {
      const frame = document.createElement("iframe");
      frame.src = url;
      document.body.append(frame);
    }, appUrl);

    await expect.poll(() => refusals.length, { timeout: 15_000 }).toBeGreaterThan(0);
    const appOrigin = new URL(appUrl).origin;
    expect(page.frames().filter((frame) => frame.url().startsWith(appOrigin))).toEqual([]);
  });
});
