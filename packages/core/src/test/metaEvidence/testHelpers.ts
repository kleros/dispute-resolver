import { vi } from "vitest";
import type { RealityQuestion, RealityQuestionCache } from "../../reality/types";
import type { Address, Env, ScriptResult, ScriptRunRequest, ScriptRunner } from "../../types";
import fixture from "../../metaEvidence/__fixtures__/disputes.json";
import type { MetaEvidenceContext, MetaEvidenceResult, OnChainMetaEvidence, OnChainMetaEvidenceReader } from "../../metaEvidence/types";
import { HANG, type Route } from "../fetch/testHelpers";

export { HANG, fakeFetcher, type Route } from "../fetch/testHelpers";

export const GATEWAY = "https://cdn.kleros.link";

export const LOCATOR = "https://metaevidence.test/get-dispute-metaevidence";

export const ENV: Env = { REACT_APP_METAEVIDENCE_URL: LOCATOR };

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
export const GNOSIS_RPC = "https://read.rpc.test/gnosis";

export function locatorUrl(chainId: number, disputeId: bigint): string {
  return `${LOCATOR}?chainId=${String(chainId)}&disputeId=${String(disputeId)}`;
}

export function json(value: unknown): string {
  return JSON.stringify(value);
}

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

/**
 * An on-chain reader answering every call with `answer`, recording each call's signal. An `Error` is a rejection;
 * `HANG` never settles, even when its signal aborts (a reader that ignores its signal).
 */
export function fakeOnChain(answer: OnChainMetaEvidence | Error | typeof HANG): { reader: OnChainMetaEvidenceReader; signals: AbortSignal[] } {
  const signals: AbortSignal[] = [];
  const reader: OnChainMetaEvidenceReader = (signal) => {
    signals.push(signal);
    if (answer === HANG) return new Promise<OnChainMetaEvidence>(() => undefined);
    if (answer instanceof Error) return Promise.reject(answer);
    return Promise.resolve(answer);
  };
  return { reader, signals };
}

export function eventFound(uri: string): OnChainMetaEvidence {
  return { status: "found", uri };
}

export const UNUSED_RUNNER: ScriptRunner = {
  run() {
    throw new Error("the script runner must not be called");
  },
};

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

/** Under fake timers: lets time run for `ms` and returns the load's settled result with the time it took. */
export async function settle(load: Promise<MetaEvidenceResult>, ms: number): Promise<{ result: MetaEvidenceResult; elapsedMs: number }> {
  const start = Date.now();
  let settledAt: number | undefined;
  const tracked = load.then((result) => {
    settledAt = Date.now();
    return result;
  });
  await vi.advanceTimersByTimeAsync(ms);
  const result = await tracked;
  if (settledAt === undefined) throw new Error("the load did not settle");
  return { result, elapsedMs: settledAt - start };
}
