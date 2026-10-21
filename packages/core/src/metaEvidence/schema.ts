import { isAddress } from "viem";
import { z } from "../zod";
import { parseChainId } from "../chains";
import type { RealityStatus, SafePopulateReason } from "../reality/types";
import { parsePrecision, toText } from "../rulings";
import type { RulingOptions } from "../rulings/types";
import type { Hex, Outcome } from "../types";
import { type JsonObject, isPlainObject, isTruthy, own } from "./json";
import type { ChainIdField, MetaEvidence } from "./types";

/** A string schema accepting exactly the keys of `members`; the record type makes the member list exhaustive. */
export function oneOf<T extends string>(members: Readonly<Record<T, true>>) {
  return z.custom<T>((value) => typeof value === "string" && Object.hasOwn(members, value));
}

const REALITY_STATUSES: Readonly<Record<RealityStatus, true>> = { verified: true, malformed: true, unresolvable: true, unverified: true };

const SAFE_POPULATE_REASONS: Readonly<Record<SafePopulateReason, true>> = {
  "invalid-input": true,
  "invalid-template": true,
  "param-count-mismatch": true,
  "unsupported-placeholder": true,
  "invalid-outcomes": true,
  "invalid-value": true,
  "invalid-json": true,
  "duplicate-keys": true,
  "key-mismatch": true,
  "type-mismatch": true,
};

const QUESTION_ID = /^0x[0-9a-fA-F]{64}$/;
const DECIMAL = /^\d+$/;

/** Ruling options as `parseRulingOptions` produces them. Also the check of a cached entry (B15). */
const rulingOptionsShape = z.object({
  type: z.string(),
  titles: z.array(z.string()).optional(),
  descriptions: z.union([z.array(z.string()), z.record(z.string(), z.string())]).optional(),
  reserved: z.record(z.string(), z.string()).optional(),
  precision: z.number().optional(),
});

const chainIdFieldShape = z.discriminatedUnion("status", [
  z.object({ status: z.literal("absent") }),
  z.object({ status: z.literal("valid"), chainId: z.number().refine((chainId) => parseChainId(chainId) === chainId) }),
  z.object({ status: z.literal("invalid") }),
]);

const realityQuestionShape = z.object({
  status: oneOf(REALITY_STATUSES),
  reason: oneOf(SAFE_POPULATE_REASONS).optional(),
  divergent: z.boolean().optional(),
  questionId: z.custom<Hex>((value) => typeof value === "string" && QUESTION_ID.test(value)).optional(),
  templateId: z.string().regex(DECIMAL).optional(),
  title: z.string().optional(),
});

function isAliasAddress(key: string): boolean {
  return isAddress(key, { strict: false });
}

/**
 * A `MetaEvidence` as the pipeline produces it: every field validated, nothing coercible left. `parseMetaEvidence` pipes
 * its coerced output through it, and `parseCachedMetaEvidenceResult` checks a persisted entry with it (B15, D-13).
 */
export const metaEvidenceShape = z.object({
  title: z.string(),
  description: z.string(),
  question: z.string().nullable(),
  category: z.string().nullable(),
  rulingOptions: rulingOptionsShape.nullable(),
  fallbackOutcomes: z.array(z.string()).nullable(),
  fileURI: z.string().nullable(),
  evidenceDisplayInterfaceURI: z.string().nullable(),
  arbitrableInterfaceURI: z.string().nullable(),
  aliases: z.record(z.string().refine(isAliasAddress), z.string()),
  dynamicScriptURI: z.string().nullable(),
  arbitratorChainID: chainIdFieldShape,
  arbitrableChainID: chainIdFieldShape,
  displayParamsVersion: z.string().nullable(),
  realityQuestion: realityQuestionShape.nullable(),
});

/** `String()` over every element, holes included, as `titles.map(String)` does for a JSON array. */
function textArray(value: readonly unknown[]): string[] {
  return Array.from(value, toText);
}

/** Spec 5.13 shows a description only when it is defined: neither `null` nor `undefined`. */
function isDefined(value: unknown): boolean {
  return value !== null && value !== undefined;
}

/** The defined entries of `entries` as strings, keys as written. */
function definedTexts(entries: readonly (readonly [string, unknown])[]): Record<string, string> {
  return Object.fromEntries(entries.filter((entry) => isDefined(entry[1])).map(([key, value]) => [key, toText(value)]));
}

/**
 * `descriptions` (spec 5.13, 9.2), looked up by position for titles and by code for reserved options: an array whose
 * every position is defined stays a positional array of strings; an object, or an array with an undefined position or a
 * hole, becomes a record of its defined entries as strings, keyed as written (positions as decimal strings). Any other
 * value is removed. Only own entries are read, so a sparse array costs its defined positions, not its length.
 */
function descriptionsField(options: JsonObject): { descriptions?: string[] | Record<string, string> } {
  const descriptions = own(options, "descriptions");
  if (!Array.isArray(descriptions) && !isPlainObject(descriptions)) return {};
  const entries = Object.entries(descriptions);
  const positional =
    Array.isArray(descriptions) && entries.length === descriptions.length && entries.every(([key, value], position) => key === String(position) && isDefined(value));
  return { descriptions: positional ? entries.map((entry) => toText(entry[1])) : definedTexts(entries) };
}

/** `precision` as reality-eth-lib reads it for display and encoding (`parsePrecision`), removed when unusable. */
function precisionField(options: JsonObject): { precision?: number } {
  const precision = parsePrecision(own(options, "precision"));
  return precision === undefined ? {} : { precision };
}

/**
 * Today's `sanitizeRulingOptions` (spec 9.1 step 9, A7) as a schema. Unknown keys are dropped; the five known ones keep
 * today's rules, so a `type` string the app does not know is kept verbatim (MODULES.md choice 7).
 */
const rulingOptionsSchema = z
  .custom<JsonObject>(isPlainObject)
  .transform((options) => {
    const type = own(options, "type");
    const titles = own(options, "titles");
    const reserved = own(options, "reserved");
    return {
      type: typeof type === "string" ? type : "single-select",
      ...(Object.hasOwn(options, "titles") ? { titles: Array.isArray(titles) ? textArray(titles) : [] } : {}),
      ...descriptionsField(options),
      ...(isPlainObject(reserved) ? { reserved: Object.fromEntries(Object.entries(reserved).map(([code, title]) => [code, toText(title)])) } : {}),
      ...precisionField(options),
    };
  })
  .pipe(rulingOptionsShape)
  .catch(() => ({ type: "single-select", titles: [] }));

/**
 * Validated ruling options (A7): a non-object becomes `{type: "single-select", titles: []}`; a non-string `type` becomes
 * "single-select"; `titles`, when present, become strings (`[]` when not an array); `reserved` becomes an object of string
 * values, or is removed when not an object; `precision` is read as reality-eth-lib reads it (`parsePrecision`: removed
 * when its `Number()` is not finite or it is `null`, `false` or `""`, else `parseInt(String(precision))` with its radix
 * inference, 0 when not positive); `descriptions`, by position or by reserved code, keep their defined entries as
 * strings, or are removed when neither an array nor an object (spec 5.13, 9.2). Never throws.
 */
export function parseRulingOptions(value: unknown): RulingOptions {
  return rulingOptionsSchema.parse(value);
}

/** Spec 9.1: meta-evidence is valid when it is an object with a truthy `title` or `rulingOptions`. */
export function isValidMetaEvidence(value: unknown): value is JsonObject {
  return isPlainObject(value) && (isTruthy(own(value, "title")) || isTruthy(own(value, "rulingOptions")));
}

/** Rendered text (B12): strings as they are, numbers and booleans through `String()`, anything else dropped. */
function displayText(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  return typeof value === "number" || typeof value === "boolean" ? String(value) : undefined;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** Today's `field || chainID` default (spec 9.5): falsy is absent; anything else must name a configured chain (B5, B6). */
function chainIdField(value: unknown): ChainIdField {
  if (!isTruthy(value)) return { status: "absent" };
  const chainId = parseChainId(value);
  return chainId === undefined ? { status: "invalid" } : { status: "valid", chainId };
}

/**
 * `_v` (spec 9.4): today's `const { _v = "0" } = json; _v === "0"` selects the JSON encoding. Absent is `null`; a string
 * is kept; any other present value is `""`, which, like the value itself today, is not `"0"` and selects `URLSearchParams`.
 */
function displayParamsVersion(value: unknown): string | null {
  if (value === undefined) return null;
  return typeof value === "string" ? value : "";
}

/** `{address: name}` entries whose key is an address (any case) and whose name is a string, keys as written. */
function aliases(value: unknown): Record<string, string> {
  if (!isPlainObject(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => isAliasAddress(entry[0]) && typeof entry[1] === "string"));
}

const FALLBACK_OUTCOME_PATHS: readonly (readonly string[])[] = [["dispute", "template", "outcomes"], ["template", "outcomes"], ["outcomes"], ["question", "outcomes"]];

function readPath(value: unknown, path: readonly string[]): unknown {
  let current = value;
  for (const key of path) {
    if (!isPlainObject(current)) return undefined;
    current = own(current, key);
  }
  return current;
}

/** Spec 5.9 and 9.2: the first non-empty array of the four legacy Reality paths, each outcome as text, indexes kept. */
function fallbackOutcomes(json: JsonObject): string[] | null {
  for (const path of FALLBACK_OUTCOME_PATHS) {
    const outcomes = readPath(json, path);
    if (Array.isArray(outcomes) && outcomes.length > 0) return textArray(outcomes);
  }
  return null;
}

/**
 * The field-by-field coercion of a meta-evidence object (C13); its result always satisfies `metaEvidenceShape`, which
 * `parseMetaEvidence` checks. `realityQuestion` is derived, never read.
 */
export function coerceMetaEvidence(json: JsonObject): z.input<typeof metaEvidenceShape> {
  return {
    title: displayText(own(json, "title")) ?? "",
    description: displayText(own(json, "description")) ?? "",
    question: displayText(own(json, "question")) ?? null,
    category: stringOrNull(own(json, "category")),
    rulingOptions: isValidMetaEvidence(json) ? rulingOptionsSchema.parse(own(json, "rulingOptions")) : null,
    fallbackOutcomes: fallbackOutcomes(json),
    fileURI: stringOrNull(own(json, "fileURI")),
    evidenceDisplayInterfaceURI: stringOrNull(own(json, "evidenceDisplayInterfaceURI")),
    arbitrableInterfaceURI: stringOrNull(own(json, "arbitrableInterfaceURI")),
    aliases: aliases(own(json, "aliases")),
    dynamicScriptURI: stringOrNull(own(json, "dynamicScriptURI")),
    arbitratorChainID: chainIdField(own(json, "arbitratorChainID")),
    arbitrableChainID: chainIdField(own(json, "arbitrableChainID")),
    displayParamsVersion: displayParamsVersion(own(json, "_v")),
    realityQuestion: null,
  };
}

const metaEvidenceSchema = z.custom<JsonObject>(isPlainObject).transform(coerceMetaEvidence).pipe(metaEvidenceShape);

/**
 * Validates meta-evidence after the dynamic-script merge (A23, C13, B12). The merged value must be a plain object, else
 * `invalid-data`. An object with neither `title` nor `rulingOptions` stays valid with `rulingOptions: null` and renders
 * what it has (MODULES.md choice 8); otherwise `rulingOptions` goes through `parseRulingOptions` (spec 9.1 step 9).
 * Strings are kept; a non-string `title`, `description` or `question` is coerced only from a number or boolean and
 * otherwise dropped; `aliases` keep address keys with string names; chain IDs become `ChainIdField`s; `fallbackOutcomes`
 * come from the legacy Reality paths. `realityQuestion` is always `null` here: only the pipeline derives it. Never throws.
 */
export function parseMetaEvidence(merged: unknown): Outcome<MetaEvidence> {
  const parsed = metaEvidenceSchema.safeParse(merged);
  if (parsed.success) return { ok: true, value: parsed.data };
  return { ok: false, error: { code: "invalid-data", message: "The meta-evidence is not a JSON object." } };
}

const PLACEHOLDER_TITLES: readonly string[] = Object.freeze([]);
const ABSENT: ChainIdField = Object.freeze({ status: "absent" });

/** The "invalid or tampered" placeholder of spec 9.1 (A2). Frozen; never cached. */
export const INVALID_META_EVIDENCE: MetaEvidence = Object.freeze({
  title: "Invalid or tampered case data, refuse to arbitrate.",
  description:
    "In case you have an AdBlock enabled, please disable it and refresh the page. It may be preventing the correct working of the page. If that's not the case, the data for this case is not formatted correctly or has been tampered since the time of its submission. Please refresh the page and refuse to arbitrate if the problem persists.",
  question: null,
  category: null,
  rulingOptions: Object.freeze({ type: "single-select", titles: PLACEHOLDER_TITLES }),
  fallbackOutcomes: null,
  fileURI: null,
  evidenceDisplayInterfaceURI: null,
  arbitrableInterfaceURI: null,
  aliases: Object.freeze({}),
  dynamicScriptURI: null,
  arbitratorChainID: ABSENT,
  arbitrableChainID: ABSENT,
  displayParamsVersion: null,
  realityQuestion: null,
});
