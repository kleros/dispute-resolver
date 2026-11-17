import { describe, expect, it } from "vitest";
import type { AppealInfo } from "../disputes/types";
import { REGISTRY, getOverride } from "../registry";
import { DISPUTE_1170 } from "./__fixtures__/recorded";
import { computeAppealAmounts, fundedPercent, isWinningCode } from "./index";
import type { Multipliers } from "./types";

const UNSLASHED_OVERRIDE = getOverride(REGISTRY, 1, DISPUTE_1170.arbitrable);

const APPEAL_INFO: AppealInfo = { appealCost: 1_000_000n, appealPeriodStart: 1_000, appealPeriodEnd: 1_000 + 432_000 };
const MULTIPLIERS: Multipliers = { winnerStakeMultiplier: 10_000n, loserStakeMultiplier: 20_000n, loserAppealPeriodMultiplier: 5_000n, denominator: 10_000n };

describe("computeAppealAmounts", () => {
  it("charges the winner cost + cost × winnerStake / denominator, due at the end of the appeal period", () => {
    expect(computeAppealAmounts(APPEAL_INFO, MULTIPLIERS).winner).toEqual({ total: 2_000_000n, deadline: 433_000 });
  });

  it("charges the loser cost + cost × loserStake / denominator, due at start + (end − start) × loserAppealPeriod / denominator", () => {
    expect(computeAppealAmounts(APPEAL_INFO, MULTIPLIERS).loser).toEqual({ total: 3_000_000n, deadline: 1_000 + 216_000 });
  });

  it("rounds down with integer division, as the contracts do", () => {
    const amounts = computeAppealAmounts(
      { appealCost: 1_001n, appealPeriodStart: 10, appealPeriodEnd: 17 },
      { winnerStakeMultiplier: 5_000n, loserStakeMultiplier: 3_333n, loserAppealPeriodMultiplier: 3_333n, denominator: 10_000n },
    );
    expect(amounts.winner).toEqual({ total: 1_001n + 500n, deadline: 17 });
    expect(amounts.loser).toEqual({ total: 1_001n + 333n, deadline: 10 + 2 });
  });

  it("has no shared side without a shared multiplier", () => {
    expect(computeAppealAmounts(APPEAL_INFO, MULTIPLIERS)).not.toHaveProperty("shared");
  });

  it("costs a tie at cost + cost × sharedMultiplier / denominator, due at the end of the appeal period", () => {
    expect(computeAppealAmounts(APPEAL_INFO, { ...MULTIPLIERS, sharedMultiplier: 5_000n }).shared).toEqual({ total: 1_500_000n, deadline: 433_000 });
  });

  it("the losing side's deadline never passes the appeal period end", () => {
    const longWindow: Multipliers = { ...MULTIPLIERS, loserAppealPeriodMultiplier: 20_000n };
    expect(computeAppealAmounts(APPEAL_INFO, longWindow).loser.deadline).toBe(APPEAL_INFO.appealPeriodEnd);
    const wholeWindow: Multipliers = { ...MULTIPLIERS, loserAppealPeriodMultiplier: 10_000n };
    expect(computeAppealAmounts(APPEAL_INFO, wholeWindow).loser.deadline).toBe(APPEAL_INFO.appealPeriodEnd);
  });

  it("keeps wei amounts above 2^53 exact", () => {
    const cost = 2_250_000_000_000_000_000n;
    const amounts = computeAppealAmounts({ appealCost: cost, appealPeriodStart: 0, appealPeriodEnd: 100 }, MULTIPLIERS);
    expect(amounts.winner.total).toBe(4_500_000_000_000_000_000n);
    expect(amounts.loser.total).toBe(6_750_000_000_000_000_000n);
  });
});

describe("isWinningCode", () => {
  it("treats the code equal to the current ruling as the winner", () => {
    expect(isWinningCode(2n, 2n, undefined)).toBe(true);
    expect(isWinningCode(1n, 2n, undefined)).toBe(false);
    expect(isWinningCode(0n, 0n, undefined)).toBe(true);
    expect(isWinningCode(1n, 0n, undefined)).toBe(false);
  });

  it("costs every option as a winner on Unslashed with ruling 0", () => {
    expect(isWinningCode(1n, 0n, UNSLASHED_OVERRIDE)).toBe(true);
    expect(isWinningCode(2n, 0n, UNSLASHED_OVERRIDE)).toBe(true);
    expect(isWinningCode(1n, 2n, UNSLASHED_OVERRIDE)).toBe(false);
  });

  it("keeps the standard rule for an override without the refuse flag", () => {
    expect(isWinningCode(1n, 0n, { justification: "offset only", roundIndexOffset: 1 })).toBe(false);
  });
});

describe("fundedPercent", () => {
  it.each([
    ["computes contributed × 10000 / required / 100 with two decimals (2 of 3)", 2n, 3n, 66.66],
    ["is 100 when fully funded", 3n, 3n, 100],
    ["is 0 when nothing is contributed", 0n, 3n, 0],
    ["is 0 when the required total is 0", 5n, 0n, 0],
    ["reads above 100 when over-funded", 4n, 2n, 200],
    ["is exact for wei amounts above 2^53", 1_234_567_890_123_456_789n, 2_469_135_780_246_913_578n, 50],
  ])("%s", (_, contributed, required, expected) => {
    expect(fundedPercent(contributed, required)).toBeCloseTo(expected, 10);
  });
});
