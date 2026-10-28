import type { AppealInfo } from "../disputes/types";
import type { BehaviorOverride } from "../registry/types";
import type { AppealAmounts, Multipliers } from "./types";

const PERCENT_SCALE = 10_000n;
const PERCENT_DIVISOR = 100;

/**
 * Required totals and deadlines of each side, in integer arithmetic as the contracts compute them, so the amounts match
 * what `fundAppeal` charges to the wei. The loser's deadline is `start + (end − start) × loserAppealPeriod /
 * denominator`, never later than the appeal period end: past it the court may close the period at any moment, so a later
 * bound some contracts would still accept is not one the page can promise. `shared` is what every governor list pays
 * when the current ruling is 0, as `KlerosGovernor.fundAppeal` charges it. `readMultipliers` never yields a zero
 * denominator.
 */
export function computeAppealAmounts(appealInfo: AppealInfo, multipliers: Multipliers): AppealAmounts {
  const { appealCost, appealPeriodStart, appealPeriodEnd } = appealInfo;
  const { winnerStakeMultiplier, loserStakeMultiplier, loserAppealPeriodMultiplier, denominator, sharedMultiplier } = multipliers;
  const start = BigInt(appealPeriodStart);
  const end = BigInt(appealPeriodEnd);
  const bound = start + ((end - start) * loserAppealPeriodMultiplier) / denominator;
  const loserDeadline = bound < end ? bound : end;
  return {
    winner: { total: appealCost + (appealCost * winnerStakeMultiplier) / denominator, deadline: appealPeriodEnd },
    loser: { total: appealCost + (appealCost * loserStakeMultiplier) / denominator, deadline: Number(loserDeadline) },
    ...(sharedMultiplier === undefined ? {} : { shared: { total: appealCost + (appealCost * sharedMultiplier) / denominator, deadline: appealPeriodEnd } }),
  };
}

/**
 * Whether a ruling code is costed and timed as the winner: it is the current ruling, or the current ruling is 0 on an
 * arbitrable whose option 0 is not fundable (Unslashed), which treats every option as a winner.
 */
export function isWinningCode(code: bigint, currentRuling: bigint, override: BehaviorOverride | undefined): boolean {
  return code === currentRuling || (currentRuling === 0n && override?.refuseToArbitrateFundable === false);
}

/** The losing side's window as a percentage of the appeal period, two decimals truncated, at most 100. */
export function windowPercent(multipliers: Multipliers): number {
  const { loserAppealPeriodMultiplier, denominator } = multipliers;
  const scaled = (loserAppealPeriodMultiplier * PERCENT_SCALE) / denominator;
  return Number(scaled < PERCENT_SCALE ? scaled : PERCENT_SCALE) / PERCENT_DIVISOR;
}

/** A percentage with two decimals, truncated rather than rounded; 0 when nothing is required. */
export function fundedPercent(contributed: bigint, required: bigint): number {
  if (required === 0n) return 0;
  return Number((contributed * PERCENT_SCALE) / required) / PERCENT_DIVISOR;
}
