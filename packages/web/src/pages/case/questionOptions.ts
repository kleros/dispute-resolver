import { asQuestionType, type QuestionType, type RulingOptions } from "@dispute-resolver/core";

/** The question type labels of spec 5.13. */
const QUESTION_TYPE_LABELS: Readonly<Record<QuestionType, string>> = {
  "single-select": "Multiple choice: single select",
  "multiple-select": "Multiple choice: multiple select",
  uint: "Non-negative number",
  int: "Number",
  string: "Text",
  datetime: "Date",
  hash: "Hash",
};

/** Codes longer than this are shown as their first and last six characters (spec 5.13). */
const MAX_CODE_LENGTH = 12;
const CODE_EDGE = 6;
const DECIMAL_INDEX = /^(0|[1-9]\d*)$/;

/** One line of the voting options: "Option {code} - {title}", then ": {description}" when one is defined. */
export interface VotingOption {
  readonly key: string;
  readonly label: string;
  readonly description: string | undefined;
}

/** The label of `rulingOptions.type`, or `null` for a type the app does not know, which today shows nothing (spec 5.13). */
export function questionTypeLabel(type: string): string | null {
  const known = asQuestionType(type);
  return known === null ? null : QUESTION_TYPE_LABELS[known];
}

/** A reserved code as the question panel prints it: up to 12 characters as written, longer ones as `0xffff...ffffff`. */
export function shortenRulingCode(code: string): string {
  return code.length > MAX_CODE_LENGTH ? `${code.slice(0, CODE_EDGE)}...${code.slice(-CODE_EDGE)}` : code;
}

/**
 * The entry of `descriptions` under `key`, as today's `descriptions?.[key]` reads it: a positional list answers decimal
 * indexes only, a record answers its own keys only (never an inherited property).
 */
function descriptionAt(descriptions: RulingOptions["descriptions"], key: string): string | undefined {
  if (descriptions === undefined) return undefined;
  if (isPositional(descriptions)) return DECIMAL_INDEX.test(key) ? descriptions[Number(key)] : undefined;
  return Object.hasOwn(descriptions, key) ? descriptions[key] : undefined;
}

/** `Array.isArray` does not narrow a readonly array out of a union. */
function isPositional(descriptions: NonNullable<RulingOptions["descriptions"]>): descriptions is readonly string[] {
  return Array.isArray(descriptions);
}

/**
 * The voting options of a single- or multiple-select question (spec 5.13): option 0, each title coded from 1 and described
 * by entry i − 1, then each reserved answer described by its code. `null` for the other types, which list no options.
 */
export function votingOptions(options: RulingOptions): readonly VotingOption[] | null {
  const type = asQuestionType(options.type);
  if (type !== "single-select" && type !== "multiple-select") return null;
  const refused: VotingOption = { key: "refused", label: "Option 0 - Refuse to Arbitrate / Invalid", description: undefined };
  const titled = (options.titles ?? []).map(
    (title, index): VotingOption => ({ key: `title-${String(index + 1)}`, label: `Option ${String(index + 1)} - ${title}`, description: descriptionAt(options.descriptions, String(index)) }),
  );
  const reserved = Object.entries(options.reserved ?? {}).map(
    ([code, title]): VotingOption => ({ key: `reserved-${code}`, label: `Option ${shortenRulingCode(code)} - ${title}`, description: descriptionAt(options.descriptions, code) }),
  );
  return [refused, ...titled, ...reserved];
}
