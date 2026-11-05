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

/**
 * The ruling options without the reserved answers coded above the dispute's number of choices: KlerosLiquid's `castVote`
 * takes no choice above it and the appeal funding contracts refuse a ruling above it, so no such answer can ever win.
 * A `null` number of choices (not read) keeps every reserved answer.
 */
export function reservedWithinChoices(options: RulingOptions, numberOfChoices: bigint | null): OptionsWithinChoices {
  const { reserved, ...rest } = options;
  if (reserved === undefined || numberOfChoices === null) return { rulingOptions: options, hiddenReserved: 0 };
  const entries = Object.entries(reserved);
  const kept = entries.filter(([key]) => {
    const code = reservedCode(key);
    return code === null || code <= numberOfChoices;
  });
  if (kept.length === entries.length) return { rulingOptions: options, hiddenReserved: 0 };
  return { rulingOptions: kept.length === 0 ? rest : { ...rest, reserved: Object.fromEntries(kept) }, hiddenReserved: entries.length - kept.length };
}
