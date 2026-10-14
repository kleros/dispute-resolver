import type { BehaviorOverride } from "../registry/types";
import { combinationTitle, decodeRulingCode, formatRuling, isVariableType, reservedCode } from "../rulings";
import type { FallbackOutcomes, RulingOptions } from "../rulings/types";
import { fundedPercent, isWinningCode } from "./amounts";
import type { AppealAmounts, CardOrigin, CrowdfundingCard, CrowdfundingSet, RoundFunding } from "./types";

/** Today's title of the ruling-0 card (spec 5.12 item 1). */
const REFUSE_CARD_TITLE = "Invalid / Refused to Arbitrate / Tied";

/** The cards of a question without usable options (spec 5.12 item 5). */
const DEFAULT_OUTCOMES = ["Yes", "No"] as const;

/** Above this many options, multiple-select cards are no longer enumerated (D-33). */
const MAX_ENUMERATED_OPTIONS = 4;

interface CardContext {
  readonly currentRuling: bigint;
  readonly amounts: AppealAmounts;
  readonly override: BehaviorOverride | undefined;
  /** Total contributed per ruling code in the funding round. */
  readonly contributed: ReadonlyMap<bigint, bigint>;
}

/**
 * One fixed card. Costing and deadline follow `isWinningCode` (spec 10.1); the "Latest jury decision" mark is the
 * current ruling only, as today, so Unslashed's ruling 0 marks no option although every option is costed as a winner.
 */
function card(context: CardContext, origin: CardOrigin, title: string, code: bigint): CrowdfundingCard {
  const side = isWinningCode(code, context.currentRuling, context.override) ? context.amounts.winner : context.amounts.loser;
  const contributed = context.contributed.get(code) ?? 0n;
  const remaining = side.total > contributed ? side.total - contributed : 0n;
  return {
    origin,
    title,
    code,
    isWinner: code === context.currentRuling,
    required: side.total,
    contributed,
    remaining,
    fundedPercent: fundedPercent(contributed, side.total),
    deadline: side.deadline,
  };
}

/** Spec 5.12 item 2: one card per reserved answer, coded with its hex key; a key that is not hex is skipped (D-36). */
function reservedCards(context: CardContext, reserved: RulingOptions["reserved"]): CrowdfundingCard[] {
  return Object.entries(reserved ?? {}).flatMap(([key, title]) => {
    const code = reservedCode(key);
    return code === null ? [] : [card(context, "reserved", title, code)];
  });
}

/** Cards coded 1..n for a list of titles (spec 5.12 items 3 and 5). */
function optionCards(context: CardContext, titles: readonly string[]): CrowdfundingCard[] {
  return titles.map((title, index) => card(context, "option", title, BigInt(index + 1)));
}

/**
 * Spec 5.12 item 4 with D-33: every combination 0…2ⁿ−1, coded combination + 1, for up to four options; above that only
 * the current ruling's combination and the combinations that already received contributions, in code order.
 */
function combinationCards(context: CardContext, titles: readonly string[]): CrowdfundingCard[] {
  const combinations = 1n << BigInt(titles.length);
  const codes: bigint[] = [];
  if (titles.length <= MAX_ENUMERATED_OPTIONS) {
    for (let code = 1n; code <= combinations; code += 1n) codes.push(code);
  } else {
    const shown = new Set([context.currentRuling, ...context.contributed.keys()]);
    codes.push(...[...shown].filter((code) => code >= 1n && code <= combinations).sort((a, b) => (a < b ? -1 : 1)));
  }
  return codes.map((code) => card(context, "combination", combinationTitle(code - 1n, titles), code));
}

/**
 * Spec 5.12 item 6 with D-04: the contributed values other than the current ruling (titled by decoding the code), then
 * the current ruling at the winner amount and deadline when it is not 0.
 */
function variableCards(context: CardContext, options: RulingOptions, fallbackOutcomes: FallbackOutcomes): CrowdfundingCard[] {
  const contributedValues = [...context.contributed.keys()]
    .filter((code) => code !== context.currentRuling)
    .sort((a, b) => (a < b ? -1 : 1))
    .map((code) => card(context, "contributed-value", decodeRulingCode(code, options, fallbackOutcomes), code));
  if (context.currentRuling === 0n) return contributedValues;
  return [...contributedValues, card(context, "current-ruling", formatRuling(context.currentRuling, options, fallbackOutcomes), context.currentRuling)];
}

/** The type-specific cards of spec 5.12 items 3 to 6. */
function questionCards(context: CardContext, options: RulingOptions, fallbackOutcomes: FallbackOutcomes): CrowdfundingCard[] {
  const { type, titles } = options;
  if (isVariableType(type)) return variableCards(context, options, fallbackOutcomes);
  if (type === "single-select" && titles !== undefined) return optionCards(context, titles);
  if (type === "multiple-select" && titles !== undefined) return combinationCards(context, titles);
  return optionCards(context, fallbackOutcomes !== null && fallbackOutcomes.length > 0 ? fallbackOutcomes : DEFAULT_OUTCOMES);
}

/**
 * The crowdfunding cards of the funding round (spec 5.12 card set, D-04, D-33): the refuse card unless option 0 is not
 * fundable (Unslashed, spec 10.1), the reserved answers, then the cards of the question type. Variable types add a free
 * input and multiple-select above four options a composer, both at the loser amount and deadline. Each card's
 * remaining amount is `max(required − contributed, 0)`.
 */
export function buildCrowdfundingCards(input: {
  readonly rulingOptions: RulingOptions;
  readonly fallbackOutcomes: FallbackOutcomes;
  readonly currentRuling: bigint;
  readonly amounts: AppealAmounts;
  readonly funding: RoundFunding;
  readonly override: BehaviorOverride | undefined;
}): CrowdfundingSet {
  const { rulingOptions, fallbackOutcomes, amounts } = input;
  const contributed = new Map<bigint, bigint>();
  for (const { ruling, amount } of input.funding.contributions) contributed.set(ruling, (contributed.get(ruling) ?? 0n) + amount);
  const context: CardContext = { currentRuling: input.currentRuling, amounts, override: input.override, contributed };
  const refuse = input.override?.refuseToArbitrateFundable === false ? [] : [card(context, "refuse", REFUSE_CARD_TITLE, 0n)];
  const cards = [...refuse, ...reservedCards(context, rulingOptions.reserved), ...questionCards(context, rulingOptions, fallbackOutcomes)];
  const { type, titles, precision } = rulingOptions;
  const loser = { required: amounts.loser.total, deadline: amounts.loser.deadline };
  return {
    cards,
    freeInput: isVariableType(type) ? { type, precision, ...loser } : null,
    composer: type === "multiple-select" && titles !== undefined && titles.length > MAX_ENUMERATED_OPTIONS ? { titles, ...loser } : null,
  };
}
