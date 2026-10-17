import type { Abi } from "viem";
import { governorAbi } from "../abi";
import type { Address, ReadClient } from "../types";

/**
 * `sessions(uint256)`, the public getter of the governor's `Session` struct (its arrays and mapping omitted). The
 * `abi` module does not embed it; `governor.test.ts` pins it to the `@kleros/kleros` artifact and to the verified ABIs
 * of the four deployed governors, which share this layout.
 */
export const governorSessionAbi = [
  {
    type: "function",
    name: "sessions",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [
      { name: "ruling", type: "uint256" },
      { name: "disputeID", type: "uint256" },
      { name: "sumDeposit", type: "uint256" },
      { name: "status", type: "uint8" },
      { name: "durationOffset", type: "uint256" },
    ],
  },
] as const satisfies Abi;

/** `Session.status` once the arbitrator's ruling is executed: `withdrawFeesAndRewards` requires it (verified source). */
const SESSION_RESOLVED = 2;

/** The parts of `sessions(session)` the withdraw read needs. */
export interface GovernorSession {
  /**
   * The ruling the governor settled on (D-47): the jury's, unless exactly one list fully funded the final round, which
   * then wins as the governor's shadow winner (`rule()` executes `shadowWinner + 1`, verified source).
   */
  readonly ruling: bigint;
  readonly disputeId: bigint;
  readonly resolved: boolean;
}

/** One session of the governor. Rejects on a failed read. */
export async function readGovernorSession(client: ReadClient, governor: Address, session: bigint): Promise<GovernorSession> {
  const [ruling, disputeId, , status] = await client.readContract({ address: governor, abi: governorSessionAbi, functionName: "sessions", args: [session] });
  return { ruling, disputeId, resolved: status === SESSION_RESOLVED };
}

/** `getRoundInfo(session, round)`: per list index, the fees paid and whether the side is fully paid. */
export interface GovernorRound {
  readonly paidFees: readonly bigint[];
  readonly hasPaid: readonly boolean[];
  readonly feeRewards: bigint;
  readonly successfullyPaid: bigint;
}

/** One round of a governor session. Rejects on a failed read, including a round the session does not have. */
export async function readGovernorRound(client: ReadClient, governor: Address, session: bigint, round: bigint): Promise<GovernorRound> {
  const [paidFees, hasPaid, feeRewards, successfullyPaid] = await client.readContract({
    address: governor,
    abi: governorAbi,
    functionName: "getRoundInfo",
    args: [session, round],
  });
  return { paidFees, hasPaid, feeRewards, successfullyPaid };
}

/** `getContributions(session, round, contributor)`: what the contributor still has in each list index. */
export function readGovernorContributions(client: ReadClient, governor: Address, session: bigint, round: bigint, contributor: Address): Promise<readonly bigint[]> {
  return client.readContract({ address: governor, abi: governorAbi, functionName: "getContributions", args: [session, round, contributor] });
}

/** A ruling as the governor numbers lists (verified source): ruling r is list index r − 1; ruling 0 names no list. */
export function governorListIndex(ruling: bigint): bigint | null {
  return ruling >= 1n ? ruling - 1n : null;
}

/** The list index of `ruling` among the round's `lists`, or `null` when it names none of them. */
function rulingListIndex(ruling: bigint, lists: number): number | null {
  const listIndex = governorListIndex(ruling);
  return listIndex !== null && listIndex < BigInt(lists) ? Number(listIndex) : null;
}

/**
 * What `withdrawFeesAndRewards(beneficiary, session, round, listIndex)` pays for one contribution, as the verified
 * governor source computes it once the session is resolved with its settled `ruling` (D-47), the same for every round:
 * an unfunded side is refunded; when the ruling is 0 or the winner's side was not fully paid, every paid side shares the fee rewards in proportion to the
 * successfully paid fees; otherwise the winner's contributors share them in proportion to the winner's paid fees, and
 * a fully paid losing side gets nothing.
 */
export function governorReward(round: GovernorRound, contribution: bigint, listIndex: number, ruling: bigint): bigint {
  if (round.hasPaid[listIndex] !== true) return contribution;
  const winner = rulingListIndex(ruling, round.hasPaid.length);
  if (winner === null || round.hasPaid[winner] !== true) {
    return round.successfullyPaid > 0n ? (contribution * round.feeRewards) / round.successfullyPaid : 0n;
  }
  if (winner !== listIndex) return 0n;
  const paidFees = round.paidFees[listIndex] ?? 0n;
  return paidFees > 0n ? (contribution * round.feeRewards) / paidFees : 0n;
}
