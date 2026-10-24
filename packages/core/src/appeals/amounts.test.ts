import { describe, expect, it } from "vitest";
import type { AppealInfo } from "../disputes/types";
import { REGISTRY, getOverride } from "../registry";
import { GOVERNOR_MULTIPLIERS, recordedValue } from "./__fixtures__/governorMultipliers";
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

  it("charges a governor's shared side cost + cost × sharedMultiplier / denominator, due at the end of the appeal period", () => {
    const amounts = computeAppealAmounts({ appealCost: 1_000n, appealPeriodStart: 100, appealPeriodEnd: 300 }, { ...MULTIPLIERS, sharedMultiplier: 10_000n });
    expect(amounts.shared).toEqual({ total: 2_000n, deadline: 300 });
    expect(amounts.loser).toEqual({ total: 3_000n, deadline: 200 });
    expect(fundedPercent(2_000n, amounts.shared?.total ?? 0n)).toBe(100);
    expect(fundedPercent(2_000n, amounts.loser.total)).toBeCloseTo(66.66, 10);
  });

  it("costs a tie on every deployed governor's recorded multipliers at cost + cost × sharedMultiplier / MULTIPLIER_DIVISOR, due at the end of the appeal period", () => {
    for (const governor of GOVERNOR_MULTIPLIERS) {
      const denominator = recordedValue(governor, "MULTIPLIER_DIVISOR");
      const multipliers: Multipliers = {
        winnerStakeMultiplier: recordedValue(governor, "winnerMultiplier"),
        loserStakeMultiplier: recordedValue(governor, "loserMultiplier"),
        loserAppealPeriodMultiplier: denominator / 2n,
        denominator,
        sharedMultiplier: recordedValue(governor, "sharedMultiplier"),
      };
      const amounts = computeAppealAmounts(APPEAL_INFO, multipliers);
      const shared = recordedValue(governor, "sharedMultiplier");
      expect(amounts.shared, governor.label).toEqual({ total: 1_000_000n + (1_000_000n * shared) / denominator, deadline: 433_000 });
      expect(amounts.winner.total, governor.label).toBe(1_000_000n + (1_000_000n * recordedValue(governor, "winnerMultiplier")) / denominator);
      expect(amounts.loser.total, governor.label).toBe(1_000_000n + (1_000_000n * recordedValue(governor, "loserMultiplier")) / denominator);
      expect(amounts.loser.deadline, governor.label).toBe(1_000 + 216_000);
    }
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
    expect(UNSLASHED_OVERRIDE?.refuseToArbitrateFundable).toBe(false);
    expect(isWinningCode(1n, 0n, UNSLASHED_OVERRIDE)).toBe(true);
    expect(isWinningCode(2n, 0n, UNSLASHED_OVERRIDE)).toBe(true);
    expect(isWinningCode(1n, 2n, UNSLASHED_OVERRIDE)).toBe(false);
  });

  it("keeps the standard rule for an override without the refuse flag", () => {
    expect(isWinningCode(1n, 0n, { justification: "offset only", roundIndexOffset: 1 })).toBe(false);
  });
});

describe("fundedPercent", () => {
  it("computes contributed × 10000 / required / 100 with two decimals", () => {
    expect(fundedPercent(1n, 3n)).toBeCloseTo(33.33, 10);
    expect(fundedPercent(2n, 3n)).toBeCloseTo(66.66, 10);
    expect(fundedPercent(3n, 3n)).toBe(100);
    expect(fundedPercent(0n, 3n)).toBe(0);
  });

  it("is 0 when the required total is 0", () => {
    expect(fundedPercent(5n, 0n)).toBe(0);
  });

  it("reads above 100 when over-funded", () => {
    expect(fundedPercent(4n, 2n)).toBe(200);
  });

  it("is exact for wei amounts above 2^53", () => {
    expect(fundedPercent(1_234_567_890_123_456_789n, 2_469_135_780_246_913_578n)).toBe(50);
  });
});
