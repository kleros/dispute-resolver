import { NONE_OF_THE_OPTIONS_TEXT, REFUSED_RULING_TEXT, asQuestionType, type RulingOptions } from "@dispute-resolver/core";

const MAX_CODE_LENGTH = 12;
const CODE_EDGE = 6;
const DECIMAL_INDEX = /^(0|[1-9]\d*)$/;

export interface VotingOption {
  readonly key: string;
  /** `undefined` for a multiple-select title, which is a box to tick rather than a ruling. */
  readonly code: string | undefined;
  readonly title: string;
  readonly description: string | undefined;
}

function coded(key: string, code: string, title: string, description: string | undefined): VotingOption {
  return { key, code: `Option ${code}`, title, description };
}

function uncoded(key: string, title: string, description: string | undefined): VotingOption {
  return { key, code: undefined, title, description };
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

/**
 * Title i is described by entry i. A single-select codes it i + 1; a multiple-select with titles codes none of them,
 * since a ruling is the set of ticked titles, and lists ruling 1, nothing ticked, after option 0. A multiple-select whose
 * titles are absent, not empty, lists no ruling 1, as core leaves its rulings unnamed. Reserved answers are described by
 * their code.
 */
export function votingOptions(options: RulingOptions): readonly VotingOption[] | null {
  const type = asQuestionType(options.type);
  if (type !== "single-select" && type !== "multiple-select") return null;
  const { titles, descriptions } = options;
  const refused = coded("refused", "0", REFUSED_RULING_TEXT, undefined);
  const titled = (titles ?? []).map((title, index) => {
    const key = `title-${String(index + 1)}`;
    const description = descriptionAt(descriptions, String(index));
    return type === "single-select" ? coded(key, String(index + 1), title, description) : uncoded(key, title, description);
  });
  const none = type === "multiple-select" && titles !== undefined ? [coded("none", "1", NONE_OF_THE_OPTIONS_TEXT, undefined)] : [];
  const reserved = Object.entries(options.reserved ?? {}).map(([code, title]) => coded(`reserved-${code}`, shortenRulingCode(code), title, descriptionAt(descriptions, code)));
  return [refused, ...none, ...titled, ...reserved];
}
