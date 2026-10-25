import { compareBigint } from "../bigint";
import type { BehaviorOverride } from "../registry/types";
import { combinationTitle, decodeRulingCode, formatRuling, isVariableType, reservedCode } from "../rulings";
import type { FallbackOutcomes, RulingOptions } from "../rulings/types";
import type { UnixSeconds } from "../types";
import { fundedPercent, isWinningCode } from "./amounts";
import type { AppealAmounts, CardOrigin, CrowdfundingCard, CrowdfundingSet, RoundFunding } from "./types";

const REFUSE_CARD_TITLE = "Invalid / Refused to Arbitrate / Tied";

/** The cards of a question without usable options. */
const DEFAULT_OUTCOMES = ["Yes", "No"] as const;

/** Above this many options, multiple-select cards are no longer enumerated: 2ⁿ cards would flood the panel. */
const MAX_ENUMERATED_OPTIONS = 4;

interface CardContext {
  readonly currentRuling: bigint;
  readonly amounts: AppealAmounts;
  readonly override: BehaviorOverride | undefined;
  /** Total contributed per ruling code in the funding round. */
  readonly contributed: ReadonlyMap<bigint, bigint>;
}

/**
 * One fixed card. Costing and deadline follow `isWinningCode`, but the "Latest jury decision" mark is the current ruling
 * only, so Unslashed's ruling 0 marks no option although every option is costed as a winner.
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

/** One card per reserved answer, coded with its hex key. */
function reservedCards(context: CardContext, reserved: RulingOptions["reserved"]): CrowdfundingCard[] {
  return Object.entries(reserved ?? {}).flatMap(([key, title]) => {
    const code = reservedCode(key);
    return code === null ? [] : [card(context, "reserved", title, code)];
  });
}

function optionCards(context: CardContext, titles: readonly string[]): CrowdfundingCard[] {
  return titles.map((title, index) => card(context, "option", title, BigInt(index + 1)));
}

/**
 * Every combination 0…2ⁿ−1, coded combination + 1, for up to four options; above that only the current ruling's
 * combination and the combinations that already received contributions, in code order.
 */
function combinationCards(context: CardContext, titles: readonly string[]): CrowdfundingCard[] {
  const combinations = 1n << BigInt(titles.length);
  const codes: bigint[] = [];
  if (titles.length <= MAX_ENUMERATED_OPTIONS) {
    for (let code = 1n; code <= combinations; code += 1n) codes.push(code);
  } else {
    const shown = new Set([context.currentRuling, ...context.contributed.keys()]);
    codes.push(...[...shown].filter((code) => code >= 1n && code <= combinations).sort(compareBigint));
  }
  return codes.map((code) => card(context, "combination", combinationTitle(code - 1n, titles), code));
}

/**
 * The contributed values other than the current ruling (titled by decoding the code), then the current ruling when it
 * is not 0. A code in `taken` (the refuse card's, a reserved answer's) already has its card.
 */
function variableCards(context: CardContext, options: RulingOptions, fallbackOutcomes: FallbackOutcomes, taken: ReadonlySet<bigint>): CrowdfundingCard[] {
  const { currentRuling } = context;
  const contributedValues = [...context.contributed.keys()]
    .filter((code) => code !== currentRuling && !taken.has(code))
    .sort(compareBigint)
    .map((code) => card(context, "contributed-value", decodeRulingCode(code, options, fallbackOutcomes), code));
  if (currentRuling === 0n || taken.has(currentRuling)) return contributedValues;
  return [...contributedValues, card(context, "current-ruling", formatRuling(currentRuling, options, fallbackOutcomes), currentRuling)];
}

function questionCards(context: CardContext, options: RulingOptions, fallbackOutcomes: FallbackOutcomes, taken: ReadonlySet<bigint>): CrowdfundingCard[] {
  const { type, titles } = options;
  if (isVariableType(type)) return variableCards(context, options, fallbackOutcomes, taken);
  if (type === "single-select" && titles !== undefined) return optionCards(context, titles);
  if (type === "multiple-select" && titles !== undefined) return combinationCards(context, titles);
  return optionCards(context, fallbackOutcomes !== null && fallbackOutcomes.length > 0 ? fallbackOutcomes : DEFAULT_OUTCOMES);
}

/**
 * The crowdfunding cards of the funding round: the refuse card unless option 0 is not fundable (Unslashed), the
 * reserved answers, then the cards of the question type. Variable types add a free input and multiple-select above four
 * options a composer, both at the loser amount and deadline.
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
  const fixed = [...refuse, ...reservedCards(context, rulingOptions.reserved)];
  const taken = new Set(fixed.map((fixedCard) => fixedCard.code));
  const cards = [...fixed, ...questionCards(context, rulingOptions, fallbackOutcomes, taken)];
  const { type, titles, precision } = rulingOptions;
  const loser = { required: amounts.loser.total, deadline: amounts.loser.deadline };
  return {
    cards,
    freeInput: isVariableType(type) ? { type, precision, ...loser } : null,
    composer: type === "multiple-select" && titles !== undefined && titles.length > MAX_ENUMERATED_OPTIONS ? { titles, ...loser } : null,
  };
}

/** The funding shown for an answer the user enters on the free input or the composer. */
export interface EnteredAnswerFunding {
  /** The card that already funds the entered answer's code, or `null` for a new answer. */
  readonly card: CrowdfundingCard | null;
  readonly required: bigint;
  readonly contributed: bigint;
  readonly remaining: bigint;
  readonly fundedPercent: number;
  readonly deadline: UnixSeconds;
}

/**
 * An entered answer whose code already has a card (the current ruling, a contributed value) is funded on that card's
 * side, so it takes that card's numbers; a new answer, or no answer yet, takes the entered card's total and deadline.
 */
export function enteredAnswerFunding(
  cards: readonly CrowdfundingCard[],
  entered: { readonly required: bigint; readonly deadline: UnixSeconds },
  code: bigint | null,
): EnteredAnswerFunding {
  const matched = code === null ? undefined : cards.find((candidate) => candidate.code === code);
  if (matched === undefined) return { card: null, required: entered.required, contributed: 0n, remaining: entered.required, fundedPercent: 0, deadline: entered.deadline };
  const { required, contributed, remaining, deadline } = matched;
  return { card: matched, required, contributed, remaining, fundedPercent: matched.fundedPercent, deadline };
}
