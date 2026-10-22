import { QUESTION_PARAMS_DELIMITER } from "./constants";
import { isPlainObject, JsonSyntaxError, parseJson, Sentinels, type PlaceholderContext } from "./jsonParser";
import type { PopulatedQuestion, SafePopulateReason, SafePopulateResult } from "./types";

/**
 * Safe replacement for reality-eth-lib's `populatedJSONForTemplate(template, question)`.
 *
 * reality-eth-lib splits the question on U+241F and pastes each part verbatim into the template's `%s` placeholders
 * before calling `JSON.parse`, so a crafted parameter containing `"` can close the string it lands in and add or
 * override keys of the question JSON (`type`, `outcomes`, `title_html`...).
 *
 * Here every placeholder's JSON context is learned from the template first, and each parameter is encoded so that it
 * can only ever be the content of that context:
 * - inside a JSON string: the parameter becomes string content (kept as-is if it is already a valid escaped JSON string
 *   fragment, JSON-escaped otherwise);
 * - as the whole body of an array (`[%s]`): the parameter must be a list of JSON strings, which is re-serialized;
 * - as a bare value (for example `"askedBy": %s` in the Kleros Moderate templates): the parameter must be a single JSON
 *   scalar (number, string, true, false or null);
 * - anywhere else (that is, inside an object key): rejected.
 * The result is then parsed with a strict parser that rejects duplicate keys and checked against the template's keys and
 * type.
 */

const PLACEHOLDER = "%s";

/** Derived or rendered fields that must never be trusted from question data, even when the template declares them. */
const DERIVED_KEYS = ["title_html", "title_text"];

const JSON_NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;
const JSON_LITERALS: ReadonlySet<string> = new Set(["true", "false", "null"]);

type TemplateAnalysis =
  | {
      readonly ok: true;
      readonly contexts: readonly PlaceholderContext[];
      readonly keys: readonly string[];
      readonly type: unknown;
      readonly value: PopulatedQuestion;
    }
  | { readonly ok: false; readonly reason: "invalid-template" };

type BuildResult = { readonly ok: true; readonly question: Record<string, unknown> } | { readonly ok: false; readonly reason: SafePopulateReason };

/** reality-eth-lib strips NUL characters from the interpolated text before parsing: so does this module. */
function withoutNul(text: string): string {
  return text.replaceAll("\0", "");
}

function countPlaceholders(templateText: string): number {
  return templateText.split(PLACEHOLDER).length - 1;
}

function analyzeTemplate(templateText: string): TemplateAnalysis {
  const count = countPlaceholders(templateText);
  const sentinels = new Sentinels(templateText);
  let index = 0;
  const withSentinels = templateText.replaceAll(PLACEHOLDER, () => sentinels.token(index++));

  let parsed;
  try {
    parsed = parseJson(withSentinels, sentinels);
  } catch (error) {
    if (error instanceof JsonSyntaxError) return { ok: false, reason: "invalid-template" };
    throw error;
  }
  if (!isPlainObject(parsed.value) || parsed.hasDuplicateKeys) return { ok: false, reason: "invalid-template" };

  const contexts: (PlaceholderContext | undefined)[] = new Array<PlaceholderContext | undefined>(count).fill(undefined);
  for (const placeholder of parsed.placeholders) {
    if (placeholder.index >= count || contexts[placeholder.index] !== undefined) return { ok: false, reason: "invalid-template" };
    contexts[placeholder.index] = placeholder.context;
  }
  const complete = contexts.filter((context) => context !== undefined);
  if (complete.length !== count) return { ok: false, reason: "invalid-template" };

  return { ok: true, contexts: complete, keys: Object.keys(parsed.value), type: parsed.value.type, value: parsed.value };
}

function encodeStringParam(param: string): string {
  try {
    JSON.parse(`"${param}"`);
    return param; // Already a correctly escaped JSON string fragment.
  } catch {
    return JSON.stringify(param).slice(1, -1);
  }
}

function encodeArrayParam(param: string): string | null {
  let values: unknown;
  try {
    values = JSON.parse(`[${param}]`);
  } catch {
    return null;
  }
  if (!Array.isArray(values) || !values.every((value) => typeof value === "string")) return null;
  return values.map((value) => JSON.stringify(value)).join(",");
}

function encodeValueParam(param: string): string | null {
  const trimmed = param.trim();
  if (JSON_NUMBER.test(trimmed) || JSON_LITERALS.has(trimmed)) return trimmed; // Number text is kept as written.
  if (!trimmed.startsWith('"')) return null;
  try {
    const value: unknown = JSON.parse(trimmed);
    return typeof value === "string" ? JSON.stringify(value) : null;
  } catch {
    return null;
  }
}

function encodeParam(context: PlaceholderContext, param: string): { readonly encoded: string } | { readonly reason: SafePopulateReason } {
  if (context === "string") return { encoded: encodeStringParam(param) };
  if (context === "array") {
    const list = encodeArrayParam(param);
    return list === null ? { reason: "invalid-outcomes" } : { encoded: list };
  }
  if (context === "value") {
    const value = encodeValueParam(param);
    return value === null ? { reason: "invalid-value" } : { encoded: value };
  }
  return { reason: "unsupported-placeholder" };
}

function substitute(templateText: string, encoded: readonly string[]): string {
  let index = 0;
  return templateText.replaceAll(PLACEHOLDER, () => encoded[index++] ?? "");
}

function buildQuestion(templateText: string, analysis: Extract<TemplateAnalysis, { ok: true }>, params: readonly string[]): BuildResult {
  const encoded: string[] = [];
  for (const [index, context] of analysis.contexts.entries()) {
    const result = encodeParam(context, params[index] ?? "");
    if ("reason" in result) return { ok: false, reason: result.reason };
    encoded.push(result.encoded);
  }

  let parsed;
  try {
    parsed = parseJson(substitute(templateText, encoded));
  } catch (error) {
    if (error instanceof JsonSyntaxError) return { ok: false, reason: "invalid-json" };
    throw error;
  }
  if (parsed.hasDuplicateKeys) return { ok: false, reason: "duplicate-keys" };

  const question = parsed.value;
  if (!isPlainObject(question)) return { ok: false, reason: "key-mismatch" };
  const keys = Object.keys(question);
  if (keys.length !== analysis.keys.length || !analysis.keys.every((key) => keys.includes(key))) return { ok: false, reason: "key-mismatch" };
  if (JSON.stringify(question.type) !== JSON.stringify(analysis.type)) return { ok: false, reason: "type-mismatch" };

  for (const key of DERIVED_KEYS) Reflect.deleteProperty(question, key);
  return { ok: true, question };
}

/**
 * Parameters missing for the template's placeholders are filled with "" and extra ones are ignored, like reality-eth-lib
 * does; that case reports `param-count-mismatch` with the best-effort question.
 */
export function safePopulatedJSONForTemplate(templateText: string, questionText: string): SafePopulateResult {
  if (typeof templateText !== "string" || typeof questionText !== "string") return { ok: false, reason: "invalid-input" };

  const template = withoutNul(templateText);
  const questionData = withoutNul(questionText);

  const analysis = analyzeTemplate(template);
  if (!analysis.ok) return analysis;

  const placeholderCount = analysis.contexts.length;
  const params = placeholderCount === 0 && questionData === "" ? [] : questionData.split(QUESTION_PARAMS_DELIMITER);

  if (params.length !== placeholderCount) {
    const bestEffort = buildQuestion(template, analysis, params);
    return bestEffort.ok ? { ok: false, reason: "param-count-mismatch", question: bestEffort.question, bestEffort: true } : { ok: false, reason: "param-count-mismatch" };
  }

  return buildQuestion(template, analysis, params);
}

export function analyzedTemplate(templateText: string): PopulatedQuestion | null {
  if (typeof templateText !== "string") return null;
  const analysis = analyzeTemplate(withoutNul(templateText));
  return analysis.ok ? analysis.value : null;
}
