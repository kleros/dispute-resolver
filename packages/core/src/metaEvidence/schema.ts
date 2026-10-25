import { isAddress } from "viem";
import { z } from "../zod";
import { parseChainId } from "../chains";
import { fail, succeed } from "../outcome";
import { DECIMAL_STRING, QUESTION_ID } from "../reality/cache";
import type { RealityStatus, SafePopulateReason } from "../reality/types";
import { parsePrecision, toText, unshadowedReserved } from "../rulings";
import type { FallbackOutcomes } from "../rulings/types";
import type { Hex, Outcome } from "../types";
import { type JsonObject, isPlainObject, own } from "./json";
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
  templateId: z.string().regex(DECIMAL_STRING).optional(),
  title: z.string().optional(),
});

function isAliasAddress(key: string): boolean {
  return isAddress(key, { strict: false });
}

/** Every field validated, nothing coercible left; a persisted entry is checked against it too. */
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

/** Holes included, which `map` would skip. */
function textArray(value: readonly unknown[]): string[] {
  return Array.from(value, toText);
}

function isDefined(value: unknown): boolean {
  return value !== null && value !== undefined;
}

function definedTexts(entries: readonly (readonly [string, unknown])[]): Record<string, string> {
  return Object.fromEntries(entries.filter((entry) => isDefined(entry[1])).map(([key, value]) => [key, toText(value)]));
}

/**
 * Looked up by position for titles and by code for reserved options: an array whose every position is defined stays a
 * positional array of strings; an object, or an array with an undefined position or a hole, becomes a record of its
 * defined entries as strings, keyed as written. Only own entries are read, so a sparse array costs its defined
 * positions, not its length.
 */
function descriptionsField(options: JsonObject): { descriptions?: string[] | Record<string, string> } {
  const descriptions = own(options, "descriptions");
  if (!Array.isArray(descriptions) && !isPlainObject(descriptions)) return {};
  const entries = Object.entries(descriptions);
  const positional =
    Array.isArray(descriptions) && entries.length === descriptions.length && entries.every(([key, value], position) => key === String(position) && isDefined(value));
  return { descriptions: positional ? entries.map((entry) => toText(entry[1])) : definedTexts(entries) };
}

/** Read as reality-eth-lib reads it, so the precision shown is the one encoded. */
function precisionField(options: JsonObject): { precision?: number } {
  const precision = parsePrecision(own(options, "precision"));
  return precision === undefined ? {} : { precision };
}

/** Unknown keys are dropped, but a `type` string the app does not know is kept verbatim. */
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

export function isValidMetaEvidence(value: unknown): value is JsonObject {
  return isPlainObject(value) && (Boolean(own(value, "title")) || Boolean(own(value, "rulingOptions")));
}

/** Anything but a string, number or boolean is dropped, so an object title cannot reach the renderer. */
function displayText(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  return typeof value === "number" || typeof value === "boolean" ? String(value) : undefined;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function chainIdField(value: unknown): ChainIdField {
  if (!value) return { status: "absent" };
  const chainId = parseChainId(value);
  return chainId === undefined ? { status: "invalid" } : { status: "valid", chainId };
}

/** A present non-string `_v` becomes `""`: like the value itself, it is not `"0"`, so it selects `URLSearchParams`. */
function displayParamsVersion(value: unknown): string | null {
  if (value === undefined) return null;
  return typeof value === "string" ? value : "";
}

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

function fallbackOutcomes(json: JsonObject): string[] | null {
  for (const path of FALLBACK_OUTCOME_PATHS) {
    const outcomes = readPath(json, path);
    if (Array.isArray(outcomes) && outcomes.length > 0) return textArray(outcomes);
  }
  return null;
}

type ParsedRulingOptions = z.output<typeof rulingOptionsSchema>;

/** The question's own codes (0, then its options) keep their reading: a reserved answer written on one of them is dropped. */
function rulingOptionsField(json: JsonObject, fallback: FallbackOutcomes): ParsedRulingOptions | null {
  if (!isValidMetaEvidence(json)) return null;
  const { reserved, ...options } = rulingOptionsSchema.parse(own(json, "rulingOptions"));
  const kept = unshadowedReserved({ ...options, reserved }, fallback);
  return kept === undefined ? options : { ...options, reserved: kept };
}

/** Its result always satisfies `metaEvidenceShape`. `realityQuestion` is derived by the pipeline, never read. */
export function coerceMetaEvidence(json: JsonObject): z.input<typeof metaEvidenceShape> {
  const fallback = fallbackOutcomes(json);
  return {
    title: displayText(own(json, "title")) ?? "",
    description: displayText(own(json, "description")) ?? "",
    question: displayText(own(json, "question")) ?? null,
    category: stringOrNull(own(json, "category")),
    rulingOptions: rulingOptionsField(json, fallback),
    fallbackOutcomes: fallback,
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
 * Never throws. An object with neither `title` nor `rulingOptions` stays valid with `rulingOptions: null` and renders
 * what it has.
 */
export function parseMetaEvidence(merged: unknown): Outcome<MetaEvidence> {
  const parsed = metaEvidenceSchema.safeParse(merged);
  if (parsed.success) return succeed(parsed.data);
  return fail("invalid-data", "The meta-evidence is not a JSON object.");
}

const PLACEHOLDER_TITLES: readonly string[] = Object.freeze([]);
const ABSENT: ChainIdField = Object.freeze({ status: "absent" });

/** The placeholder for a rejected meta-evidence; never cached. */
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
