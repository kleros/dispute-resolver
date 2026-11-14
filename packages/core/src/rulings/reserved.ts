import { reservedCode } from "./combinations";
import { isVariableType } from "./questionTypes";
import type { FallbackOutcomes, OptionsWithinChoices, RulingOptions } from "./types";

/** The outcomes of a question without usable options: Yes (1) and No (2). */
const DEFAULT_OUTCOME_COUNT = 2n;

/**
 * The highest ruling code the question's own options take, mirroring the appeal cards: 1..n for single-select titles,
 * 1..2ⁿ for multiple-select combinations, 1..n of the fallback outcomes (else Yes and No) for anything else, none for a
 * variable-answer type.
 */
function highestOptionCode(options: RulingOptions, fallback: FallbackOutcomes): bigint {
  const { type, titles } = options;
  if (isVariableType(type)) return 0n;
  if (type === "single-select" && titles !== undefined) return BigInt(titles.length);
  if (type === "multiple-select" && titles !== undefined) return 1n << BigInt(titles.length);
  return fallback !== null && fallback.length > 0 ? BigInt(fallback.length) : DEFAULT_OUTCOME_COUNT;
}

type ReservedEntry = readonly [key: string, title: string];

/**
 * The reserved answers of a question that the question does not already code itself, one entry per code: ruling 0
 * always reads as refusing to arbitrate and codes 1..n as the question's options (titles, combinations or fallback
 * outcomes), so a reserved answer on one of those codes is dropped and the option's reading wins everywhere it is shown
 * or funded. A key that is not hex codes no answer and is dropped. A code written in several spellings keeps its first
 * spelling (its descriptions are keyed by the spelling as written) when every spelling carries the same title, and is
 * dropped when the titles differ. `undefined` when none remains.
 */
export function unshadowedReserved(options: RulingOptions, fallback: FallbackOutcomes): Record<string, string> | undefined {
  if (options.reserved === undefined) return undefined;
  const highest = highestOptionCode(options, fallback);
  const byCode = new Map<bigint, ReservedEntry | null>();
  for (const [key, title] of Object.entries(options.reserved)) {
    const code = reservedCode(key);
    if (code === null || code <= highest) continue;
    const first = byCode.get(code);
    if (first === undefined) byCode.set(code, [key, title]);
    else if (first !== null && first[1] !== title) byCode.set(code, null);
  }
  const kept = [...byCode.values()].filter((entry): entry is ReservedEntry => entry !== null);
  return kept.length === 0 ? undefined : Object.fromEntries(kept);
}

type Titles = RulingOptions["titles"];
type Reserved = RulingOptions["reserved"];

/** A single-select's titles code 1..n; a multiple-select's are options to tick, not answers, so they all stay. */
function titlesWithinChoices({ type, titles }: RulingOptions, numberOfChoices: bigint): Titles {
  if (type !== "single-select" || titles === undefined || BigInt(titles.length) <= numberOfChoices) return titles;
  return titles.slice(0, Number(numberOfChoices));
}

/** A key that is not hex names no code, so no number of choices rules it out. */
function reservedWithinChoices(reserved: Reserved, numberOfChoices: bigint): Reserved {
  if (reserved === undefined) return undefined;
  const kept = Object.entries(reserved).filter(([key]) => {
    const code = reservedCode(key);
    return code === null || code <= numberOfChoices;
  });
  return kept.length === 0 ? undefined : Object.fromEntries(kept);
}

/**
 * The ruling options without the answers coded above the dispute's number of choices (single-select titles past it, and
 * reserved answers above it): KlerosLiquid's `castVote` takes no choice above it and the appeal funding contracts refuse
 * a ruling above it, so no such answer can ever win. Multiple-select titles and fallback outcomes stay: the cards and
 * the composer bound their combinations and outcomes by code. A `null` number of choices (not read) keeps every answer.
 */
export function optionsWithinChoices(options: RulingOptions, numberOfChoices: bigint | null): OptionsWithinChoices {
  if (numberOfChoices === null) return { rulingOptions: options, hiddenAnswers: 0 };
  const { titles, reserved, ...rest } = options;
  const keptTitles = titlesWithinChoices(options, numberOfChoices);
  const keptReserved = reservedWithinChoices(reserved, numberOfChoices);
  const hiddenTitles = (titles?.length ?? 0) - (keptTitles?.length ?? 0);
  const hiddenReserved = Object.keys(reserved ?? {}).length - Object.keys(keptReserved ?? {}).length;
  const hiddenAnswers = hiddenTitles + hiddenReserved;
  if (hiddenAnswers === 0) return { rulingOptions: options, hiddenAnswers };
  const within: RulingOptions = { ...rest, ...(keptTitles === undefined ? {} : { titles: keptTitles }), ...(keptReserved === undefined ? {} : { reserved: keptReserved }) };
  return { rulingOptions: within, hiddenAnswers };
}
