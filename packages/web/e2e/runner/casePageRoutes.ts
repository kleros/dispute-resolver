import { expect, type Page, type Route } from "@playwright/test";
import { appOriginOf, CORS_HEADERS, fulfillJson, jsonRpcCall, type JsonRpcRequest } from "../support/network";
import { answerFromFixture, loadRpcFixture } from "./rpcFixture";

// One catch-all route serves every dependency the case page of mainnet dispute 1621 has outside the app: the
// meta-evidence locator and the recorded MetaEvidence event name one path, the gateway serves a test meta-evidence file
// under it and a test script under an allowlisted CID (the allowlist compares paths, not bytes), and the chain-1 JSON-RPC
// reads are answered from fixtures/mainnet-1621.rpc.json. Requests are recognized by their shape, never by host, so the
// build's configured URLs (which carry API keys) appear nowhere here and are never printed. Anything else is aborted. The
// build must have the meta-evidence API and the chain-1 read RPC configured, as a deploy does.
//
// Nothing is imported from @dispute-resolver/core at runtime: its module graph loads jsdom, which Playwright's loader
// cannot load under every Node version the engines field allows, and one load error stops every spec of the run.

export const DISPUTE_ID = "1621";
export const CASE_PATH = `/1/cases/${DISPUTE_ID}`;
export const RUNNER_PATH = "/__runner/index.html";
export const RUNNER_FRAME = `iframe[src="${RUNNER_PATH}"]`;
/** A blank page on the app's origin that frames the runner, served by `serveHarness`. */
export const HARNESS_PATH = "/__runner-e2e/harness.html";
const HARNESS_HTML = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Runner harness</title></head><body></body></html>';

/**
 * The path the governor's MetaEvidence(0) event carries in fixtures/mainnet-1621.rpc.json. The event's URI wins over the
 * locator's, so the locator names the same path and no mismatch warning shows.
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

const RPC_FIXTURE = loadRpcFixture("mainnet-1621.rpc.json");

/** What the routes served, as counts and method names only. */
export interface Traffic {
  locator: number;
  metaEvidence: number;
  script: number;
  rpcAnswered: number;
  readonly rpcUnanswered: string[];
  /** Requests for the display page a spec named. */
  display: number;
  otherIpfs: number;
  readonly aborted: Map<string, number>;
}

function newTraffic(): Traffic {
  return { locator: 0, metaEvidence: 0, script: 0, rpcAnswered: 0, rpcUnanswered: [], display: 0, otherIpfs: 0, aborted: new Map() };
}

async function answerRpc(route: Route, call: JsonRpcRequest, traffic: Traffic): Promise<void> {
  if (await answerFromFixture(route, RPC_FIXTURE, call)) traffic.rpcAnswered += 1;
  else traffic.rpcUnanswered.push(call.method);
}

/** Recognized by its query, whatever host the build names. */
function isLocator(url: URL): boolean {
  return url.searchParams.get("chainId") === "1" && url.searchParams.get("disputeId") === DISPUTE_ID;
}

/** HTML pages outside the app a test adds to the case page's routes, by URL. */
type ExtraPages = Readonly<Record<string, string>>;

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

interface Served {
  readonly appOrigin: string;
  readonly traffic: Traffic;
  readonly pages: ExtraPages;
  readonly metaEvidence: object;
  readonly display: DisplayPage | undefined;
}

async function serve(route: Route, { appOrigin, traffic, pages, metaEvidence, display }: Served): Promise<void> {
  const request = route.request();
  const url = new URL(request.url());
  if (url.origin === appOrigin) return route.continue();
  if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS_HEADERS });
  const call = jsonRpcCall(request);
  if (call !== undefined) return answerRpc(route, call, traffic);
  if (request.method() === "GET" && isLocator(url)) {
    traffic.locator += 1;
    return fulfillJson(route, { metaEvidenceUri: META_EVIDENCE_PATH });
  }
  if (url.pathname === META_EVIDENCE_PATH) {
    traffic.metaEvidence += 1;
    return fulfillJson(route, metaEvidence);
  }
  if (url.pathname === `/ipfs/${SCRIPT_CID}`) {
    traffic.script += 1;
    return route.fulfill({ headers: CORS_HEADERS, contentType: "application/javascript; charset=utf-8", body: SCRIPT_TEXT });
  }
  // The frame's query carries the display parameters, so only the path names the page.
  if (display?.path === url.pathname) {
    traffic.display += 1;
    await display.release;
    return route.fulfill({ headers: CORS_HEADERS, contentType: "text/html; charset=utf-8", body: display.html });
  }
  if (url.pathname.startsWith("/ipfs/")) {
    // Court policies and any other file: not part of these tests, so the gateway has none of them.
    traffic.otherIpfs += 1;
    return route.fulfill({ status: 404, headers: CORS_HEADERS, body: "" });
  }
  const page = pages[url.href];
  if (page !== undefined) return route.fulfill({ contentType: "text/html; charset=utf-8", body: page });
  traffic.aborted.set(url.host, (traffic.aborted.get(url.host) ?? 0) + 1);
  return route.abort("blockedbyclient");
}

export async function routeCasePage(page: Page, baseURL: string | undefined, pages: ExtraPages = {}, options: CasePageOptions = {}): Promise<Traffic> {
  const { display } = options;
  const served: Served = {
    appOrigin: appOriginOf(baseURL),
    traffic: newTraffic(),
    pages,
    metaEvidence: display === undefined ? META_EVIDENCE : { ...META_EVIDENCE, evidenceDisplayInterfaceURI: display.path },
    display,
  };
  await page.route("**/*", (route) => serve(route, served));
  return served.traffic;
}

export async function serveHarness(page: Page, url: string): Promise<void> {
  await page.route(url, (route) => route.fulfill({ contentType: "text/html; charset=utf-8", body: HARNESS_HTML }));
}

/** Fails early, and says why, when the build lacks the configuration the page needs to reach the routed dependencies. */
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

/** Fails with the routed dependency the page never asked for, so a build without the needed configuration says why. */
export function expectEveryDependencyServed(traffic: Traffic): void {
  expect(traffic.locator, "meta-evidence locator requests (needs REACT_APP_METAEVIDENCE_URL in the build)").toBeGreaterThan(0);
  expect(traffic.metaEvidence, "meta-evidence file requests").toBeGreaterThan(0);
  expect(traffic.script, "dynamic script requests").toBeGreaterThan(0);
  expect(traffic.rpcAnswered, "JSON-RPC reads answered from fixtures (needs the chain-1 read RPC in the build)").toBeGreaterThan(0);
  expect(traffic.rpcUnanswered, "JSON-RPC reads missing from the fixtures").toEqual([]);
}
