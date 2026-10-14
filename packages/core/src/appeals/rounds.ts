import type { AppealDecisionEvent } from "../disputes/types";
import type { BehaviorOverride } from "../registry/types";
import type { Period } from "../types";

function roundOffset(override: BehaviorOverride | undefined): bigint {
  return BigInt(override?.roundIndexOffset ?? 0);
}

/**
 * The round funded now (D-30): the number of `AppealDecision` events plus the arbitrable's round offset, in every period
 * and for both `Contribution` and `RulingFunded`. Unslashed's offset is 1: it opens its first funding round at dispute
 * creation, after a pre-dispute round 0.
 */
export function fundingRound(appealCount: number, override: BehaviorOverride | undefined): bigint {
  return BigInt(appealCount) + roundOffset(override);
}

/**
 * The rounds whose funding a period needs (D-30): the funding round in the appeal period; in execution every round from
 * the offset to the funding round inclusive, the last because it can hold one-sided funding (golden 1678). Before the
 * appeal period no round is scanned.
 */
export function roundsToScan(period: Period, appealCount: number, override: BehaviorOverride | undefined): readonly bigint[] {
  const last = fundingRound(appealCount, override);
  if (period === 3) return [last];
  if (period !== 4) return [];
  const rounds: bigint[] = [];
  for (let round = roundOffset(override); round <= last; round += 1n) rounds.push(round);
  return rounds;
}

/**
 * The block a round's funding scan starts at (D-02): round `offset + k` at the k-th `AppealDecision` (k ≥ 1), round
 * `offset` at the Dispute event. A round before the offset starts at the Dispute event too, and a round past the known
 * decisions at the last one, so the scan covers more blocks, never fewer; events are filtered by round, so the extra
 * blocks cannot add another round's funding.
 */
export function roundStartBlock(round: bigint, appealDecisions: readonly AppealDecisionEvent[], override: BehaviorOverride | undefined, disputeStartBlock: bigint): bigint {
  const k = round - roundOffset(override);
  if (k <= 0n || appealDecisions.length === 0) return disputeStartBlock;
  const index = k > BigInt(appealDecisions.length) ? appealDecisions.length - 1 : Number(k) - 1;
  return appealDecisions[index]?.blockNumber ?? disputeStartBlock;
}
