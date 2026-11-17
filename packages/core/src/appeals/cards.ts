import { compareBigint } from "../bigint";
import type { TieDialect } from "../families/types";
import type { BehaviorOverride } from "../registry/types";
import { REFUSED_RULING_TEXT, combinationTitle, decodeRulingCode, formatRuling, isVariableType, reservedCode } from "../rulings";
import type { FallbackOutcomes, RulingOptions } from "../rulings/types";

import { fundedPercent, isWinningCode } from "./amounts";
import type { AppealAmounts, CardFundingState, CardOrigin, CardSide, CrowdfundingCard, CrowdfundingSet, MultipleSelectComposer, RoundFunding } from "./types";

const DEFAULT_OUTCOMES = ["Yes", "No"] as const;

/** Above this many options, multiple-select cards are no longer enumerated: 2ⁿ cards would flood the panel. */
const MAX_ENUMERATED_OPTIONS = 4;
const MULTIPLE_SELECT = "multiple-select";

/**
 * Where funders can add new answers, at most this many cards for answers that hold contributions beyond the cards always
 * shown; the rest are counted.
 */
const MAX_CONTRIBUTED_CARDS = 20;

interface CardContext {
  readonly currentRuling: bigint;
  readonly amounts: AppealAmounts;
  readonly override: BehaviorOverride | undefined;
  readonly contributed: ReadonlyMap<bigint, bigint>;
  readonly funded: ReadonlySet<bigint>;
  /** Every ruling shares one side: a governor tie, or a tie where every option is a winner. */
  readonly shared: boolean;
}

const FULLY_FUNDED_PERCENT = 100;

/**
 * One fixed card. Costing and deadline follow `isWinningCode`, but the "Current ruling" mark follows the current ruling
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

function reservedCards(context: CardContext, reserved: RulingOptions["reserved"]): CrowdfundingCard[] {
  return Object.entries(reserved ?? {}).flatMap(([key, title]) => {
    const code = reservedCode(key);
    return code === null ? [] : [card(context, "reserved", title, code)];
  });
}

function optionCards(context: CardContext, titles: readonly string[]): CrowdfundingCard[] {
  return titles.map((title, index) => card(context, "option", title, BigInt(index + 1)));
}

/** Every combination 0…2ⁿ−1, coded combination + 1. */
function combinationCards(context: CardContext, titles: readonly string[]): CrowdfundingCard[] {
  const combinations = 1n << BigInt(titles.length);
  const cards: CrowdfundingCard[] = [];
  for (let code = 1n; code <= combinations; code += 1n) cards.push(card(context, "combination", combinationTitle(code - 1n, titles), code));
  return cards;
}

/**
 * The cards the question lists: its options, its combinations up to four options, or the fallback outcomes. A variable
 * question and a multiple-select above four options list none: their answers come from the round.
 */
function listedCards(context: CardContext, options: RulingOptions, fallbackOutcomes: FallbackOutcomes): CrowdfundingCard[] {
  const { type, titles } = options;
  if (isVariableType(type)) return [];
  if (type === "single-select" && titles !== undefined) return optionCards(context, titles);
  if (type === MULTIPLE_SELECT && titles !== undefined) return titles.length <= MAX_ENUMERATED_OPTIONS ? combinationCards(context, titles) : [];
  return optionCards(context, fallbackOutcomes !== null && fallbackOutcomes.length > 0 ? fallbackOutcomes : DEFAULT_OUTCOMES);
}

type AnswerOrigin = Extract<CardOrigin, "current-ruling" | "funded-ruling" | "contributed-value">;

/**
 * A card for an answer the question does not list. A multiple-select code within its combinations is titled as one;
 * any other code as the court reads it, or by its number when that reading is empty (an unknown type such as "bool"),
 * except a variable question's current ruling, which keeps the court's reading (empty for a text answer).
 */
function answerCard(context: CardContext, options: RulingOptions, fallbackOutcomes: FallbackOutcomes, origin: AnswerOrigin, code: bigint): CrowdfundingCard {
  const { type, titles } = options;
  if (type === MULTIPLE_SELECT && titles !== undefined && code >= 1n && code <= 1n << BigInt(titles.length)) {
    return card(context, "combination", combinationTitle(code - 1n, titles), code);
  }
  if (origin === "current-ruling") {
    const reading = formatRuling(code, options, fallbackOutcomes);
    return card(context, origin, reading === "" && !isVariableType(type) ? code.toString() : reading, code);
  }
  const title = decodeRulingCode(code, options, fallbackOutcomes);
  return card(context, origin, title === "" ? code.toString() : title, code);
}

interface Contributed {
  readonly code: bigint;
  readonly amount: bigint;
}

function ranksBefore(a: Contributed, b: Contributed): boolean {
  return a.amount === b.amount ? a.code < b.code : a.amount > b.amount;
}

/**
 * The answers holding money that `shown` lacks and the contract accepts, at most `limit` of them in rank order, and how
 * many more there are. One pass without sorting the whole round, which can hold any number of answers.
 */
function largestContributions(contributed: ReadonlyMap<bigint, bigint>, shown: ReadonlySet<bigint>, highestCode: bigint, limit: number) {
  const top: Contributed[] = [];
  let candidates = 0;
  for (const [code, amount] of contributed) {
    if (amount <= 0n || code === 0n || code > highestCode || shown.has(code)) continue;
    candidates += 1;
    const entry = { code, amount };
    const last = top.at(-1);
    if (top.length === limit && last !== undefined && !ranksBefore(entry, last)) continue;
    const at = top.findIndex((ranked) => ranksBefore(entry, ranked));
    top.splice(at === -1 ? top.length : at, 0, entry);
    if (top.length > limit) top.pop();
  }
  return { top, more: candidates - top.length };
}

/** The composer funds no code past its last combination, and nothing funds a code past the dispute's number of choices. */
function highestContributedCode(composer: MultipleSelectComposer | null, numberOfChoices: bigint): bigint {
  if (composer === null) return numberOfChoices;
  const lastCombination = 1n << BigInt(composer.titles.length);
  return lastCombination < numberOfChoices ? lastCombination : numberOfChoices;
}

/**
 * The refuse card unless option 0 is not fundable (Unslashed), the reserved answers and the question's listed cards; then
 * every fully funded ruling in code order and the current ruling, when no card has their code yet. Only where funders can
 * add new answers (the free input or the composer), at most `MAX_CONTRIBUTED_CARDS` other answers that hold contributions
 * follow, largest total first, the lower code first on a tie, none past the composer's last combination; elsewhere a
 * contribution alone adds no card and nothing is counted. Ruling 0 only ever has the refuse card. No card is coded above the dispute's number of choices (a combination or a
 * fallback outcome past it), since the contract refuses a ruling above it. A new answer on the free input or composer
 * takes the loser terms, or the shared ones in a tie that costs every ruling alike.
 */
export function buildCrowdfundingCards(input: {
  readonly rulingOptions: RulingOptions;
  readonly fallbackOutcomes: FallbackOutcomes;
  readonly currentRuling: bigint;
  readonly amounts: AppealAmounts;
  readonly funding: RoundFunding;
  readonly override: BehaviorOverride | undefined;
  readonly tie: TieDialect | null;
  /** The arbitrator's `disputes(id).numberOfChoices`. */
  readonly numberOfChoices: bigint;
}): CrowdfundingSet {
  const { rulingOptions, fallbackOutcomes, amounts, numberOfChoices, currentRuling } = input;
  const contributed = new Map<bigint, bigint>();
  for (const { ruling, amount } of input.funding.contributions) contributed.set(ruling, (contributed.get(ruling) ?? 0n) + amount);
  const shared = input.tie === "shared-full-period" || input.tie === "all-winner";
  const context: CardContext = { currentRuling, amounts, override: input.override, contributed, funded: new Set(input.funding.fundedRulings), shared };
  const cards: CrowdfundingCard[] = [];
  const shown = new Set<bigint>();
  const add = (next: CrowdfundingCard) => {
    shown.add(next.code);
    cards.push(next);
  };
  // The fixed cards are never merged: a reserved answer coded like a listed outcome keeps both cards.
  if (input.override?.refuseToArbitrateFundable !== false) add(card(context, "refuse", REFUSED_RULING_TEXT, 0n));
  for (const reserved of reservedCards(context, rulingOptions.reserved)) add(reserved);
  for (const listed of listedCards(context, rulingOptions, fallbackOutcomes)) add(listed);
  const addAnswer = (origin: AnswerOrigin, code: bigint) => {
    if (code !== 0n && !shown.has(code)) add(answerCard(context, rulingOptions, fallbackOutcomes, origin, code));
  };
  for (const code of Array.from(context.funded).sort(compareBigint)) if (code !== currentRuling) addAnswer("funded-ruling", code);
  addAnswer("current-ruling", currentRuling);
  const { type, titles, precision } = rulingOptions;
  const newAnswer = shared ? amounts.winner : amounts.loser;
  const entered = { side: shared ? ("shared" as const) : ("loser" as const), required: newAnswer.total, deadline: newAnswer.deadline, highestCode: numberOfChoices };
  const freeInput = isVariableType(type) ? { type, precision, ...entered } : null;
  const composer = type === MULTIPLE_SELECT && titles !== undefined && titles.length > MAX_ENUMERATED_OPTIONS ? { titles, ...entered } : null;
  let moreAnswers = 0;
  if (freeInput !== null || composer !== null) {
    const { top, more } = largestContributions(contributed, shown, highestContributedCode(composer, numberOfChoices), MAX_CONTRIBUTED_CARDS);
    for (const { code } of top) addAnswer("contributed-value", code);
    moreAnswers = more;
  }
  return { cards: cards.filter((fundable) => fundable.code <= numberOfChoices), moreAnswers, contributed, freeInput, composer };
}

/** Fully funded wins over the deadline; otherwise closed from the deadline second on, as the contracts compare strictly. */
export function cardFundingState(card: { readonly deadline: number; readonly fullyFunded: boolean }, nowSeconds: number): CardFundingState {
  if (card.fullyFunded) return "funded";
  return nowSeconds >= card.deadline ? "closed" : "open";
}

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
 * side, so it takes that card's numbers; any other answer, or no answer yet, takes the entered card's total and deadline
 * with what the round already holds for it, since an answer past the cards' cap holds contributions without a card.
 */
export function enteredAnswerFunding(
  set: Pick<CrowdfundingSet, "cards" | "contributed">,
  entered: { readonly side: CardSide; readonly required: bigint; readonly deadline: number },
  code: bigint | null,
): EnteredAnswerFunding {
  const matched = code === null ? undefined : set.cards.find((candidate) => candidate.code === code);
  if (matched === undefined) {
    const contributed = code === null ? 0n : (set.contributed.get(code) ?? 0n);
    return {
      card: null,
      side: entered.side,
      required: entered.required,
      contributed,
      remaining: entered.required > contributed ? entered.required - contributed : 0n,
      fundedPercent: fundedPercent(contributed, entered.required),
      deadline: entered.deadline,
      fullyFunded: false,
    };
  }
  const { side, required, contributed, remaining, deadline, fullyFunded } = matched;
  return { card: matched, side, required, contributed, remaining, fundedPercent: matched.fundedPercent, deadline, fullyFunded };
}
