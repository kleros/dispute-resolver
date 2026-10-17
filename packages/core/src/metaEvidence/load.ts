import { BaseError } from "viem";
import { deriveRealityRulingOptions, fetchRealityQuestion, isRealityScript } from "../reality";
import type { RealityQuestionInfo } from "../reality/types";
import { REGISTRY, getRealityProxy, isScriptAllowed } from "../registry";
import type { RealityProxyEntry, Registry } from "../registry/types";
import { isLookupLimitError } from "../rpc";
import type { ChainId, Env, ScriptKind, UnavailableCode } from "../types";
import { gatewayUrl, normalizeIpfsPath, resolveGateway } from "../uri";
import type { CanonicalIpfsPath, GatewayOrigin } from "../uri/types";
import { type Deadline, pause, startDeadline, untilAborted } from "./deadline";
import { type JsonObject, isPlainObject, isTruthy, own } from "./json";
import { lookupClientsOf } from "./lookupClients";
import { realityFromScript } from "./reality";
import { INVALID_META_EVIDENCE, coerceMetaEvidence, isValidMetaEvidence, parseMetaEvidence } from "./schema";
import { buildScriptParameters } from "./scriptParams";
import type { MetaEvidenceContext, MetaEvidenceFailure, MetaEvidenceRejection, MetaEvidenceResult, ScriptOutcome } from "./types";

/** The case page's budget: today's 120 s retry budget, now including the script (D-38, MODULES.md choice 1). */
export const CASE_PAGE_BUDGET_MS = 120_000;

/** The budget of each Ongoing card, well under a minute (D-37). */
export const ONGOING_BUDGET_MS = 40_000;

/** Today's wait before a new attempt (spec 9.1). */
const RETRY_DELAY_MS = 5_000;

/** Failures worth another attempt while the budget lasts (D-38). Every other failure is deterministic. */
type TransientReason = Extract<MetaEvidenceFailure, "locator-error" | "fetch-error" | "script-failed" | "reality-lookup-failed">;

const TRANSIENT_MESSAGES: Readonly<Record<TransientReason, string>> = {
  "locator-error": "The meta-evidence API did not answer.",
  "fetch-error": "The meta-evidence or its dynamic script could not be fetched from the IPFS gateway.",
  "script-failed": "The dynamic script failed.",
  "reality-lookup-failed": "The Reality.eth question could not be read.",
};

/** Spec 9.1 step 4: legacy keys renamed before anything reads the meta-evidence. */
const LEGACY_KEYS: ReadonlyMap<string, string> = new Map([
  ["evidenceDisplayInterfaceURL", "evidenceDisplayInterfaceURI"],
  ["evidenceDisplayInterfaceURLHash", "evidenceDisplayInterfaceHash"],
]);

const NO_SCRIPT: ScriptOutcome = Object.freeze({ ran: false, reason: "no-script" });
const REGISTERED_PROXY: ScriptOutcome = Object.freeze({ ran: false, reason: "registered-reality-proxy" });
const SCRIPT_FETCH_FAILED: ScriptOutcome = Object.freeze({ ran: false, reason: "script-fetch-failed" });

/** A transient failure the pipeline detects itself: an HTTP error, a locator answer that is not JSON, a failed script run. */
class TransientFailure extends Error {
  readonly reason: TransientReason;

  constructor(reason: TransientReason, message: string) {
    super(message);
    this.name = "TransientFailure";
    this.reason = reason;
  }
}

/** One load: its inputs, its budget, and the step in progress, which names an interrupted or failed step. */
interface Load {
  readonly context: MetaEvidenceContext;
  readonly locatorUrl: string;
  readonly gateway: GatewayOrigin;
  readonly registry: Registry;
  readonly deadline: Deadline;
  stage: TransientReason;
}

/** The meta-evidence after the script or the Reality derivation, before validation. */
interface Merged {
  readonly json: unknown;
  readonly script: ScriptOutcome;
  readonly realityQuestion: RealityQuestionInfo | null;
}

/** A pipeline step either goes on with a value or ends the attempt with a result. */
type Step<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly result: MetaEvidenceResult };

/** `${REACT_APP_METAEVIDENCE_URL}?chainId=…&disputeId=…` (spec 9.1 step 1), or `null` when the API is not configured. */
export function metaEvidenceLocatorUrl(env: Env, chainId: ChainId, disputeId: bigint): string | null {
  const base = env.REACT_APP_METAEVIDENCE_URL?.trim() ?? "";
  return base === "" ? null : `${base}?chainId=${String(chainId)}&disputeId=${disputeId.toString()}`;
}

function failure(reason: MetaEvidenceFailure, code: UnavailableCode, message: string): MetaEvidenceResult {
  return { status: "failed", reason, error: { code, message } };
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

/** Runs one I/O step of the load: it is named `stage` until the next one starts, and is cut when the load's signal aborts. */
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
 * Spec 9.1 step 1. As today, the answer is read as JSON whatever its HTTP status, so an answer without a truthy
 * `metaEvidenceUri` is "missing"; an answer that is not JSON, or JSON `null`, is a `locator-error`.
 */
async function locate(load: Load): Promise<unknown> {
  const text = await step(load, "locator-error", async (signal) => (await load.context.fetcher(load.locatorUrl, { signal })).text());
  const body = parseJson(text);
  if (!body.ok || body.value === null) throw new TransientFailure("locator-error", "The meta-evidence API did not answer with a JSON document.");
  return typeof body.value === "object" && !Array.isArray(body.value) ? own(body.value, "metaEvidenceUri") : undefined;
}

/** Spec 9.1 step 3: an HTTP error is a transient `fetch-error`; a file that is not JSON is a deterministic `not-json`. */
async function fetchDocument(load: Load, fileUrl: string): Promise<Step<unknown>> {
  const text = await step(load, "fetch-error", async (signal) => {
    const response = await load.context.fetcher(fileUrl, { signal });
    if (!response.ok) throw new TransientFailure("fetch-error", `The IPFS gateway answered HTTP ${String(response.status)} for the meta-evidence.`);
    return response.text();
  });
  const body = parseJson(text);
  return body.ok ? { ok: true, value: body.value } : stop(failure("not-json", "invalid-data", "The meta-evidence file is not JSON."));
}

/** Spec 9.1 steps 4 and 5: legacy keys renamed (a truthy legacy value wins), and a falsy `rulingOptions.type` defaulted. */
function prepare(json: unknown): unknown {
  if (!isPlainObject(json)) return json;
  const kept: [string, unknown][] = [];
  const renamed: [string, unknown][] = [];
  for (const [key, value] of Object.entries(json)) {
    const current = isTruthy(value) ? LEGACY_KEYS.get(key) : undefined;
    if (current === undefined) kept.push([key, value]);
    else renamed.push([current, value]);
  }
  const prepared: JsonObject = Object.fromEntries([...kept, ...renamed]);
  const options = own(prepared, "rulingOptions");
  if (!isPlainObject(options) || isTruthy(own(options, "type"))) return prepared;
  return { ...prepared, rulingOptions: { ...options, type: "single-select" } };
}

/** The script's text, or `null` when the gateway answers with an HTTP error (spec 9.1 step 7.4: no merge). */
function fetchScript(load: Load, url: string): Promise<string | null> {
  return step(load, "fetch-error", async (signal) => {
    const response = await load.context.fetcher(url, { signal });
    return response.ok ? response.text() : null;
  });
}

/**
 * Spec 9.1 step 7 for an arbitrable that is not a registered Reality proxy: the script URI must be content-addressed
 * (A3) and allowlisted for the arbitrator chain (A1), or the meta-evidence is replaced by the placeholder (A2). The
 * script is fetched from its canonical path, then run with validated parameters (B5) and the remaining budget as its
 * timeout (D-38); its result is shallow-merged when it is a plain object (A23), and a Reality renderer's status is mapped
 * (A4).
 */
async function applyScript(load: Load, prepared: unknown): Promise<Step<Merged>> {
  if (!isPlainObject(prepared)) return merged(prepared, NO_SCRIPT);
  const scriptUri = own(prepared, "dynamicScriptURI");
  if (!isTruthy(scriptUri)) return merged(prepared, NO_SCRIPT);
  const scriptPath = normalizeIpfsPath(scriptUri);
  if (scriptPath === null) return stop(rejected("script-uri-not-content-addressed"));
  if (!isScriptAllowed(load.registry, load.context.arbitratorChainId, scriptUri)) return stop(rejected("script-not-allowlisted"));
  const scriptText = await fetchScript(load, gatewayUrl(scriptPath, load.gateway));
  if (scriptText === null) return merged(prepared, SCRIPT_FETCH_FAILED);
  return runScript(load, prepared, scriptText);
}

async function runScript(load: Load, prepared: JsonObject, scriptText: string): Promise<Step<Merged>> {
  const { context, deadline } = load;
  const params = buildScriptParameters({
    metaEvidence: coerceMetaEvidence(prepared),
    arbitratorChainId: context.arbitratorChainId,
    disputeId: context.disputeId,
    arbitrable: context.arbitrable,
    env: context.env,
  });
  if (!params.ok) return stop({ status: "failed", reason: "unknown-chain", error: params.error });

  const kind: ScriptKind = isRealityScript(scriptText) ? "reality" : "standard";
  const result = await step(load, "script-failed", (signal) => context.runner.run({ scriptText, params: params.value, kind, timeoutMs: deadline.remainingMs(), signal }));
  if (result.status === "failed") throw new TransientFailure("script-failed", `The dynamic script failed (${result.reason}).`);

  const json = isPlainObject(result.value) ? { ...prepared, ...result.value } : prepared;
  const script: ScriptOutcome = { ran: true, kind, jsonDuplicateKeys: result.jsonDuplicateKeys };
  if (kind === "standard") return merged(json, script);
  const reality = realityFromScript(result.jsonDuplicateKeys);
  return merged(reality.rulingOptions === undefined ? json : { ...json, rulingOptions: reality.rulingOptions }, script, reality.realityQuestion);
}

/**
 * Spec 9.1 steps 6 and 8, spec 10.4: a registered Reality proxy never runs its script. When its meta-evidence is valid,
 * the on-chain question sets `rulingOptions`, `realityQuestion` and, for entries with a `questionOverride`, `question`.
 */
async function applyRealityProxy(load: Load, entry: RealityProxyEntry, prepared: unknown): Promise<Step<Merged>> {
  if (!isValidMetaEvidence(prepared)) return merged(prepared, REGISTERED_PROXY);
  const { context, deadline } = load;
  const derived = await step(load, "reality-lookup-failed", async (signal) => {
    const question = await fetchRealityQuestion({
      entry,
      arbitratorChainId: context.arbitratorChainId,
      disputeId: context.disputeId,
      clients: lookupClientsOf(context.env),
      cache: context.realityCache,
      deadlineMs: deadline.remainingMs(),
      signal,
    });
    return deriveRealityRulingOptions(question, entry);
  });
  const json = { ...prepared, rulingOptions: derived.rulingOptions, ...(derived.question === undefined ? {} : { question: derived.question }) };
  return merged(json, REGISTERED_PROXY, derived.realityQuestion);
}

/** Spec 9.1 step 9 and C13: the merged result is validated; `realityQuestion` is the derived one, never the JSON's. */
function accept(result: Merged, uri: CanonicalIpfsPath, fileUrl: string): MetaEvidenceResult {
  const parsed = parseMetaEvidence(result.json);
  if (!parsed.ok) return failure("schema-invalid", parsed.error.code, parsed.error.message);
  return { status: "ok", metaEvidence: { ...parsed.value, realityQuestion: result.realityQuestion }, uri, fileUrl, script: result.script };
}

/** One attempt of spec 9.1, in the gating order of A2. Throws on a transient failure; returns every other outcome. */
async function runAttempt(load: Load): Promise<MetaEvidenceResult> {
  const located = await locate(load);
  if (!isTruthy(located)) return { status: "missing" };
  const uri = normalizeIpfsPath(located);
  if (uri === null) return rejected("uri-not-content-addressed");
  const fileUrl = gatewayUrl(uri, load.gateway);
  const document = await fetchDocument(load, fileUrl);
  if (!document.ok) return document.result;

  const prepared = prepare(document.value);
  const entry = getRealityProxy(load.registry, load.context.arbitratorChainId, load.context.arbitrable);
  const result = entry === undefined ? await applyScript(load, prepared) : await applyRealityProxy(load, entry, prepared);
  return result.ok ? accept(result.value, uri, fileUrl) : result.result;
}

/** A safe detail of an unexpected error: a viem error's `message` can carry the RPC URL and its key, so only `shortMessage`. */
function errorDetail(error: unknown): string | null {
  if (error instanceof BaseError) return error.shortMessage;
  return isLookupLimitError(error) ? error.message : null;
}

function budgetExhausted(): MetaEvidenceResult {
  return failure("budget-exhausted", "rpc-error", "The meta-evidence could not be loaded within its time budget.");
}

function cancelled(stage: TransientReason): MetaEvidenceResult {
  return failure(stage, "rpc-error", "The meta-evidence load was cancelled.");
}

/** What a thrown attempt means: a cancellation or the end of the budget is final; anything else is worth a retry. */
function classify(load: Load, error: unknown): { readonly result: MetaEvidenceResult; readonly final: boolean } {
  if (load.deadline.cancelled()) return { result: cancelled(load.stage), final: true };
  if (load.deadline.expired()) return { result: budgetExhausted(), final: true };
  if (error instanceof TransientFailure) return { result: failure(error.reason, "rpc-error", error.message), final: false };
  const detail = errorDetail(error);
  const message = TRANSIENT_MESSAGES[load.stage];
  return { result: failure(load.stage, "rpc-error", detail === null ? message : `${message} ${detail}`), final: false };
}

/** D-38: attempts until one settles, a transient failure leaves no room for the 5 s wait and another attempt, or the caller aborts. */
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
 * Loads a dispute's meta-evidence (spec 9.1, A2) within `context.budgetMs` (D-38). Never rejects.
 *
 * Order: the locator (`missing` without a `metaEvidenceUri`); the content-addressing check of the URI (else the
 * placeholder); the file through the gateway (`not-json`); legacy keys and the default `rulingOptions.type`; then either
 * the registered Reality proxy path (script skipped, options from the on-chain question) or the dynamic-script gates and
 * run; finally the schema on the merged result (C13). Rejections (`invalid`) are never cached (A2). Transient failures
 * are retried after 5 s while the budget can hold another attempt, then reported; deterministic ones are not retried; a
 * step still running when the budget ends is `budget-exhausted`; the caller's abort ends the load at once.
 */
export async function loadMetaEvidence(context: MetaEvidenceContext): Promise<MetaEvidenceResult> {
  const locatorUrl = metaEvidenceLocatorUrl(context.env, context.arbitratorChainId, context.disputeId);
  if (locatorUrl === null) return failure("locator-error", "unsupported", "No meta-evidence API is configured (REACT_APP_METAEVIDENCE_URL).");
  const deadline = startDeadline(context.budgetMs, context.signal);
  const load: Load = { context, locatorUrl, gateway: resolveGateway(context.env), registry: context.registry ?? REGISTRY, deadline, stage: "locator-error" };
  try {
    return await attemptWithinBudget(load);
  } finally {
    deadline.dispose();
  }
}
