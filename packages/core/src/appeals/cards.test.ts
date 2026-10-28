import { stringToHex } from "viem";
import { describe, expect, it } from "vitest";
import { parseMetaEvidence } from "../metaEvidence";
import { REGISTRY, getOverride } from "../registry";
import { decodeRulingCode, formatRuling } from "../rulings";
import type { FallbackOutcomes, RulingOptions } from "../rulings/types";
import { UNSLASHED } from "./__fixtures__/recorded";
import { buildCrowdfundingCards, cardFundingState, enteredAnswerFunding } from "./index";
import type { AppealAmounts, CrowdfundingCard, CrowdfundingSet, FreeInputCard, RoundFunding } from "./types";

const UNSLASHED_OVERRIDE = getOverride(REGISTRY, 1, UNSLASHED.arbitrable);
const AMOUNTS: AppealAmounts = { winner: { total: 2_000n, deadline: 500 }, loser: { total: 3_000n, deadline: 250 } };
const REFUSED_TITLE = "Invalid / Refused to Arbitrate / Tied";
const MAX_UINT = 2n ** 256n - 1n;
const ANSWERED_TOO_SOON = { [`0x${"f".repeat(64)}`]: "Answered Too Soon" };
/** A uint answer with 18 decimals whose code is above 2^53, where a `Number` would lose its last digit. */
const LARGE_UINT_CODE = 10n ** 18n + 1n;

function funding(contributions: Readonly<Record<string, bigint>> = {}, fundedRulings: readonly bigint[] = []): RoundFunding {
  return { round: 0n, contributions: Object.entries(contributions).map(([ruling, amount]) => ({ ruling: BigInt(ruling), amount })), fundedRulings };
}

function build(input: {
  readonly rulingOptions: RulingOptions;
  readonly currentRuling: bigint;
  readonly contributions?: Readonly<Record<string, bigint>>;
  readonly fallbackOutcomes?: FallbackOutcomes;
  readonly unslashed?: boolean;
  readonly fundedRulings?: readonly bigint[];
}) {
  const unslashed = input.unslashed === true;
  return buildCrowdfundingCards({
    rulingOptions: input.rulingOptions,
    fallbackOutcomes: input.fallbackOutcomes ?? null,
    currentRuling: input.currentRuling,
    amounts: AMOUNTS,
    funding: funding(input.contributions, input.fundedRulings),
    override: unslashed ? UNSLASHED_OVERRIDE : undefined,
    tie: unslashed && input.currentRuling === 0n ? "all-winner" : null,
  });
}

const summary = (cards: readonly CrowdfundingCard[]) => cards.map((card) => [card.code, card.title]);
const funded = (cards: readonly CrowdfundingCard[]) => cards.map((card) => [card.origin, card.code, card.contributed]);

function freeInputOf(set: CrowdfundingSet): FreeInputCard {
  if (set.freeInput === null) throw new Error("The question has no free input.");
  return set.freeInput;
}

describe("buildCrowdfundingCards", () => {
  it("shows the refuse card and one card per single-select title, coded 1..n, with amounts and deadlines per side", () => {
    const set = build({ rulingOptions: { type: "single-select", titles: ["Yes", "No"] }, currentRuling: 1n, contributions: { "1": 500n, "2": 3_000n } });
    expect(set).toEqual({
      cards: [
        {
          origin: "refuse",
          title: REFUSED_TITLE,
          code: 0n,
          isWinner: false,
          side: "loser",
          required: 3_000n,
          contributed: 0n,
          remaining: 3_000n,
          fundedPercent: 0,
          deadline: 250,
          fullyFunded: false,
        },
        {
          origin: "option",
          title: "Yes",
          code: 1n,
          isWinner: true,
          side: "winner",
          required: 2_000n,
          contributed: 500n,
          remaining: 1_500n,
          fundedPercent: 25,
          deadline: 500,
          fullyFunded: false,
        },
        {
          origin: "option",
          title: "No",
          code: 2n,
          isWinner: false,
          side: "loser",
          required: 3_000n,
          contributed: 3_000n,
          remaining: 0n,
          fundedPercent: 100,
          deadline: 250,
          fullyFunded: false,
        },
      ],
      freeInput: null,
      composer: null,
    });
  });

  it("never lets the remaining amount go below zero", () => {
    const [, yes] = build({ rulingOptions: { type: "single-select", titles: ["Yes", "No"] }, currentRuling: 1n, contributions: { "1": 2_500n } }).cards;
    expect(yes).toMatchObject({ contributed: 2_500n, remaining: 0n, fundedPercent: 125 });
  });

  it("makes the refuse card the winner when the ruling is 0", () => {
    const [refuse, yes] = build({ rulingOptions: { type: "single-select", titles: ["Yes", "No"] }, currentRuling: 0n }).cards;
    expect(refuse).toMatchObject({ code: 0n, isWinner: true, required: 2_000n, deadline: 500 });
    expect(yes).toMatchObject({ isWinner: false, required: 3_000n, deadline: 250 });
  });

  it("places reserved options after the refuse card, coded with their hex key", () => {
    const set = build({ rulingOptions: { type: "single-select", titles: ["Harris", "Trump"], reserved: { [`0x${"f".repeat(64)}`]: "Answered Too Soon" } }, currentRuling: 2n });
    expect(summary(set.cards)).toEqual([
      [0n, REFUSED_TITLE],
      [MAX_UINT, "Answered Too Soon"],
      [1n, "Harris"],
      [2n, "Trump"],
    ]);
    expect(set.cards[1]).toMatchObject({ origin: "reserved", isWinner: false, required: 3_000n });
  });

  it("skips a reserved key that is not hex instead of crashing", () => {
    const set = build({ rulingOptions: { type: "single-select", titles: ["Yes"], reserved: { soon: "Answered Too Soon" } }, currentRuling: 1n });
    expect(summary(set.cards)).toEqual([
      [0n, REFUSED_TITLE],
      [1n, "Yes"],
    ]);
  });

  it("hides option 0 on Unslashed", () => {
    const set = build({ rulingOptions: { type: "single-select", titles: ["Yes", "No"] }, currentRuling: 1n, unslashed: true });
    expect(summary(set.cards)).toEqual([
      [1n, "Yes"],
      [2n, "No"],
    ]);
  });

  it("gives every option the winner total and the full appeal period on Unslashed with ruling 0, marking none as the jury decision", () => {
    const set = build({ rulingOptions: { type: "single-select", titles: ["Yes", "No"] }, currentRuling: 0n, unslashed: true });
    for (const card of set.cards) expect(card).toMatchObject({ isWinner: false, side: "shared", required: 2_000n, deadline: 500 });
  });

  it("funds a new answer on winner terms when every option is a winner in a tie", () => {
    const set = build({ rulingOptions: { type: "uint", precision: 0 }, currentRuling: 0n, unslashed: true });
    expect(set.freeInput).toEqual({ type: "uint", precision: 0, side: "shared", required: 2_000n, deadline: 500 });
    expect(enteredAnswerFunding(set.cards, freeInputOf(set), 42n)).toMatchObject({ card: null, side: "shared", required: 2_000n, deadline: 500 });
    const composed = build({ rulingOptions: { type: "multiple-select", titles: ["A", "B", "C", "D", "E"] }, currentRuling: 0n, unslashed: true });
    expect(composed.composer).toEqual({ titles: ["A", "B", "C", "D", "E"], side: "shared", required: 2_000n, deadline: 500 });
  });

  it("names each card's side: the current ruling wins, the others lose, and in a tie Refuse to Arbitrate is the winner", () => {
    const sides = (currentRuling: bigint) => build({ rulingOptions: { type: "single-select", titles: ["Yes", "No"] }, currentRuling }).cards.map((card) => [card.code, card.side]);
    expect(sides(2n)).toEqual([
      [0n, "loser"],
      [1n, "loser"],
      [2n, "winner"],
    ]);
    expect(sides(0n)).toEqual([
      [0n, "winner"],
      [1n, "loser"],
      [2n, "loser"],
    ]);
  });

  it("shares every card's side in a governor tie", () => {
    const set = buildCrowdfundingCards({
      rulingOptions: { type: "single-select", titles: ["List 1", "List 2"] },
      fallbackOutcomes: null,
      currentRuling: 0n,
      amounts: { winner: AMOUNTS.winner, loser: AMOUNTS.winner },
      funding: funding(),
      override: undefined,
      tie: "shared-full-period",
    });
    expect(set.cards.map((card) => card.side)).toEqual(["shared", "shared", "shared"]);
  });

  it("marks a ruling the contract counts as fully funded, whatever today's total", () => {
    const set = build({ rulingOptions: { type: "single-select", titles: ["Yes", "No"] }, currentRuling: 1n, contributions: { "2": 2_400n }, fundedRulings: [2n] });
    expect(set.cards.find((card) => card.code === 2n)).toMatchObject({ fullyFunded: true, contributed: 2_400n, remaining: 0n, fundedPercent: 100 });
    expect(set.cards.find((card) => card.code === 1n)).toMatchObject({ fullyFunded: false });
  });

  it("shows the 2³ combinations of a 3-option multiple-select, coded combination + 1", () => {
    const titles = ["A", "B", "C"];
    const set = build({ rulingOptions: { type: "multiple-select", titles }, currentRuling: 4n, contributions: { "4": 1_000n } });
    expect(summary(set.cards)).toEqual([
      [0n, REFUSED_TITLE],
      [1n, "None"],
      [2n, "A"],
      [3n, "B"],
      [4n, "A, B"],
      [5n, "C"],
      [6n, "A, C"],
      [7n, "B, C"],
      [8n, "A, B, C"],
    ]);
    expect(set.cards.filter((card) => card.isWinner).map((card) => card.code)).toEqual([4n]);
    expect(set.cards.find((card) => card.code === 4n)).toMatchObject({ origin: "combination", required: 2_000n, contributed: 1_000n, fundedPercent: 50 });
    expect(set.composer).toBeNull();
  });

  it("still shows every combination and no composer for a 4-option multiple-select", () => {
    const set = build({ rulingOptions: { type: "multiple-select", titles: ["A", "B", "C", "D"] }, currentRuling: 1n });
    expect(set.cards).toHaveLength(1 + 16);
    expect(set.composer).toBeNull();
  });

  it("shows only the current ruling's and the contributed combinations of a 5-option multiple-select, plus a composer at the loser amount", () => {
    const titles = ["A", "B", "C", "D", "E"];
    const set = build({ rulingOptions: { type: "multiple-select", titles }, currentRuling: 6n, contributions: { "0": 7n, "3": 10n, "40": 5n } });
    expect(summary(set.cards)).toEqual([
      [0n, REFUSED_TITLE],
      [3n, "B"],
      [6n, "A, C"],
    ]);
    expect(set.cards[2]).toMatchObject({ origin: "combination", isWinner: true, required: 2_000n });
    expect(set.composer).toEqual({ titles, side: "loser", required: 3_000n, deadline: 250 });
    expect(set.freeInput).toBeNull();
  });

  it("uses the fallback outcomes for an unknown type, coded 1..n", () => {
    const set = build({ rulingOptions: { type: "bool" }, currentRuling: 2n, fallbackOutcomes: ["No", "Yes"] });
    expect(summary(set.cards)).toEqual([
      [0n, REFUSED_TITLE],
      [1n, "No"],
      [2n, "Yes"],
    ]);
    expect(set.cards[2]).toMatchObject({ origin: "option", isWinner: true });
  });

  it("falls back to Yes (1) and No (2) without fallback outcomes, also for a select without titles", () => {
    for (const rulingOptions of [{ type: "bool" }, { type: "single-select" }, { type: "multiple-select" }]) {
      expect(summary(build({ rulingOptions, currentRuling: 1n, fallbackOutcomes: [] }).cards)).toEqual([
        [0n, REFUSED_TITLE],
        [1n, "Yes"],
        [2n, "No"],
      ]);
    }
  });

  it("shows a uint question's contributed values, the current ruling at the winner amount and deadline, and a free input at the loser amount, with no Yes/No cards", () => {
    const rulingOptions: RulingOptions = { type: "uint", precision: 0 };
    const set = build({ rulingOptions, currentRuling: 9n, contributions: { "5": 100n, "9": 50n } });
    expect(set.cards).toEqual([
      {
        origin: "refuse",
        title: REFUSED_TITLE,
        code: 0n,
        isWinner: false,
        side: "loser",
        required: 3_000n,
        contributed: 0n,
        remaining: 3_000n,
        fundedPercent: 0,
        deadline: 250,
        fullyFunded: false,
      },
      {
        origin: "contributed-value",
        title: decodeRulingCode(5n, rulingOptions, null),
        code: 5n,
        isWinner: false,
        side: "loser",
        required: 3_000n,
        contributed: 100n,
        remaining: 2_900n,
        fundedPercent: 3.33,
        deadline: 250,
        fullyFunded: false,
      },
      {
        origin: "current-ruling",
        title: formatRuling(9n, rulingOptions, null),
        code: 9n,
        isWinner: true,
        side: "winner",
        required: 2_000n,
        contributed: 50n,
        remaining: 1_950n,
        fundedPercent: 2.5,
        deadline: 500,
        fullyFunded: false,
      },
    ]);
    expect(set.cards.map((card) => card.title)).toEqual([REFUSED_TITLE, "4", "8"]);
    expect(set.freeInput).toEqual({ type: "uint", precision: 0, side: "loser", required: 3_000n, deadline: 250 });
    expect(set.composer).toBeNull();
  });

  it("gives a variable question no current-ruling card when the ruling is 0", () => {
    const set = build({ rulingOptions: { type: "int" }, currentRuling: 0n });
    expect(set.cards.map((card) => card.origin)).toEqual(["refuse"]);
    expect(set.freeInput).toEqual({ type: "int", precision: undefined, side: "loser", required: 3_000n, deadline: 250 });
  });

  it("decodes string answers as UTF-8 and hash answers as code − 1 in 64 hex digits", () => {
    const hello = BigInt(stringToHex("hello"));
    const text = build({ rulingOptions: { type: "string" }, currentRuling: 0n, contributions: { [hello.toString()]: 1n } });
    expect(text.cards.find((card) => card.code === hello)?.title).toBe("hello");
    const hash = build({ rulingOptions: { type: "hash" }, currentRuling: 0n, contributions: { "255": 1n } });
    expect(hash.cards.find((card) => card.code === 255n)?.title).toBe(`0x${"0".repeat(62)}fe`);
  });

  it("a contribution to a large current ruling's exact code counts on that card, and one to the code below it gets its own loser card", () => {
    const rulingOptions: RulingOptions = { type: "uint", precision: 18 };
    const below = LARGE_UINT_CODE - 1n;
    const set = build({ rulingOptions, currentRuling: LARGE_UINT_CODE, contributions: { [LARGE_UINT_CODE.toString()]: 500n, [below.toString()]: 100n } });
    expect(funded(set.cards)).toEqual([
      ["refuse", 0n, 0n],
      ["contributed-value", below, 100n],
      ["current-ruling", LARGE_UINT_CODE, 500n],
    ]);
    expect(set.cards[1]).toMatchObject({ title: decodeRulingCode(below, rulingOptions, null), isWinner: false, required: 3_000n, remaining: 2_900n, deadline: 250 });
    expect(set.cards[2]).toMatchObject({ title: "1", isWinner: true, required: 2_000n, remaining: 1_500n, deadline: 500 });
  });

  it("Answered too soon as the current ruling makes its reserved card the winner at the winner amount and deadline, with no second card for it", () => {
    const questions: readonly RulingOptions[] = [
      { type: "single-select", titles: ["Yes", "No"], reserved: ANSWERED_TOO_SOON },
      { type: "uint", precision: 0, reserved: ANSWERED_TOO_SOON },
    ];
    for (const rulingOptions of questions) {
      const set = build({ rulingOptions, currentRuling: MAX_UINT });
      expect(set.cards.filter((card) => card.code === MAX_UINT)).toEqual([
        {
          origin: "reserved",
          title: "Answered Too Soon",
          code: MAX_UINT,
          isWinner: true,
          side: "winner",
          required: 2_000n,
          contributed: 0n,
          remaining: 2_000n,
          fundedPercent: 0,
          deadline: 500,
          fullyFunded: false,
        },
      ]);
      expect(set.cards.filter((card) => card.isWinner)).toHaveLength(1);
    }
  });

  it("a variable question's contributions to ruling 0 or a reserved code stay on those cards, never on a second card", () => {
    const rulingOptions: RulingOptions = { type: "uint", precision: 0, reserved: ANSWERED_TOO_SOON };
    const set = build({ rulingOptions, currentRuling: 5n, contributions: { "0": 10n, [MAX_UINT.toString()]: 20n } });
    expect(funded(set.cards)).toEqual([
      ["refuse", 0n, 10n],
      ["reserved", MAX_UINT, 20n],
      ["current-ruling", 5n, 0n],
    ]);
  });

  it("an entered answer that has a card takes that card's required, remaining, funded percent and deadline", () => {
    const set = build({ rulingOptions: { type: "uint", precision: 0 }, currentRuling: 9n, contributions: { "9": 500n, "5": 600n } });
    const freeInput = freeInputOf(set);
    const current = set.cards.find((card) => card.code === 9n);
    const contributed = set.cards.find((card) => card.code === 5n);
    expect(enteredAnswerFunding(set.cards, freeInput, 9n)).toEqual({
      card: current,
      side: "winner",
      required: 2_000n,
      contributed: 500n,
      remaining: 1_500n,
      fundedPercent: 25,
      deadline: 500,
      fullyFunded: false,
    });
    expect(enteredAnswerFunding(set.cards, freeInput, 5n)).toEqual({
      card: contributed,
      side: "loser",
      required: 3_000n,
      contributed: 600n,
      remaining: 2_400n,
      fundedPercent: 20,
      deadline: 250,
      fullyFunded: false,
    });
  });

  it("an entered answer without a card takes the entered card's total and deadline, nothing contributed", () => {
    const set = build({ rulingOptions: { type: "uint", precision: 0 }, currentRuling: 9n, contributions: { "5": 600n } });
    for (const code of [42n, null]) {
      expect(enteredAnswerFunding(set.cards, freeInputOf(set), code)).toEqual({
        card: null,
        side: "loser",
        required: 3_000n,
        contributed: 0n,
        remaining: 3_000n,
        fundedPercent: 0,
        deadline: 250,
        fullyFunded: false,
      });
    }
  });

  it("a 34-option multiple-select builds without a RangeError and shows only the refuse card, the current and contributed combinations, and a composer", () => {
    const titles = Array.from({ length: 34 }, (_, index) => `Option ${String(index + 1)}`);
    const lastOnly = (1n << 33n) + 1n;
    const everyOption = 1n << 34n;
    const set = build({
      rulingOptions: { type: "multiple-select", titles },
      currentRuling: lastOnly,
      contributions: { [everyOption.toString()]: 5n, [(everyOption + 1n).toString()]: 7n },
    });
    expect(summary(set.cards)).toEqual([
      [0n, REFUSED_TITLE],
      [lastOnly, "Option 34"],
      [everyOption, titles.join(", ")],
    ]);
    expect(set.cards[1]).toMatchObject({ isWinner: true, required: 2_000n, deadline: 500 });
    expect(set.cards[2]).toMatchObject({ isWinner: false, contributed: 5n, required: 3_000n, deadline: 250 });
    expect(set.composer).toEqual({ titles, side: "loser", required: 3_000n, deadline: 250 });
  });

  it("keeps a datetime question's reserved cards and adds the variable cards", () => {
    const set = build({ rulingOptions: { type: "datetime", reserved: { [`0x${"f".repeat(63)}e`]: "Answered Too Soon" } }, currentRuling: 1_700_000_001n });
    expect(set.cards.map((card) => card.origin)).toEqual(["refuse", "reserved", "current-ruling"]);
    expect(set.freeInput).toMatchObject({ type: "datetime" });
  });

  describe("reserved answers of a parsed meta-evidence", () => {
    function parsedOptions(rulingOptions: unknown): RulingOptions {
      const outcome = parseMetaEvidence({ title: "Title", rulingOptions });
      if (!outcome.ok || outcome.value.rulingOptions === null) throw new Error("expected ruling options");
      return outcome.value.rulingOptions;
    }

    const YES_NO_CARDS = [
      [0n, REFUSED_TITLE],
      [1n, "Yes"],
      [2n, "No"],
    ];

    it.each([
      [
        "a reserved answer on a code one of the titles already has gets no card, so the title's card is the only one sending that code",
        { type: "single-select", titles: ["Yes", "No"], reserved: { "0x1": "No" } },
        1n,
        YES_NO_CARDS,
      ],
      ["a reserved answer on code 0 gets no card beside the refuse card", { type: "single-select", titles: ["Yes", "No"], reserved: { "0x0": "No" } }, 1n, YES_NO_CARDS],
      [
        "a reserved answer on a multiple-select combination code gets no card, so the combination's title is the only one for that code",
        { type: "multiple-select", titles: ["A", "B"], reserved: { "0x3": "A" } },
        2n,
        [
          [0n, REFUSED_TITLE],
          [1n, "None"],
          [2n, "A"],
          [3n, "B"],
          [4n, "A, B"],
        ],
      ],
    ])("%s", (_, question, currentRuling, expected) => {
      expect(summary(build({ rulingOptions: parsedOptions(question), currentRuling }).cards)).toEqual(expected);
    });

    it("a uint question's Answered Too Soon keeps its card", () => {
      const set = build({ rulingOptions: parsedOptions({ type: "uint", precision: 0, reserved: ANSWERED_TOO_SOON }), currentRuling: 5n });
      expect(summary(set.cards)).toEqual([
        [0n, REFUSED_TITLE],
        [MAX_UINT, "Answered Too Soon"],
        [5n, "4"],
      ]);
    });

    it("a reserved code written in several spellings with one title funds one card, and with different titles none", () => {
      const oneTitle = build({
        rulingOptions: parsedOptions({ type: "single-select", titles: ["Yes", "No"], reserved: { "0x5": "Soon", "0x05": "Soon", "0X005": "Soon" } }),
        currentRuling: 1n,
      });
      expect(summary(oneTitle.cards)).toEqual([
        [0n, REFUSED_TITLE],
        [5n, "Soon"],
        [1n, "Yes"],
        [2n, "No"],
      ]);
      const differing = build({ rulingOptions: parsedOptions({ type: "uint", precision: 0, reserved: { "0x5": "Pay Alice", "0x05": "Pay Bob" } }), currentRuling: 1n });
      expect(differing.cards.filter((card) => card.code === 5n)).toEqual([]);
    });

    it("no two cards of a single-select or multiple-select send the same code, and every option card reads as the court reads its code", () => {
      const questions = [
        { type: "single-select", titles: ["Yes", "No"], reserved: { "0x1": "No", "0x2": "Yes", "0x7": "Soon", "0x07": "Soon", [`0x${"f".repeat(64)}`]: "Answered Too Soon" } },
        { type: "multiple-select", titles: ["A", "B", "C"], reserved: { "0x5": "A", "0x9": "Soon", "0x09": "Later", [`0x${"f".repeat(64)}`]: "Answered Too Soon" } },
      ];
      for (const question of questions) {
        const rulingOptions = parsedOptions(question);
        const { cards } = build({ rulingOptions, currentRuling: 1n });
        expect(new Set(cards.map((card) => card.code)).size).toBe(cards.length);
        for (const card of cards.filter((candidate) => candidate.origin === "option")) expect(card.title).toBe(formatRuling(card.code, rulingOptions, null));
      }
    });
  });
});

describe("cardFundingState", () => {
  it("funding is open before the deadline and closed from the deadline second on, as the contracts check strictly", () => {
    expect(cardFundingState({ deadline: 500, fullyFunded: false }, 499)).toBe("open");
    expect(cardFundingState({ deadline: 500, fullyFunded: false }, 500)).toBe("closed");
    expect(cardFundingState({ deadline: 500, fullyFunded: false }, 501)).toBe("closed");
  });

  it("a fully funded card is funded, before and after its deadline", () => {
    expect(cardFundingState({ deadline: 500, fullyFunded: true }, 100)).toBe("funded");
    expect(cardFundingState({ deadline: 500, fullyFunded: true }, 900)).toBe("funded");
  });
});
