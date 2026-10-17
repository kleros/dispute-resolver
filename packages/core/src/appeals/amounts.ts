import type { AppealInfo } from "../disputes/types";
import type { BehaviorOverride } from "../registry/types";
import type { AppealAmounts, Multipliers } from "./types";

const PERCENT_SCALE = 10_000n;
const PERCENT_DIVISOR = 100;

/**
 * Required totals and deadlines of each side (spec 5.12), in integer arithmetic as the contracts compute them. The
 * winner pays `cost + cost × winnerStake / denominator` until the end of the appeal period; the loser pays
 * `cost + cost × loserStake / denominator` until `start + (end − start) × loserAppealPeriod / denominator`. With a
 * governor's `sharedMultiplier` (P-05), `shared` is what every list pays when the current ruling is 0:
 * `cost + cost × sharedMultiplier / denominator` until the end of the appeal period, as `KlerosGovernor.fundAppeal`
 * charges it. `readMultipliers` never yields a zero denominator.
 */
export function computeAppealAmounts(appealInfo: AppealInfo, multipliers: Multipliers): AppealAmounts {
  const { appealCost, appealPeriodStart, appealPeriodEnd } = appealInfo;
  const { winnerStakeMultiplier, loserStakeMultiplier, loserAppealPeriodMultiplier, denominator, sharedMultiplier } = multipliers;
  const start = BigInt(appealPeriodStart);
  const loserDeadline = start + ((BigInt(appealPeriodEnd) - start) * loserAppealPeriodMultiplier) / denominator;
  return {
    winner: { total: appealCost + (appealCost * winnerStakeMultiplier) / denominator, deadline: appealPeriodEnd },
    loser: { total: appealCost + (appealCost * loserStakeMultiplier) / denominator, deadline: Number(loserDeadline) },
    ...(sharedMultiplier === undefined ? {} : { shared: { total: appealCost + (appealCost * sharedMultiplier) / denominator, deadline: appealPeriodEnd } }),
  };
}

/**
 * Whether a ruling code is costed and timed as the winner (spec 10.1): it is the current ruling, or the current ruling
 * is 0 on an arbitrable whose option 0 is not fundable (Unslashed), which treats every option as a winner.
 */
export function isWinningCode(code: bigint, currentRuling: bigint, override: BehaviorOverride | undefined): boolean {
  return code === currentRuling || (currentRuling === 0n && override?.refuseToArbitrateFundable === false);
}

/** `contributed × 10000 / required / 100`: a percentage with two decimals, 0 when nothing is required (spec 5.12). */
export function fundedPercent(contributed: bigint, required: bigint): number {
  if (required === 0n) return 0;
  return Number((contributed * PERCENT_SCALE) / required) / PERCENT_DIVISOR;
}
