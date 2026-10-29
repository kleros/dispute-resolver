import { compareBigint } from "../bigint";
import type { TieDialect } from "../families/types";
import type { BehaviorOverride } from "../registry/types";
import { REFUSED_RULING_TEXT, combinationTitle, decodeRulingCode, formatRuling, isVariableType, reservedCode } from "../rulings";
import type { FallbackOutcomes, RulingOptions } from "../rulings/types";

import { fundedPercent, isWinningCode } from "./amounts";
import type { AppealAmounts, CardFundingState, CardOrigin, CardSide, CrowdfundingCard, CrowdfundingSet, RoundFunding } from "./types";

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
  /** The rulings the contract reported fully funded in the round. */
  readonly funded: ReadonlySet<bigint>;
  /** Every ruling shares one side: a governor tie, or a tie where every option is a winner. */
  readonly shared: boolean;
}

const FULLY_FUNDED_PERCENT = 100;

/**
 * One fixed card. Costing and deadline follow `isWinningCode`, but the "Latest jury decision" mark is the current ruling
 * only, so Unslashed's ruling 0 marks no option although every option is costed as a winner. A ruling the contract
 * reported fully funded stays so even if today's appeal cost would ask for more.
 */
function card(context: CardContext, origin: CardOrigin, title: string, code: bigint): CrowdfundingCard {
  const winning = isWinningCode(code, context.currentRuling, context.override);
  const terms = winning ? context.amounts.winner : context.amounts.loser;
  let side: CardSide = winning ? "winner" : "loser";
  if (context.shared) side = "shared";
  const contributed = context.contributed.get(code) ?? 0n;
  const fullyFunded = context.funded.has(code);
  const percent = fundedPercent(contributed, terms.total);
  let remaining = terms.total > contributed ? terms.total - contributed : 0n;
  if (fullyFunded) remaining = 0n;
  return {
    origin,
    title,
    code,
    isWinner: code === context.currentRuling,
    side,
    required: terms.total,
    contributed,
    remaining,
    fundedPercent: fullyFunded ? Math.max(percent, FULLY_FUNDED_PERCENT) : percent,
    deadline: terms.deadline,
    fullyFunded,
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
 * options a composer, both for a new answer: at the loser amount and deadline, or the shared ones in a tie that costs
 * every ruling alike.
 */
export function buildCrowdfundingCards(input: {
  readonly rulingOptions: RulingOptions;
  readonly fallbackOutcomes: FallbackOutcomes;
  readonly currentRuling: bigint;
  readonly amounts: AppealAmounts;
  readonly funding: RoundFunding;
  readonly override: BehaviorOverride | undefined;
  /** How the sides are set while the current ruling is 0; `null` otherwise. */
  readonly tie: TieDialect | null;
}): CrowdfundingSet {
  const { rulingOptions, fallbackOutcomes, amounts } = input;
  const contributed = new Map<bigint, bigint>();
  for (const { ruling, amount } of input.funding.contributions) contributed.set(ruling, (contributed.get(ruling) ?? 0n) + amount);
  const shared = input.tie === "shared-full-period" || input.tie === "all-winner";
  const context: CardContext = { currentRuling: input.currentRuling, amounts, override: input.override, contributed, funded: new Set(input.funding.fundedRulings), shared };
  const refuse = input.override?.refuseToArbitrateFundable === false ? [] : [card(context, "refuse", REFUSED_RULING_TEXT, 0n)];
  const fixed = [...refuse, ...reservedCards(context, rulingOptions.reserved)];
  const taken = new Set(fixed.map((fixedCard) => fixedCard.code));
  const cards = [...fixed, ...questionCards(context, rulingOptions, fallbackOutcomes, taken)];
  const { type, titles, precision } = rulingOptions;
  const newAnswer = shared ? amounts.winner : amounts.loser;
  const entered = { side: shared ? ("shared" as const) : ("loser" as const), required: newAnswer.total, deadline: newAnswer.deadline };
  return {
    cards,
    freeInput: isVariableType(type) ? { type, precision, ...entered } : null,
    composer: type === "multiple-select" && titles !== undefined && titles.length > MAX_ENUMERATED_OPTIONS ? { titles, ...entered } : null,
  };
}

/** Fully funded wins over the deadline; otherwise closed from the deadline second on, as the contracts compare strictly. */
export function cardFundingState(card: { readonly deadline: number; readonly fullyFunded: boolean }, nowSeconds: number): CardFundingState {
  if (card.fullyFunded) return "funded";
  return nowSeconds >= card.deadline ? "closed" : "open";
}

/** The funding shown for an answer the user enters on the free input or the composer. */
export interface EnteredAnswerFunding {
  /** The card that already funds the entered answer's code, or `null` for a new answer. */
  readonly card: CrowdfundingCard | null;
  readonly side: CardSide;
  readonly required: bigint;
  readonly contributed: bigint;
  readonly remaining: bigint;
  readonly fundedPercent: number;
  readonly deadline: number;
  readonly fullyFunded: boolean;
}

/**
 * An entered answer whose code already has a card (the current ruling, a contributed value) is funded on that card's
 * side, so it takes that card's numbers; a new answer, or no answer yet, takes the entered card's total and deadline.
 */
export function enteredAnswerFunding(
  cards: readonly CrowdfundingCard[],
  entered: { readonly side: CardSide; readonly required: bigint; readonly deadline: number },
  code: bigint | null,
): EnteredAnswerFunding {
  const matched = code === null ? undefined : cards.find((candidate) => candidate.code === code);
  if (matched === undefined) {
    return {
      card: null,
      side: entered.side,
      required: entered.required,
      contributed: 0n,
      remaining: entered.required,
      fundedPercent: 0,
      deadline: entered.deadline,
      fullyFunded: false,
    };
  }
  const { side, required, contributed, remaining, deadline, fullyFunded } = matched;
  return { card: matched, side, required, contributed, remaining, fundedPercent: matched.fundedPercent, deadline, fullyFunded };
}
