import { stringToHex } from "viem";
import { describe, expect, it } from "vitest";
import { REGISTRY, getOverride } from "../registry";
import { combinationTitle, decodeRulingCode, formatRuling } from "../rulings";
import type { FallbackOutcomes, RulingOptions } from "../rulings/types";
import { UNSLASHED } from "./__fixtures__/recorded";
import { buildCrowdfundingCards } from "./index";
import type { AppealAmounts, CrowdfundingCard, RoundFunding } from "./types";

const UNSLASHED_OVERRIDE = getOverride(REGISTRY, 1, UNSLASHED.arbitrable);
const AMOUNTS: AppealAmounts = { winner: { total: 2_000n, deadline: 500 }, loser: { total: 3_000n, deadline: 250 } };
const REFUSED_TITLE = "Invalid / Refused to Arbitrate / Tied";
const MAX_UINT = 2n ** 256n - 1n;

function funding(contributions: Readonly<Record<string, bigint>> = {}): RoundFunding {
  return { round: 0n, contributions: Object.entries(contributions).map(([ruling, amount]) => ({ ruling: BigInt(ruling), amount })), fundedRulings: [] };
}

function build(input: {
  readonly rulingOptions: RulingOptions;
  readonly currentRuling: bigint;
  readonly contributions?: Readonly<Record<string, bigint>>;
  readonly fallbackOutcomes?: FallbackOutcomes;
  readonly unslashed?: boolean;
}) {
  return buildCrowdfundingCards({
    rulingOptions: input.rulingOptions,
    fallbackOutcomes: input.fallbackOutcomes ?? null,
    currentRuling: input.currentRuling,
    amounts: AMOUNTS,
    funding: funding(input.contributions),
    override: input.unslashed === true ? UNSLASHED_OVERRIDE : undefined,
  });
}

const summary = (cards: readonly CrowdfundingCard[]) => cards.map((card) => [card.code, card.title]);

describe("buildCrowdfundingCards", () => {
  it("§5.12: single-select shows the refuse card and one card per title, coded 1..n, with amounts and deadlines per side", () => {
    const set = build({ rulingOptions: { type: "single-select", titles: ["Yes", "No"] }, currentRuling: 1n, contributions: { "1": 500n, "2": 3_000n } });
    expect(set).toEqual({
      cards: [
        { origin: "refuse", title: REFUSED_TITLE, code: 0n, isWinner: false, required: 3_000n, contributed: 0n, remaining: 3_000n, fundedPercent: 0, deadline: 250 },
        { origin: "option", title: "Yes", code: 1n, isWinner: true, required: 2_000n, contributed: 500n, remaining: 1_500n, fundedPercent: 25, deadline: 500 },
        { origin: "option", title: "No", code: 2n, isWinner: false, required: 3_000n, contributed: 3_000n, remaining: 0n, fundedPercent: 100, deadline: 250 },
      ],
      freeInput: null,
      composer: null,
    });
  });

  it("§5.12: the remaining amount never goes below zero", () => {
    const [, yes] = build({ rulingOptions: { type: "single-select", titles: ["Yes", "No"] }, currentRuling: 1n, contributions: { "1": 2_500n } }).cards;
    expect(yes).toMatchObject({ contributed: 2_500n, remaining: 0n, fundedPercent: 125 });
  });

  it("§5.12: ruling 0 makes the refuse card the winner", () => {
    const [refuse, yes] = build({ rulingOptions: { type: "single-select", titles: ["Yes", "No"] }, currentRuling: 0n }).cards;
    expect(refuse).toMatchObject({ code: 0n, isWinner: true, required: 2_000n, deadline: 500 });
    expect(yes).toMatchObject({ isWinner: false, required: 3_000n, deadline: 250 });
  });

  it("§5.12: reserved options follow the refuse card, coded with their hex key", () => {
    const set = build({ rulingOptions: { type: "single-select", titles: ["Harris", "Trump"], reserved: { [`0x${"f".repeat(64)}`]: "Answered Too Soon" } }, currentRuling: 2n });
    expect(summary(set.cards)).toEqual([
      [0n, REFUSED_TITLE],
      [MAX_UINT, "Answered Too Soon"],
      [1n, "Harris"],
      [2n, "Trump"],
    ]);
    expect(set.cards[1]).toMatchObject({ origin: "reserved", isWinner: false, required: 3_000n });
  });

  it("D-36: a reserved key that is not hex is skipped instead of crashing", () => {
    const set = build({ rulingOptions: { type: "single-select", titles: ["Yes"], reserved: { soon: "Answered Too Soon" } }, currentRuling: 1n });
    expect(summary(set.cards)).toEqual([
      [0n, REFUSED_TITLE],
      [1n, "Yes"],
    ]);
  });

  it("§10.1: Unslashed hides option 0", () => {
    const set = build({ rulingOptions: { type: "single-select", titles: ["Yes", "No"] }, currentRuling: 1n, unslashed: true });
    expect(summary(set.cards)).toEqual([
      [1n, "Yes"],
      [2n, "No"],
    ]);
  });

  it("§10.1: on Unslashed with ruling 0 every option takes the winner total and the full appeal period, and none is marked as the jury decision", () => {
    const set = build({ rulingOptions: { type: "single-select", titles: ["Yes", "No"] }, currentRuling: 0n, unslashed: true });
    for (const card of set.cards) expect(card).toMatchObject({ isWinner: false, required: 2_000n, deadline: 500 });
  });

  it("§5.12: multiple-select with 3 options shows the 2³ combinations, coded combination + 1", () => {
    const titles = ["A", "B", "C"];
    const set = build({ rulingOptions: { type: "multiple-select", titles }, currentRuling: 4n, contributions: { "4": 1_000n } });
    expect(summary(set.cards)).toEqual([
      [0n, REFUSED_TITLE],
      [1n, "None"],
      [2n, "A"],
      [3n, "B"],
      [4n, "A B"],
      [5n, "C"],
      [6n, "A C"],
      [7n, "B C"],
      [8n, "A B C"],
    ]);
    expect(set.cards.filter((card) => card.isWinner).map((card) => card.code)).toEqual([4n]);
    expect(set.cards.find((card) => card.code === 4n)).toMatchObject({ origin: "combination", required: 2_000n, contributed: 1_000n, fundedPercent: 50 });
    expect(set.composer).toBeNull();
  });

  it("D-33: multiple-select with 4 options still shows every combination and no composer", () => {
    const set = build({ rulingOptions: { type: "multiple-select", titles: ["A", "B", "C", "D"] }, currentRuling: 1n });
    expect(set.cards).toHaveLength(1 + 16);
    expect(set.composer).toBeNull();
  });

  it("D-33: multiple-select with 5 options shows only the current ruling's and the contributed combinations, plus a composer at the loser amount", () => {
    const titles = ["A", "B", "C", "D", "E"];
    const set = build({ rulingOptions: { type: "multiple-select", titles }, currentRuling: 6n, contributions: { "0": 7n, "3": 10n, "40": 5n } });
    expect(summary(set.cards)).toEqual([
      [0n, REFUSED_TITLE],
      [3n, "B"],
      [6n, "A C"],
    ]);
    expect(set.cards[2]).toMatchObject({ origin: "combination", isWinner: true, required: 2_000n });
    expect(set.composer).toEqual({ titles, required: 3_000n, deadline: 250 });
    expect(set.freeInput).toBeNull();
  });

  it("D-33: multiple-select with 9 options never enumerates its 512 combinations", () => {
    const titles = ["A", "B", "C", "D", "E", "F", "G", "H", "I"];
    const set = build({ rulingOptions: { type: "multiple-select", titles }, currentRuling: 1n });
    expect(summary(set.cards)).toEqual([
      [0n, REFUSED_TITLE],
      [1n, combinationTitle(0n, titles)],
    ]);
    expect(set.composer).toEqual({ titles, required: 3_000n, deadline: 250 });
  });

  it("§5.12 item 5: an unknown type uses the fallback outcomes, coded 1..n", () => {
    const set = build({ rulingOptions: { type: "bool" }, currentRuling: 2n, fallbackOutcomes: ["No", "Yes"] });
    expect(summary(set.cards)).toEqual([
      [0n, REFUSED_TITLE],
      [1n, "No"],
      [2n, "Yes"],
    ]);
    expect(set.cards[2]).toMatchObject({ origin: "option", isWinner: true });
  });

  it("§5.12 item 5: without fallback outcomes the cards are Yes (1) and No (2), also for a select without titles", () => {
    for (const rulingOptions of [{ type: "bool" }, { type: "single-select" }, { type: "multiple-select" }]) {
      expect(summary(build({ rulingOptions, currentRuling: 1n, fallbackOutcomes: [] }).cards)).toEqual([
        [0n, REFUSED_TITLE],
        [1n, "Yes"],
        [2n, "No"],
      ]);
    }
  });

  it("D-04: a uint question shows contributed values, the current ruling at the winner amount and deadline, and a free input at the loser amount, and no Yes/No cards", () => {
    const rulingOptions: RulingOptions = { type: "uint", precision: 0 };
    const set = build({ rulingOptions, currentRuling: 9n, contributions: { "5": 100n, "9": 50n } });
    expect(set.cards).toEqual([
      { origin: "refuse", title: REFUSED_TITLE, code: 0n, isWinner: false, required: 3_000n, contributed: 0n, remaining: 3_000n, fundedPercent: 0, deadline: 250 },
      {
        origin: "contributed-value",
        title: decodeRulingCode(5n, rulingOptions, null),
        code: 5n,
        isWinner: false,
        required: 3_000n,
        contributed: 100n,
        remaining: 2_900n,
        fundedPercent: 3.33,
        deadline: 250,
      },
      {
        origin: "current-ruling",
        title: formatRuling(9n, rulingOptions, null),
        code: 9n,
        isWinner: true,
        required: 2_000n,
        contributed: 50n,
        remaining: 1_950n,
        fundedPercent: 2.5,
        deadline: 500,
      },
    ]);
    expect(set.cards.map((card) => card.title)).toEqual([REFUSED_TITLE, "4", "8"]);
    expect(set.freeInput).toEqual({ type: "uint", precision: 0, required: 3_000n, deadline: 250 });
    expect(set.composer).toBeNull();
  });

  it("D-04: with ruling 0 a variable question has no current-ruling card", () => {
    const set = build({ rulingOptions: { type: "int" }, currentRuling: 0n });
    expect(set.cards.map((card) => card.origin)).toEqual(["refuse"]);
    expect(set.freeInput).toEqual({ type: "int", precision: undefined, required: 3_000n, deadline: 250 });
  });

  it("§5.12 item 6: string answers are decoded as UTF-8, hash answers as 64 hex digits", () => {
    const hello = BigInt(stringToHex("hello"));
    const text = build({ rulingOptions: { type: "string" }, currentRuling: 0n, contributions: { [hello.toString()]: 1n } });
    expect(text.cards.find((card) => card.code === hello)?.title).toBe("hello");
    const hash = build({ rulingOptions: { type: "hash" }, currentRuling: 0n, contributions: { "255": 1n } });
    expect(hash.cards.find((card) => card.code === 255n)?.title).toBe(`0x${"0".repeat(62)}ff`);
  });

  it("§5.12 item 6: a datetime question keeps its reserved cards and adds the variable cards", () => {
    const set = build({ rulingOptions: { type: "datetime", reserved: { [`0x${"f".repeat(63)}e`]: "Answered Too Soon" } }, currentRuling: 1_700_000_001n });
    expect(set.cards.map((card) => card.origin)).toEqual(["refuse", "reserved", "current-ruling"]);
    expect(set.freeInput).toMatchObject({ type: "datetime" });
  });

  it("D-54: the suggested amount follows refreshed funding", () => {
    const rulingOptions: RulingOptions = { type: "single-select", titles: ["Yes", "No"] };
    const before = build({ rulingOptions, currentRuling: 1n, contributions: { "2": 1_000n } });
    const after = build({ rulingOptions, currentRuling: 1n, contributions: { "2": 2_500n } });
    expect(before.cards[2]?.remaining).toBe(2_000n);
    expect(after.cards[2]?.remaining).toBe(500n);
  });
});
