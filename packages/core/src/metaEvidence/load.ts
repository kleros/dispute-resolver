import { BaseError } from "viem";
import { isBodyTooLargeError } from "../fetch";
import { deriveRealityRulingOptions, fetchRealityQuestion, isRealityScript } from "../reality";
import type { RealityQuestionInfo } from "../reality/types";
import { REGISTRY, getRealityProxy, isScriptAllowed } from "../registry";
import type { RealityProxyEntry, Registry } from "../registry/types";
import { createReadClients, describeError, isLookupLimitError } from "../rpc";
import type { Env, ScriptKind, ScriptParameters, UnavailableCode } from "../types";
import { gatewayUrl, normalizeIpfsPath, resolveGateway } from "../uri";
import type { CanonicalIpfsPath, GatewayOrigin } from "../uri/types";
import { type Deadline, Interrupted, pause, startDeadline, untilAborted } from "./deadline";
import { type JsonObject, isPlainObject, own } from "./json";
import { INVALID_META_EVIDENCE, coerceMetaEvidence, isValidMetaEvidence, parseMetaEvidence } from "./schema";
import { buildScriptParameters } from "./scriptParams";
import type {
  MetaEvidenceContext,
  MetaEvidenceFailure,
  MetaEvidenceRejection,
  MetaEvidenceResult,
  MetaEvidenceSource,
  OnChainMetaEvidence,
  OnChainMetaEvidenceReader,
  ScriptOutcome,
} from "./types";

/** The case page's budget, which the dynamic script's run shares. */
export const CASE_PAGE_BUDGET_MS = 120_000;

export const ONGOING_BUDGET_MS = 40_000;

/** The longest a load waits for the on-chain meta-evidence URI before the locator decides. */
export const ON_CHAIN_WAIT_MS = 30_000;

/** The longest a found event waits for the locator's answer, which is read for comparison only. */
export const LOCATOR_COMPARE_GRACE_MS = 5_000;

const RETRY_DELAY_MS = 5_000;

const NO_SOURCE_MESSAGE = "The dispute details are unavailable.";

/** A reader that rejected, or did not answer within `ON_CHAIN_WAIT_MS` or the load's budget. */
const ON_CHAIN_UNAVAILABLE: OnChainMetaEvidence = Object.freeze({
  status: "unavailable",
  error: Object.freeze({ code: "rpc-error", message: "The arbitrable's MetaEvidence event could not be read." }),
});

/** Failures worth another attempt while the budget lasts. Every other failure is deterministic. */
type TransientReason = Extract<MetaEvidenceFailure, "locator-error" | "fetch-error" | "script-failed" | "reality-lookup-failed">;

const TRANSIENT_MESSAGES: Readonly<Record<TransientReason, string>> = {
  "locator-error": "The meta-evidence API did not answer.",
  "fetch-error": "The meta-evidence or its dynamic script could not be fetched from the IPFS gateway.",
  "script-failed": "The dynamic script failed.",
  "reality-lookup-failed": "The Reality.eth question could not be read.",
};

const LEGACY_KEYS: ReadonlyMap<string, string> = new Map([
  ["evidenceDisplayInterfaceURL", "evidenceDisplayInterfaceURI"],
  ["evidenceDisplayInterfaceURLHash", "evidenceDisplayInterfaceHash"],
]);

const NO_SCRIPT: ScriptOutcome = Object.freeze({ ran: false, reason: "no-script" });
const REGISTERED_PROXY: ScriptOutcome = Object.freeze({ ran: false, reason: "registered-reality-proxy" });
const SCRIPT_FETCH_FAILED: ScriptOutcome = Object.freeze({ ran: false, reason: "script-fetch-failed" });
const SCRIPT_CHAIN_UNAVAILABLE: ScriptOutcome = Object.freeze({ ran: false, reason: "script-chain-unavailable" });

/** A transient failure the pipeline detects itself: an HTTP error, a locator answer that is not JSON, a failed script run. */
class TransientFailure extends Error {
  readonly reason: TransientReason;

  constructor(reason: TransientReason, message: string) {
    super(message);
    this.name = "TransientFailure";
    this.reason = reason;
  }
}

interface Load {
  readonly context: MetaEvidenceContext;
  /** `null` when the meta-evidence API is not configured (only possible with an on-chain reader). */
  readonly locatorUrl: string | null;
  readonly gateway: GatewayOrigin;
  readonly registry: Registry;
  readonly deadline: Deadline;
  /** The on-chain answer, read once per load and shared by every attempt; `null` without a reader. Never rejects. */
  readonly onChain: Promise<OnChainMetaEvidence> | null;
  /** The current attempt's locator request: aborted once it is no longer awaited, and when the load ends. */
  locatorRequest: AbortController | null;
  /** The step in progress, which names the failure when that step is interrupted or throws. */
  stage: TransientReason;
}

interface OnChainRead {
  readonly answer: Promise<OnChainMetaEvidence>;
  dispose(): void;
}

/** `uri` is still untrusted: the content-addressing check comes after the choice. */
interface Chosen {
  readonly uri: unknown;
  readonly source: MetaEvidenceSource;
}

/** The meta-evidence after the script or the Reality derivation, before validation. */
interface Merged {
  readonly json: unknown;
  readonly script: ScriptOutcome;
  readonly realityQuestion: RealityQuestionInfo | null;
}

type Step<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly result: MetaEvidenceResult };

export function metaEvidenceLocatorUrl(env: Env, chainId: number, disputeId: bigint): string | null {
  const base = env.REACT_APP_METAEVIDENCE_URL?.trim() ?? "";
  return base === "" ? null : `${base}?chainId=${String(chainId)}&disputeId=${disputeId.toString()}`;
}

function failure(reason: MetaEvidenceFailure, code: UnavailableCode, message: string): MetaEvidenceResult {
  return { status: "failed", reason, error: { code, message } };
}

function noSource(): MetaEvidenceResult {
  return failure("locator-error", "unsupported", NO_SOURCE_MESSAGE);
}

function rejected(reason: MetaEvidenceRejection): MetaEvidenceResult {
  return { status: "invalid", metaEvidence: INVALID_META_EVIDENCE, reason };
}

function merged(json: unknown, script: ScriptOutcome, realityQuestion: RealityQuestionInfo | null = null): Step<Merged> {
  return { ok: true, value: { json, script, realityQuestion } };
}

function stop(result: MetaEvidenceResult): Step<never> {
  return { ok: false, result };
}

function step<T>(load: Load, stage: TransientReason, task: (signal: AbortSignal) => Promise<T>): Promise<T> {
  load.stage = stage;
  return untilAborted(load.deadline.signal, task);
}

function parseJson(text: string): { readonly ok: true; readonly value: unknown } | { readonly ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}

/**
 * The answer is read as JSON whatever its HTTP status, so an error answer without a truthy `metaEvidenceUri` is
 * "missing", not a failure; an answer that is not JSON, or JSON `null`, is a `locator-error`.
 */
function locatedUri(text: string): unknown {
  const body = parseJson(text);
  if (!body.ok || body.value === null) throw new TransientFailure("locator-error", "The meta-evidence API did not answer with a JSON document.");
  return typeof body.value === "object" && !Array.isArray(body.value) ? own(body.value, "metaEvidenceUri") : undefined;
}

/**
 * Starts this attempt's locator request under its own controller, linked to the load's signal, so a found event can
 * stop waiting for it and the load can abort it when it ends. The request is marked handled: the locator-first
 * path awaits it and rethrows its failure, the event path compares its answer.
 */
function startLocator(load: Load, url: string): Promise<unknown> {
  const { signal: loadSignal } = load.deadline;
  const controller = new AbortController();
  const onLoadAbort = () => {
    controller.abort(new Interrupted());
  };
  if (loadSignal.aborted) onLoadAbort();
  else loadSignal.addEventListener("abort", onLoadAbort, { once: true });
  load.locatorRequest = controller;
  const request = untilAborted(controller.signal, async (signal) => (await load.context.fetcher(url, { signal })).text())
    .then(locatedUri)
    .finally(() => {
      loadSignal.removeEventListener("abort", onLoadAbort);
    });
  request.catch(() => undefined);
  return request;
}

/**
 * Starts the on-chain read of a load under its own signal, which aborts after `ON_CHAIN_WAIT_MS`, when the
 * load's signal aborts, and on `dispose`. A rejection or an abort, even of a reader that ignores its signal, settles the
 * answer as `unavailable`: it never reaches `classify`, so it is never retried.
 */
function startOnChain(reader: OnChainMetaEvidenceReader, deadline: Deadline): OnChainRead {
  const controller = new AbortController();
  const abort = () => {
    controller.abort(new Interrupted());
  };
  const timer = setTimeout(abort, ON_CHAIN_WAIT_MS);
  if (deadline.signal.aborted) abort();
  else deadline.signal.addEventListener("abort", abort, { once: true });
  const answer = untilAborted(controller.signal, reader).catch((): OnChainMetaEvidence => ON_CHAIN_UNAVAILABLE);
  return {
    answer,
    dispose: () => {
      clearTimeout(timer);
      deadline.signal.removeEventListener("abort", abort);
      abort();
    },
  };
}

function withinGrace<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const grace = new Promise<undefined>((resolve) => {
    timer = setTimeout(resolve, ms, undefined);
  });
  return Promise.race([promise, grace]).finally(() => {
    clearTimeout(timer);
  });
}

function eventSource(locator: Extract<MetaEvidenceSource, { kind: "event" }>["locator"], locatorPath: CanonicalIpfsPath | null): MetaEvidenceSource {
  return { kind: "event", locator, locatorPath };
}

/**
 * What the locator said next to a found event: it is awaited at most `LOCATOR_COMPARE_GRACE_MS`, then aborted, and
 * compared by canonical path, so `ipfs://CID/x` and `/ipfs/CID/x` agree. It never decides, retries or fails the load.
 */
async function compareLocator(load: Load, locator: Promise<unknown> | null, eventUri: string): Promise<MetaEvidenceSource> {
  if (locator === null) return eventSource("unavailable", null);
  const answer = await withinGrace(
    locator.then(
      (located) => ({ located }),
      () => null,
    ),
    LOCATOR_COMPARE_GRACE_MS,
  );
  load.locatorRequest?.abort(new Interrupted());
  if (answer === undefined || answer === null) return eventSource("unavailable", null);
  if (!answer.located) return eventSource("missing", null);
  const locatorPath = normalizeIpfsPath(answer.located);
  if (locatorPath === null) return eventSource("disagrees", null);
  return eventSource(locatorPath === normalizeIpfsPath(eventUri) ? "agrees" : "disagrees", locatorPath);
}

function fallbackSource(event: OnChainMetaEvidence | null): MetaEvidenceSource {
  if (event === null) return { kind: "locator", event: "not-read" };
  return { kind: "locator", event: event.status === "not-found" ? event.reason : "unavailable" };
}

/**
 * The locator is asked while the on-chain answer is awaited. A found event's URI wins and the locator is only compared;
 * otherwise the locator decides, and its transient failures are thrown for a retry.
 */
async function choose(load: Load): Promise<Step<Chosen>> {
  const locator = load.locatorUrl === null ? null : startLocator(load, load.locatorUrl);
  load.stage = "locator-error";
  const event = load.onChain === null ? null : await load.onChain;
  load.deadline.signal.throwIfAborted();
  if (event?.status === "found") return { ok: true, value: { uri: event.uri, source: await compareLocator(load, locator, event.uri) } };
  if (locator === null) return stop(noSource());
  const located = await locator;
  return located ? { ok: true, value: { uri: located, source: fallbackSource(event) } } : stop({ status: "missing" });
}

/** An HTTP error is a transient `fetch-error`; a file that is not JSON is a deterministic `not-json`. */
async function fetchDocument(load: Load, fileUrl: string): Promise<Step<unknown>> {
  const text = await step(load, "fetch-error", async (signal) => {
    const response = await load.context.fetcher(fileUrl, { signal });
    if (!response.ok) throw new TransientFailure("fetch-error", `The IPFS gateway answered HTTP ${String(response.status)} for the meta-evidence.`);
    return response.text();
  });
  const body = parseJson(text);
  return body.ok ? { ok: true, value: body.value } : stop(failure("not-json", "invalid-data", "The meta-evidence file is not JSON."));
}

/** A truthy legacy value wins over the current key; a falsy `rulingOptions.type` defaults to single-select. */
function prepare(json: unknown): unknown {
  if (!isPlainObject(json)) return json;
  const kept: [string, unknown][] = [];
  const renamed: [string, unknown][] = [];
  for (const [key, value] of Object.entries(json)) {
    const current = value ? LEGACY_KEYS.get(key) : undefined;
    if (current === undefined) kept.push([key, value]);
    else renamed.push([current, value]);
  }
  const prepared: JsonObject = Object.fromEntries([...kept, ...renamed]);
  const options = own(prepared, "rulingOptions");
  if (!isPlainObject(options) || Boolean(own(options, "type"))) return prepared;
  return { ...prepared, rulingOptions: { ...options, type: "single-select" } };
}

/** `null` on an HTTP error or a script over the fetch cap: the meta-evidence is then used without a merge, and the attempt is not retried. */
function fetchScript(load: Load, url: string): Promise<string | null> {
  return step(load, "fetch-error", async (signal) => {
    try {
      const response = await load.context.fetcher(url, { signal });
      return response.ok ? await response.text() : null;
    } catch (error) {
      if (isBodyTooLargeError(error)) return null;
      throw error;
    }
  });
}

/**
 * The script URI must be content-addressed and allowlisted for the arbitrator chain, or the whole meta-evidence becomes
 * the placeholder. The script is fetched from its canonical path, never from the raw URI. Its parameters are checked
 * before the fetch, so a gateway that fails or hangs cannot turn a script that would never run into a failed load.
 */
async function applyScript(load: Load, prepared: unknown): Promise<Step<Merged>> {
  if (!isPlainObject(prepared)) return merged(prepared, NO_SCRIPT);
  const scriptUri = own(prepared, "dynamicScriptURI");
  if (!scriptUri) return merged(prepared, NO_SCRIPT);
  const scriptPath = normalizeIpfsPath(scriptUri);
  if (scriptPath === null) return stop(rejected("script-uri-not-content-addressed"));
  const { context } = load;
  if (!isScriptAllowed(load.registry, context.arbitratorChainId, scriptUri)) return stop(rejected("script-not-allowlisted"));
  const params = buildScriptParameters({
    metaEvidence: coerceMetaEvidence(prepared),
    arbitratorChainId: context.arbitratorChainId,
    disputeId: context.disputeId,
    arbitrable: context.arbitrable,
    env: context.env,
  });
  if (!params.ok) return merged(prepared, SCRIPT_CHAIN_UNAVAILABLE);
  const scriptText = await fetchScript(load, gatewayUrl(scriptPath, load.gateway));
  if (scriptText === null) return merged(prepared, SCRIPT_FETCH_FAILED);
  return runScript(load, prepared, scriptText, params.value);
}

async function runScript(load: Load, prepared: JsonObject, scriptText: string, params: ScriptParameters): Promise<Step<Merged>> {
  const { context, deadline } = load;
  const kind: ScriptKind = isRealityScript(scriptText) ? "reality" : "standard";
  const result = await step(load, "script-failed", (signal) => context.runner.run({ scriptText, params, kind, timeoutMs: deadline.remainingMs(), signal }));
  if (result.status === "failed") {
    // A runner error (refused parameters, no frame, a malformed reply) is deterministic. A runner that did not
    // start may only be slow, so it is retried, and the host's explanation is what the user reads if it never does.
    if (result.reason === "runner-error") return stop(failure("script-failed", "rpc-error", result.message));
    throw new TransientFailure("script-failed", result.reason === "not-started" ? result.message : `The dynamic script failed (${result.reason}).`);
  }

  const json = isPlainObject(result.value) ? { ...prepared, ...result.value } : prepared;
  const script: ScriptOutcome = { ran: true, kind, jsonDuplicateKeys: result.jsonDuplicateKeys };
  if (kind === "standard") return merged(json, script);
  // An unregistered Reality.eth renderer whose question JSON had duplicate keys cannot be trusted: its options are
  // replaced by an empty single-select. Any other is unverified and keeps the options it returned.
  if (result.jsonDuplicateKeys) return merged({ ...json, rulingOptions: { type: "single-select", titles: [] } }, script, { status: "unresolvable" });
  return merged(json, script, { status: "unverified" });
}

/**
 * A registered Reality proxy never runs its script. When its meta-evidence is valid, the on-chain question sets
 * `rulingOptions`, `realityQuestion` and, for entries with a `questionOverride`, `question`.
 */
async function applyRealityProxy(load: Load, entry: RealityProxyEntry, prepared: unknown): Promise<Step<Merged>> {
  if (!isValidMetaEvidence(prepared)) return merged(prepared, REGISTERED_PROXY);
  const { context, deadline } = load;
  const derived = await step(load, "reality-lookup-failed", async (signal) => {
    const question = await fetchRealityQuestion({
      entry,
      arbitratorChainId: context.arbitratorChainId,
      disputeId: context.disputeId,
      clients: (budget, options) => createReadClients(context.env, { ...options, budget }),
      cache: context.realityCache,
      deadlineMs: deadline.remainingMs(),
      signal,
    });
    return deriveRealityRulingOptions(question, entry);
  });
  const json = { ...prepared, rulingOptions: derived.rulingOptions, ...(derived.question === undefined ? {} : { question: derived.question }) };
  return merged(json, REGISTERED_PROXY, derived.realityQuestion);
}

/** `realityQuestion` is the derived one, never the JSON's. */
function accept(result: Merged, uri: CanonicalIpfsPath, fileUrl: string, source: MetaEvidenceSource): MetaEvidenceResult {
  const parsed = parseMetaEvidence(result.json);
  if (!parsed.ok) return failure("schema-invalid", parsed.error.code, parsed.error.message);
  return { status: "ok", metaEvidence: { ...parsed.value, realityQuestion: result.realityQuestion }, uri, fileUrl, script: result.script, source };
}

/**
 * The content-addressing check applies to whichever URI won: a rejected on-chain URI is the placeholder, never a
 * fallback to the locator's. Throws on a transient failure; returns every other outcome.
 */
async function runAttempt(load: Load): Promise<MetaEvidenceResult> {
  const chosen = await choose(load);
  if (!chosen.ok) return chosen.result;
  const { source } = chosen.value;
  const uri = normalizeIpfsPath(chosen.value.uri);
  if (uri === null) return rejected("uri-not-content-addressed");
  const fileUrl = gatewayUrl(uri, load.gateway);
  const document = await fetchDocument(load, fileUrl);
  if (!document.ok) return document.result;

  const prepared = prepare(document.value);
  const entry = getRealityProxy(load.registry, load.context.arbitratorChainId, load.context.arbitrable);
  const result = entry === undefined ? await applyScript(load, prepared) : await applyRealityProxy(load, entry, prepared);
  return result.ok ? accept(result.value, uri, fileUrl, source) : result.result;
}

/** A safe detail of an unexpected error, as `describeError` words it; `null` for an error it would only name. */
function errorDetail(error: unknown): string | null {
  return error instanceof BaseError || isLookupLimitError(error) ? describeError(error) : null;
}

function budgetExhausted(): MetaEvidenceResult {
  return failure("budget-exhausted", "rpc-error", "The meta-evidence could not be loaded within its time budget.");
}

function cancelled(stage: TransientReason): MetaEvidenceResult {
  return failure(stage, "rpc-error", "The meta-evidence load was cancelled.");
}

/** An unexpected error is treated as transient; only a cancellation, the end of the budget or a body over the fetch cap is final. */
function classify(load: Load, error: unknown): { readonly result: MetaEvidenceResult; readonly final: boolean } {
  if (load.deadline.cancelled()) return { result: cancelled(load.stage), final: true };
  if (load.deadline.expired()) return { result: budgetExhausted(), final: true };
  if (isBodyTooLargeError(error)) return { result: failure(load.stage, "invalid-data", error.message), final: true };
  if (error instanceof TransientFailure) return { result: failure(error.reason, "rpc-error", error.message), final: false };
  const detail = errorDetail(error);
  const message = TRANSIENT_MESSAGES[load.stage];
  return { result: failure(load.stage, "rpc-error", detail === null ? message : `${message} ${detail}`), final: false };
}

async function attemptWithinBudget(load: Load): Promise<MetaEvidenceResult> {
  const { deadline } = load;
  for (;;) {
    if (deadline.cancelled()) return cancelled(load.stage);
    if (deadline.expired()) return budgetExhausted();
    try {
      return await runAttempt(load);
    } catch (error) {
      const outcome = classify(load, error);
      if (outcome.final || deadline.remainingMs() <= RETRY_DELAY_MS) return outcome.result;
      if (!(await pause(RETRY_DELAY_MS, deadline.signal))) return outcome.result;
    }
  }
}

/**
 * Never rejects. Transient failures are retried after 5 s while the budget can hold another attempt; deterministic ones,
 * a runner error included, are not. A step still running when the budget ends is `budget-exhausted`, and the caller's
 * abort ends the load at once.
 */
export async function loadMetaEvidence(context: MetaEvidenceContext): Promise<MetaEvidenceResult> {
  const locatorUrl = metaEvidenceLocatorUrl(context.env, context.arbitratorChainId, context.disputeId);
  if (locatorUrl === null && context.onChain === undefined) return noSource();
  const deadline = startDeadline(context.budgetMs, context.signal);
  const onChain = context.onChain === undefined ? null : startOnChain(context.onChain, deadline);
  const load: Load = {
    context,
    locatorUrl,
    gateway: resolveGateway(context.env),
    registry: context.registry ?? REGISTRY,
    deadline,
    onChain: onChain?.answer ?? null,
    locatorRequest: null,
    stage: "locator-error",
  };
  try {
    return await attemptWithinBudget(load);
  } finally {
    onChain?.dispose();
    load.locatorRequest?.abort(new Interrupted());
    deadline.dispose();
  }
}
