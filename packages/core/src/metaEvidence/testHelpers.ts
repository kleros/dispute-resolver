import type { RealityQuestion, RealityQuestionCache } from "../reality/types";
import type { Address, Env, FetchInit, FetchResponse, Fetcher, ScriptResult, ScriptRunRequest, ScriptRunner } from "../types";
import fixture from "./__fixtures__/disputes.json";
import type { MetaEvidenceContext } from "./types";

/** The default gateway (`resolveGateway` without `REACT_APP_IPFS_GATEWAY`). */
export const GATEWAY = "https://cdn.kleros.link";

/** A stand-in for the meta-evidence API (`REACT_APP_METAEVIDENCE_URL`). */
export const LOCATOR = "https://metaevidence.test/get-dispute-metaevidence";

export const ENV: Env = { REACT_APP_METAEVIDENCE_URL: LOCATOR };

/** The meta-evidence of mainnet dispute 1684, a real content-addressed URI. */
export const META_CID = fixture.mainnet1684.metaEvidenceUri.replace("ipfs://", "");
export const META_URL = `${GATEWAY}/ipfs/${META_CID}`;

/** The default script of the Create page, allowlisted on mainnet, Gnosis, Sepolia and Chiado. */
export const DEFAULT_SCRIPT_CID = "QmZZHwVaXWtvChdFPG4UeXStKaC9aHamwQkNTEAfRmT2Fj";
export const DEFAULT_SCRIPT_URL = `${GATEWAY}/ipfs/${DEFAULT_SCRIPT_CID}`;

/** A Reality.eth renderer allowlisted on mainnet. */
export const REALITY_SCRIPT_PATH = "QmQGMR6MyC851poYVyBfGthzmCdvTuRFKp1UDB19p89Gcn/bundle.js";
export const REALITY_SCRIPT_URL = `${GATEWAY}/ipfs/${REALITY_SCRIPT_PATH}`;

/** An arbitrable that is not a registered Reality.eth proxy on any chain. */
export const ARBITRABLE = "0x799cb978dea5d6ca00ccb1794d3c3d4c89e40cd1" satisfies Address;

/** Registered Reality.eth proxies on mainnet: a cross-chain one with a title override, and a single-chain one without. */
export const CROSS_CHAIN_PROXY = "0x2f0895732bfacdcf2fdb19962fe609d0da695f21" satisfies Address;
export const SINGLE_CHAIN_PROXY = "0x126697b552b83f08c7ebebae8d13eae2871e4e1e" satisfies Address;

export const FIXTURE = fixture;

export const MAINNET_RPC = "https://read.rpc.test/mainnet";
export const MAINNET_PUBLIC_RPC = "https://public.rpc.test/mainnet";
export const GNOSIS_RPC = "https://read.rpc.test/gnosis";

/** The locator URL of a dispute, as today's app builds it (spec 9.1 step 1). */
export function locatorUrl(chainId: number, disputeId: bigint): string {
  return `${LOCATOR}?chainId=${String(chainId)}&disputeId=${String(disputeId)}`;
}

/** A JSON body. */
export function json(value: unknown): string {
  return JSON.stringify(value);
}

/** A request or script run that never settles, even when its signal aborts (an implementation that ignores the signal). */
export const HANG: unique symbol = Symbol("hang");

/** How the fake network answers one request: a 200 body, a rejection, an HTTP status with a body, or `HANG`. */
export type Route = string | Error | { readonly status: number; readonly body: string } | typeof HANG;

function response(status: number, body: string): FetchResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve().then((): unknown => JSON.parse(body)),
    text: () => Promise.resolve(body),
  };
}

function answer(route: Route | undefined): Promise<FetchResponse> {
  if (route === undefined) return Promise.resolve(response(404, "Not Found"));
  if (route === HANG) return new Promise<FetchResponse>(() => undefined);
  if (route instanceof Error) return Promise.reject(route);
  if (typeof route === "string") return Promise.resolve(response(200, route));
  return Promise.resolve(response(route.status, route.body));
}

function isRouteList(entry: Route | readonly Route[] | undefined): entry is readonly Route[] {
  return Array.isArray(entry);
}

/**
 * A stub fetcher answering from a map of URL → route. A list of routes answers successive requests in order and repeats
 * its last entry; a URL missing from the map answers 404.
 */
export function fakeFetcher(routes: Readonly<Record<string, Route | readonly Route[]>>): { fetcher: Fetcher; urls: string[]; inits: (FetchInit | undefined)[] } {
  const urls: string[] = [];
  const inits: (FetchInit | undefined)[] = [];
  const served = new Map<string, number>();
  const fetcher: Fetcher = (url, init) => {
    urls.push(url);
    inits.push(init);
    const entry = routes[url];
    if (!isRouteList(entry)) return answer(entry);
    const index = served.get(url) ?? 0;
    served.set(url, index + 1);
    return answer(entry[Math.min(index, entry.length - 1)]);
  };
  return { fetcher, urls, inits };
}

/** The locator and gateway routes of one meta-evidence file. */
export function servedMetaEvidence(
  body: Route | readonly Route[],
  options: { readonly chainId?: number; readonly disputeId?: bigint; readonly uri?: string } = {},
): Record<string, Route | readonly Route[]> {
  const { chainId = 1, disputeId = 1684n, uri = `/ipfs/${META_CID}` } = options;
  return { [locatorUrl(chainId, disputeId)]: json({ metaEvidenceUri: uri }), [META_URL]: body };
}

/** A runner answering every run with `reply`, recording each request. `HANG` never reports and ignores its timeout. */
export function fakeRunner(reply: ScriptResult | typeof HANG | ((request: ScriptRunRequest) => ScriptResult | Promise<ScriptResult>)): {
  runner: ScriptRunner;
  requests: ScriptRunRequest[];
} {
  const requests: ScriptRunRequest[] = [];
  const runner: ScriptRunner = {
    run(request) {
      requests.push(request);
      if (reply === HANG) return new Promise<ScriptResult>(() => undefined);
      return Promise.resolve(typeof reply === "function" ? reply(request) : reply);
    },
  };
  return { runner, requests };
}

/** A runner that fails the test if it is ever called. */
export const UNUSED_RUNNER: ScriptRunner = {
  run() {
    throw new Error("the script runner must not be called");
  },
};

/** A runner reply carrying `value`. */
export function scriptOk(value: unknown, jsonDuplicateKeys = false): ScriptResult {
  return { status: "ok", value, jsonDuplicateKeys };
}

/** A load context for mainnet dispute 1684 of an unregistered arbitrable, with no RPC and a 120 s budget. */
export function context(overrides: Partial<MetaEvidenceContext> = {}): MetaEvidenceContext {
  return {
    arbitratorChainId: 1,
    disputeId: 1684n,
    arbitrable: ARBITRABLE,
    env: ENV,
    fetcher: () => Promise.reject(new Error("unexpected fetch")),
    runner: UNUSED_RUNNER,
    budgetMs: 120_000,
    ...overrides,
  };
}

/** A Reality.eth question cache holding `question` under `key`, recording reads. */
export function realityCache(entries: Readonly<Record<string, RealityQuestion>>): RealityQuestionCache & { readonly reads: string[] } {
  const reads: string[] = [];
  return {
    reads,
    get(key) {
      reads.push(key);
      return entries[key];
    },
    set() {
      // The tests serve questions from the cache only.
    },
    remove() {
      // Every served entry is valid.
    },
  };
}

/** A bool question as the cross-chain proxy's Reality.eth contract on Gnosis records it. */
export function boolQuestion(title: string): RealityQuestion {
  return {
    questionId: `0x${"ab".repeat(32)}`,
    templateId: "0",
    templateText: '{"title": "%s", "type": "bool", "category": "%s", "lang": "%s"}',
    questionText: [title, "misc", "en_US"].join("␟"),
    reality: "0xe78996a233895be74a66f451f1019ca9734205cc",
    realityChainId: 100,
  };
}
