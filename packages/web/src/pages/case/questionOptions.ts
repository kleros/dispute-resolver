import { REFUSED_RULING_TEXT, asQuestionType, type QuestionType, type RulingOptions } from "@dispute-resolver/core";

const QUESTION_TYPE_LABELS: Readonly<Record<QuestionType, string>> = {
  "single-select": "Multiple choice: single select",
  "multiple-select": "Multiple choice: multiple select",
  uint: "Non-negative number",
  int: "Number",
  string: "Text",
  datetime: "Date",
  hash: "Hash",
};

const MAX_CODE_LENGTH = 12;
const CODE_EDGE = 6;
const DECIMAL_INDEX = /^(0|[1-9]\d*)$/;

export interface VotingOption {
  readonly key: string;
  readonly label: string;
  readonly code: string;
  readonly title: string;
  readonly description: string | undefined;
}

function option(key: string, code: string, title: string, description: string | undefined): VotingOption {
  return { key, label: `Option ${code} - ${title}`, code: `Option ${code}`, title, description };
}

export function questionTypeLabel(type: string): string | null {
  const known = asQuestionType(type);
  return known === null ? null : QUESTION_TYPE_LABELS[known];
}

export function shortenRulingCode(code: string): string {
  return code.length > MAX_CODE_LENGTH ? `${code.slice(0, CODE_EDGE)}...${code.slice(-CODE_EDGE)}` : code;
}

/** A positional list answers decimal indexes only; a record answers its own keys only, never an inherited property. */
function descriptionAt(descriptions: RulingOptions["descriptions"], key: string): string | undefined {
  if (descriptions === undefined) return undefined;
  if (isPositional(descriptions)) return DECIMAL_INDEX.test(key) ? descriptions[Number(key)] : undefined;
  return Object.hasOwn(descriptions, key) ? descriptions[key] : undefined;
}

/** `Array.isArray` does not narrow a readonly array out of a union. */
function isPositional(descriptions: NonNullable<RulingOptions["descriptions"]>): descriptions is readonly string[] {
  return Array.isArray(descriptions);
}

/** Title i is coded i + 1 and described by entry i; reserved answers are described by their code. */
export function votingOptions(options: RulingOptions): readonly VotingOption[] | null {
  const type = asQuestionType(options.type);
  if (type !== "single-select" && type !== "multiple-select") return null;
  const refused = option("refused", "0", REFUSED_RULING_TEXT, undefined);
  const titled = (options.titles ?? []).map((title, index) => option(`title-${String(index + 1)}`, String(index + 1), title, descriptionAt(options.descriptions, String(index))));
  const reserved = Object.entries(options.reserved ?? {}).map(([code, title]) =>
    option(`reserved-${code}`, shortenRulingCode(code), title, descriptionAt(options.descriptions, code)),
  );
  return [refused, ...titled, ...reserved];
}
