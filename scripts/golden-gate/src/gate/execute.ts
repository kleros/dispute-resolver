import { JSON_DUPLICATE_KEY_GUARD, isRealityScript } from "../../../../packages/core/src/reality";
import type { ScriptKind } from "../../../../packages/core/src/types";
import type { CidPath } from "../../../../packages/core/src/uri/types";
import type { GateBrowser } from "./browser";
import { PASSING_VERDICTS, classifyNew, classifyOld, compareOutcomes, type SideOutcome, type Verdict } from "./compare";
import { hasNonAsciiLiteral } from "./garble";
import type { RunPlan } from "./plan";
import type { RunRecord, SideRecord } from "./report";
import { redactRpcFields, redactUrlsIn } from "../../../../packages/web/e2e/golden/redact";

/** Everything one run needs besides its plan. */
export interface ExecutionDeps {
  readonly browser: Pick<GateBrowser, "runOld" | "runNew">;
  /** Script text per CID path, `null` when the gateway did not serve it. */
  readonly scripts: ReadonlyMap<CidPath, string | null>;
  readonly oldRedirectMap: Readonly<Record<string, string>>;
  /** The RPC variables the new runner's `buildRpcRedirects` reads. */
  readonly rpcEnv: Readonly<Record<string, string>>;
  readonly oldTimeoutMs: number;
  readonly newTimeoutMs: number;
}

/** Failure classes that can come from the network rather than from the script: a run failing on one is tried once more. */
const RETRIED_CLASSES = new Set(["no-result", "runner-error"]);

/** Core's script kind (`loadMetaEvidence`): a Reality renderer runs with the duplicate-key guard (A4). */
function kindOf(scriptText: string): ScriptKind {
  return isRealityScript(scriptText) ? "reality" : "standard";
}

/**
 * A side as it is recorded: its RPC parameters as host and fingerprint, and every URL in a failure's detail (a request
 * URL in a runner or harness error) the same way, so no API key reaches the log. The script's own output is kept as it
 * resolved: it is what the gate compares.
 */
function recorded(side: SideRecord): SideRecord {
  const { outcome } = side;
  return {
    ...side,
    params: redactRpcFields(side.params),
    outcome: outcome.kind === "success" ? outcome : { ...outcome, detail: redactUrlsIn(outcome.detail) },
  };
}

function notRun(scriptCid: CidPath, params: unknown, outcome: SideOutcome): SideRecord {
  return { scriptCid, params, frame: null, outcome, durationMs: 0, diagnostics: null };
}

function unavailable(scriptCid: CidPath): SideOutcome {
  return { kind: "failure", failureClass: "script-unavailable", detail: `the gateway did not serve ${scriptCid}` };
}

/** The gate's own tooling threw, so the script may not have run: never a failure class of the script. */
function harnessFailure(error: unknown): SideOutcome {
  return { kind: "harness-failure", detail: `the harness failed: ${error instanceof Error ? error.message : String(error)}` };
}

async function runProduction(plan: RunPlan, deps: ExecutionDeps): Promise<SideRecord> {
  const { scriptCid, params, sandbox } = plan.old;
  const scriptString = deps.scripts.get(scriptCid) ?? null;
  if (!params.ok) return notRun(scriptCid, null, { kind: "failure", failureClass: "parameters-refused", detail: params.detail });
  if (scriptString === null) return notRun(scriptCid, params.params, unavailable(scriptCid));
  const frame = sandbox?.includes("allow-same-origin") === true ? "same-origin" : "opaque";
  const scriptKind = kindOf(scriptString);
  const started = Date.now();
  try {
    const { output, diagnostics } = await deps.browser.runOld({
      scriptString,
      scriptParameters: params.params,
      redirectMap: deps.oldRedirectMap,
      guardSource: scriptKind === "reality" ? JSON_DUPLICATE_KEY_GUARD : "",
      sandbox: sandbox ?? "allow-scripts ",
      timeoutMs: deps.oldTimeoutMs,
    });
    const outcome = classifyOld(output, deps.oldTimeoutMs, { frame, charsetSensitive: hasNonAsciiLiteral(scriptString), scriptKind });
    return { scriptCid, params: params.params, frame, outcome, durationMs: Date.now() - started, diagnostics };
  } catch (error) {
    return { scriptCid, params: params.params, frame, outcome: harnessFailure(error), durationMs: Date.now() - started, diagnostics: null };
  }
}

async function runNewApp(plan: RunPlan, deps: ExecutionDeps): Promise<SideRecord> {
  const { scriptCid, params } = plan.new;
  const scriptText = deps.scripts.get(scriptCid) ?? null;
  if (!params.ok) return notRun(scriptCid, null, { kind: "failure", failureClass: "parameters-refused", detail: params.error.message });
  if (scriptText === null) return notRun(scriptCid, params.value, unavailable(scriptCid));
  const kind = kindOf(scriptText);
  const started = Date.now();
  try {
    const { output, diagnostics } = await deps.browser.runNew({ request: { scriptText, params: params.value, kind, timeoutMs: deps.newTimeoutMs }, env: deps.rpcEnv });
    return { scriptCid, params: params.value, frame: null, outcome: classifyNew(output), durationMs: Date.now() - started, diagnostics };
  } catch (error) {
    return { scriptCid, params: params.value, frame: null, outcome: harnessFailure(error), durationMs: Date.now() - started, diagnostics: null };
  }
}

function retriable(record: { readonly production: SideRecord; readonly newApp: SideRecord }, verdict: Verdict): boolean {
  if (PASSING_VERDICTS.has(verdict)) return false;
  return [record.production.outcome, record.newApp.outcome].some(
    (outcome) => outcome.kind === "harness-failure" || (outcome.kind === "failure" && RETRIED_CLASSES.has(outcome.failureClass)),
  );
}

/**
 * One gate run: production's runner, then the new app's, on the same dispute, compared under 04 §5. A run that fails
 * the rule with a missing result on either side (a timeout or a runner error, which a flaky RPC can cause) or that the
 * harness could not execute is run once more and the second verdict kept; the first is recorded.
 */
export async function executePlan(plan: RunPlan, deps: ExecutionDeps): Promise<RunRecord> {
  const earlierVerdicts: Verdict[] = [];
  let production = await runProduction(plan, deps);
  let newApp = await runNewApp(plan, deps);
  let verdict = compareOutcomes(production.outcome, newApp.outcome);
  if (retriable({ production, newApp }, verdict)) {
    earlierVerdicts.push(verdict);
    production = await runProduction(plan, deps);
    newApp = await runNewApp(plan, deps);
    verdict = compareOutcomes(production.outcome, newApp.outcome);
  }
  const text = deps.scripts.get(plan.new.scriptCid) ?? null;
  const scriptKind: ScriptKind | null = text === null ? null : kindOf(text);
  production = recorded(production);
  newApp = recorded(newApp);
  return {
    id: plan.id,
    purpose: plan.purpose,
    chainId: plan.reference.chainId,
    disputeId: plan.reference.disputeId,
    arbitrable: plan.reference.arbitrable,
    cid: plan.reference.cid,
    scriptKind,
    charsetSensitive: text === null ? null : hasNonAsciiLiteral(text),
    production,
    newApp,
    verdict,
    earlierVerdicts,
  };
}
