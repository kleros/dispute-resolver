import { expect, type Page, type Route } from "@playwright/test";
import { answerFromFixture, CORS_HEADERS, fulfillJson, jsonRpcCall, loadRpcFixture, type JsonRpcRequest } from "./rpcFixture";

// The routes of the built case page of mainnet dispute 1621 that the runner specs drive (ADR 0004, ARCHITECTURE.md §7.4;
// C9: the doubles live in e2e only). One catch-all route serves every dependency the case page has outside the app:
// the meta-evidence locator and the recorded MetaEvidence event name one path, the gateway serves a test meta-evidence
// file under it and a test script under an allowlisted CID (the allowlist compares paths, not bytes), and the chain-1
// JSON-RPC reads are answered from fixtures/mainnet-1621.rpc.json. Requests are recognized by their shape, never by
// host, so the build's configured URLs (which carry API keys) appear nowhere here and are never printed. Anything else
// is aborted. The build must have the meta-evidence API and the chain-1 read RPC configured, as a deploy does.
//
// Nothing is imported from @dispute-resolver/core at runtime: its module graph loads jsdom, which Playwright's loader
// cannot load under every Node version the engines field allows, and one load error stops every spec of the run.

export const DISPUTE_ID = "1621";
export const CASE_PATH = `/1/cases/${DISPUTE_ID}`;
export const RUNNER_PATH = "/__runner/index.html";
export const RUNNER_FRAME = `iframe[src="${RUNNER_PATH}"]`;

/**
 * The meta-evidence path the governor's MetaEvidence(0) event carries in fixtures/mainnet-1621.rpc.json. Under P-25 the
 * event's URI wins over the locator's, so the locator names the same path (no mismatch) and the gateway route serves the
 * test meta-evidence below under it.
 */
const META_EVIDENCE_PATH = "/ipfs/QmZ3Cmnip8bmFNruuTuCdxPymEjyK9VcQEyf2beDYcaHaK/metaEvidence.json";
/** The mainnet governor script's CID (`registry/scripts.ts`), served here with the test script below. */
export const SCRIPT_CID = "QmdpXXmNxmdmLqZCabRUC9bZ65c2BN54EuUTRi5SdtiHQ4";

const TITLE_BEFORE_SCRIPT = "Title before the dynamic script";
export const SCRIPT_TITLE = "Title set by the fixture script";
export const SCRIPT_OPTIONS = ["Fixture script option one", "Fixture script option two"] as const;
export const OPTIONS_BEFORE_SCRIPT = ["Option before the script A", "Option before the script B"] as const;

/** How long the test script waits before resolving, so the runner frame is still open to be inspected. */
export const SCRIPT_DELAY_MS = 2_000;

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

/** HTML pages outside the app a test adds to the case page's routes, by URL. */
export type ExtraPages = Readonly<Record<string, string>>;

/** Serves one request of the case page: the app's own files from the preview server, everything else from this file. */
async function serve(route: Route, appOrigin: string, traffic: Traffic, pages: ExtraPages): Promise<void> {
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
    await fulfillJson(route, { metaEvidenceUri: META_EVIDENCE_PATH });
    return;
  }
  if (url.pathname === META_EVIDENCE_PATH) {
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
    // Court policies and any other file: not part of these tests, so the gateway has none of them.
    traffic.otherIpfs += 1;
    await route.fulfill({ status: 404, headers: CORS_HEADERS, body: "" });
    return;
  }
  const page = pages[url.href];
  if (page !== undefined) {
    await route.fulfill({ contentType: "text/html; charset=utf-8", body: page });
    return;
  }
  traffic.aborted.set(url.host, (traffic.aborted.get(url.host) ?? 0) + 1);
  await route.abort("blockedbyclient");
}

/** Routes every request of `page` through `serve` and returns the counts it keeps. */
export async function routeCasePage(page: Page, baseURL: string | undefined, pages: ExtraPages = {}): Promise<Traffic> {
  const traffic = newTraffic();
  const appOrigin = new URL(baseURL ?? "http://localhost").origin;
  await page.route("**/*", (route) => serve(route, appOrigin, traffic, pages));
  return traffic;
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
