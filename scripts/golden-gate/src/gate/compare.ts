import type { ScriptKind, ScriptResult } from "../../../../packages/core/src/types";
import type { OldRunOutput } from "../../browser/protocol";
import { hasGarbledText, keepsRealityDelimiter } from "./garble";

/**
 * Why a runner produced no usable output, in classes that do not depend on the runner's mechanics: the old runner has
 * no error channel, so a script that throws or rejects only ever times out there, while the new runner reports it.
 */
export type FailureClass =
  /** The script was not run: the app refused its parameters (today's `getReadOnlyRpcUrl` throw; B5, D-18 in the new app). */
  | "parameters-refused"
  /** The script was not run: its file could not be fetched from the gateway. */
  | "script-unavailable"
  /** The script ran and never resolved: a timeout, a thrown error, a `rejectScript` call. */
  | "no-result"
  /** The script resolved `{}`, `null` or `undefined`, which merges nothing (04 §5: a production failure). */
  | "empty-result"
  /** The script resolved text decoded with the wrong charset (04 §5: a production failure). */
  | "garbled-result"
  /** The new runner itself failed (frame not opened, malformed reply, aborted). */
  | "runner-error";

/**
 * How one side of a run settled. `harness-failure` is the gate's own tooling failing (Chromium closed, the harness page
 * not loading): the script may never have run, so it says nothing about either app and is never compared.
 */
export type SideOutcome =
  | { readonly kind: "success"; readonly value: unknown; readonly jsonDuplicateKeys: boolean }
  | { readonly kind: "failure"; readonly failureClass: FailureClass; readonly detail: string; readonly value?: unknown }
  | { readonly kind: "harness-failure"; readonly detail: string };

/**
 * The 04 §5 verdicts. `identical` and `same-failure-class` pass; `improvement-for-review` is reviewed by hand; the rest
 * fail. `harness-failure` is not a 04 §5 verdict: the rule was never applied because a side did not execute, which fails
 * the run whatever the other side did.
 */
export type Verdict =
  | "identical"
  | "different-output"
  | "new-runner-failed"
  | "improvement-for-review"
  | "same-failure-class"
  | "different-failure-class"
  | "harness-failure";

export const PASSING_VERDICTS: ReadonlySet<Verdict> = new Set(["identical", "same-failure-class"]);
export const REVIEW_VERDICTS: ReadonlySet<Verdict> = new Set(["improvement-for-review"]);

function isEmptyResult(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  return typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0;
}

/** A resolved value, unless it is empty or garbled, which count as failures. */
function resolved(value: unknown, jsonDuplicateKeys: boolean): SideOutcome {
  if (isEmptyResult(value)) return { kind: "failure", failureClass: "empty-result", detail: "the script resolved an empty result", value };
  if (hasGarbledText(value)) return { kind: "failure", failureClass: "garbled-result", detail: "the script resolved charset-garbled text", value };
  return { kind: "success", value, jsonDuplicateKeys };
}

/** How the old runner ran a script: the frame's origin, and the script's charset sensitivity and kind. */
export interface OldRunContext {
  readonly frame: "same-origin" | "opaque";
  /** The script text holds a literal non-ASCII character (`hasNonAsciiLiteral`). */
  readonly charsetSensitive: boolean;
  readonly scriptKind: ScriptKind;
}

/**
 * Whether a production result is a Reality renderer's question left unsplit by the charset fallback: an opaque frame
 * without a charset decodes the script as windows-1252, so its `␟` literal no longer matches the delimiter in the
 * question text, and the whole raw question becomes the title. The output text itself is clean, so `hasGarbledText`
 * cannot see it (04 §5, D-29).
 */
function unsplitByCharset(value: unknown, context: OldRunContext): boolean {
  return context.frame === "opaque" && context.charsetSensitive && context.scriptKind === "reality" && keepsRealityDelimiter(value);
}

/** The old runner's settlement (today's `fetchDataFromScript`). */
export function classifyOld(output: OldRunOutput, timeoutMs: number, context: OldRunContext): SideOutcome {
  if (output.status === "timeout") return { kind: "failure", failureClass: "no-result", detail: `no result within ${String(timeoutMs / 1000)} s` };
  const outcome = resolved(output.result, output.jsonDuplicateKeys);
  if (outcome.kind !== "success" || !unsplitByCharset(output.result, context)) return outcome;
  return {
    kind: "failure",
    failureClass: "garbled-result",
    detail: "the question kept the ␟ delimiter: the script's non-ASCII literals were misread under the opaque frame's windows-1252 fallback (D-29)",
    value: output.result,
  };
}

/** The new runner's settlement (core's `ScriptResult`). */
export function classifyNew(result: ScriptResult): SideOutcome {
  if (result.status === "ok") return resolved(result.value, result.jsonDuplicateKeys);
  const failureClass: FailureClass = result.reason === "timeout" || result.reason === "script-error" ? "no-result" : "runner-error";
  return { kind: "failure", failureClass, detail: `${result.reason}: ${result.message}` };
}

/** JSON with object keys sorted, so two outputs compare by content whatever their key order. */
export function canonicalJson(value: unknown): string {
  const sort = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(sort);
    if (typeof item === "object" && item !== null) return Object.fromEntries(Object.entries(item).sort(([a], [b]) => (a < b ? -1 : Number(a > b))).map(([key, inner]) => [key, sort(inner)]));
    return item;
  };
  return value === undefined ? "undefined" : JSON.stringify(sort(value));
}

/**
 * 04 §5 and C6: where production succeeds the outputs (value and duplicate-key flag) must be identical; where
 * production fails (including `{}` and garbled output) a new-runner success is reviewed by hand; where both fail the
 * failure class must match. A side the harness could not execute fails the run before any of this applies.
 */
export function compareOutcomes(production: SideOutcome, next: SideOutcome): Verdict {
  if (production.kind === "harness-failure" || next.kind === "harness-failure") return "harness-failure";
  if (production.kind === "success") {
    if (next.kind === "failure") return "new-runner-failed";
    const same = canonicalJson(production.value) === canonicalJson(next.value) && production.jsonDuplicateKeys === next.jsonDuplicateKeys;
    return same ? "identical" : "different-output";
  }
  if (next.kind === "success") return "improvement-for-review";
  return production.failureClass === next.failureClass ? "same-failure-class" : "different-failure-class";
}
