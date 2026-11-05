import { expect, type Page, type Route } from "@playwright/test";
import { RULING_TOPIC, logFilterFor } from "../support/arbitrator";
import { appOriginOf, callData, CORS_HEADERS, fakeNetwork, loadRecording } from "../support/network";

// The gateway serves a test script under an allowlisted CID: the allowlist compares paths, not bytes. Requests are
// recognized by their shape, so the build's configured URLs (which carry API keys) are never named or printed.
// Nothing from core at runtime: its module graph loads jsdom (see support/arbitrator.ts).

export const DISPUTE_ID = "1621";
export const CASE_PATH = `/1/cases/${DISPUTE_ID}`;
export const RUNNER_PATH = "/__runner/index.html";
export const RUNNER_FRAME = `iframe[src="${RUNNER_PATH}"]`;
export const HARNESS_PATH = "/__runner-e2e/harness.html";
const HARNESS_HTML = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Runner harness</title></head><body></body></html>';

/**
 * The path the governor's MetaEvidence(0) event carries in the recording. The event's URI wins over the locator's, so
 * the recording's locator names the same path and no mismatch warning shows.
 */
const META_EVIDENCE_PATH = "/ipfs/QmZ3Cmnip8bmFNruuTuCdxPymEjyK9VcQEyf2beDYcaHaK/metaEvidence.json";
/** The mainnet governor script's CID (`registry/scripts.ts`), served here with the test script below. */
const SCRIPT_CID = "QmdpXXmNxmdmLqZCabRUC9bZ65c2BN54EuUTRi5SdtiHQ4";

const TITLE_BEFORE_SCRIPT = "Title before the dynamic script";
export const SCRIPT_TITLE = "Title set by the fixture script";
export const SCRIPT_OPTIONS = ["Fixture script option one", "Fixture script option two"] as const;
export const OPTIONS_BEFORE_SCRIPT = ["Option before the script A", "Option before the script B"] as const;

/** How long the test script waits before resolving, so the runner frame is still open to be inspected. */
const SCRIPT_DELAY_MS = 2_000;

const META_EVIDENCE = {
  title: TITLE_BEFORE_SCRIPT,
  description: "Meta-evidence served by the runner engine test.",
  question: "Which option does the fixture script choose?",
  rulingOptions: { type: "single-select", titles: OPTIONS_BEFORE_SCRIPT },
  dynamicScriptURI: `/ipfs/${SCRIPT_CID}`,
};

const SCRIPT_TEXT = `
var getMetaEvidence = function () {
  setTimeout(function () {
    resolveScript({ title: ${JSON.stringify(SCRIPT_TITLE)}, rulingOptions: { type: "single-select", titles: ${JSON.stringify(SCRIPT_OPTIONS)} } });
  }, ${String(SCRIPT_DELAY_MS)});
};`;

const RECORDING = loadRecording(new URL("../app/fixtures/mainnet-1621-appeal.json", import.meta.url));
/** `disputes(1621)` on the arbitrator. */
const DISPUTES_CALL = "0x564a565d0000000000000000000000000000000000000000000000000000000000000655";
/** Its answer on chain: the dispute executed (period 4) and ruled. */
const EXECUTED_DISPUTE =
  "0x0000000000000000000000000000000000000000000000000000000000000004000000000000000000000000327a29fce0a6490e4236240be176daa282eccfdf00000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000006588146f000000000000000000000000000000000000000000000000000000000000000500000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001";

export interface Traffic {
  readonly locator: number;
  readonly metaEvidence: number;
  readonly script: number;
  readonly rpcAnswered: number;
  readonly rpcUnanswered: readonly string[];
  readonly display: number;
}

/** An evidence-display page the meta-evidence names and the gateway route serves, recognized by its path alone. */
export interface DisplayPage {
  /** A content-addressed `/ipfs/<CID>/…` path, as the meta-evidence names it. */
  readonly path: string;
  readonly html: string;
  /** Holds the answer until it resolves, as a slow gateway would; the page is answered at once without it. */
  readonly release?: Promise<void>;
}

interface CasePageOptions {
  readonly display?: DisplayPage;
}

/**
 * Answers the GETs for `path` on any host; every other method, a CORS preflight included, falls through to the network's
 * route. A page route wins over the context's, so the gateway's own answer for the path is never reached.
 */
async function serveGet(page: Page, path: string, serve: (route: Route) => Promise<void>): Promise<void> {
  await page.route(
    (url) => url.pathname === path,
    (route) => (route.request().method() === "GET" ? serve(route) : route.fallback()),
  );
}

export async function routeCasePage(page: Page, baseURL: string | undefined, { display }: CasePageOptions = {}): Promise<Traffic> {
  const metaEvidence = display === undefined ? META_EVIDENCE : { ...META_EVIDENCE, evidenceDisplayInterfaceURI: display.path };
  const network = await fakeNetwork(page.context(), {
    appOrigin: appOriginOf(baseURL),
    recordings: [RECORDING],
    // The recording answers the dispute in the appeal period for e2e/app's Fund cards; these specs need it executed, and
    // the executed dispute's decision scans the governor for its Ruling event, which the recording does not hold.
    rpc: (call) => {
      if (callData(call) === DISPUTES_CALL) return { result: EXECUTED_DISPUTE };
      return logFilterFor(call, RULING_TOPIC) === undefined ? undefined : { result: [] };
    },
    http: (request) => {
      if (request.kind !== "gateway") return undefined;
      return request.path === META_EVIDENCE_PATH ? { json: metaEvidence } : { status: 404 };
    },
  });
  const served = { script: 0, display: 0 };
  await serveGet(page, `/ipfs/${SCRIPT_CID}`, async (route) => {
    served.script += 1;
    await route.fulfill({ headers: CORS_HEADERS, contentType: "application/javascript; charset=utf-8", body: SCRIPT_TEXT });
  });
  // The frame's query carries the display parameters, so only the path names the page.
  if (display !== undefined) {
    await serveGet(page, display.path, async (route) => {
      served.display += 1;
      await display.release;
      await route.fulfill({ headers: CORS_HEADERS, contentType: "text/html; charset=utf-8", body: display.html });
    });
  }
  return {
    get locator() {
      return network.http.filter((request) => request.kind === "locator" && request.disputeId === DISPUTE_ID).length;
    },
    get metaEvidence() {
      return network.http.filter((request) => request.kind === "gateway" && request.path === META_EVIDENCE_PATH).length;
    },
    get script() {
      return served.script;
    },
    get rpcAnswered() {
      return network.rpc.length - network.rpcUnanswered.length;
    },
    rpcUnanswered: network.rpcUnanswered,
    get display() {
      return served.display;
    },
  };
}

export async function serveHarness(page: Page, url: string): Promise<void> {
  await page.route(url, (route) => route.fulfill({ contentType: "text/html; charset=utf-8", body: HARNESS_HTML }));
}

export async function expectConfiguredBuild(traffic: Traffic): Promise<void> {
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

export function expectEveryDependencyServed(traffic: Traffic): void {
  expect(traffic.locator, "meta-evidence locator requests (needs REACT_APP_METAEVIDENCE_URL in the build)").toBeGreaterThan(0);
  expect(traffic.metaEvidence, "meta-evidence file requests").toBeGreaterThan(0);
  expect(traffic.script, "dynamic script requests").toBeGreaterThan(0);
  expect(traffic.rpcAnswered, "JSON-RPC reads answered from fixtures (needs the chain-1 read RPC in the build)").toBeGreaterThan(0);
  expect(traffic.rpcUnanswered, "JSON-RPC reads missing from the fixtures").toEqual([]);
}
