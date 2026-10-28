import { klerosLiquidAbi } from "../abi";
import { fail, readOutcome } from "../outcome";
import type { Outcome, ReadClient } from "../types";
import type { ArbitratorDispute, ArbitratedBinding, VoteCounter, ZeroRulingReason } from "./types";

/** `getVoteCounter` allocates one count per choice, so a dispute with more choices (Reality's) is never asked. */
const MAX_COUNTED_CHOICES = 256n;

/** Whether the period and the number of choices allow reading the last round's counter; the ruling must also be 0. */
export function readsVoteCounter(dispute: ArbitratorDispute): boolean {
  return dispute.period >= 3 && dispute.numberOfChoices <= MAX_COUNTED_CHOICES;
}

/**
 * Every round's counter starts tied with no votes, a vote for a choice above the current top clears the tie, and a vote
 * that equals it sets it again (KlerosLiquid `castVote`). So a tied counter with votes is a tie, without votes a round
 * nobody voted in, and an untied counter whose winner is 0 a majority for refusing.
 */
export function zeroRulingReason(counter: VoteCounter): ZeroRulingReason | null {
  if (counter.tied) return counter.counts.some((count) => count > 0n) ? "tie" : "no-votes";
  return counter.winningChoice === 0n ? "refused" : null;
}

/** The counter of `round`, its counts checked against the dispute's choices. Never rejects. */
export async function readVoteCounter(
  client: ReadClient,
  binding: ArbitratedBinding,
  dispute: ArbitratorDispute,
  round: bigint,
  signal: AbortSignal | undefined,
): Promise<Outcome<VoteCounter>> {
  const { arbitrator, disputeId, chainId } = binding;
  const read = await readOutcome(
    "the vote counts of the last round",
    chainId,
    () => client.readContract({ address: arbitrator, abi: klerosLiquidAbi, functionName: "getVoteCounter", args: [disputeId, round] }),
    signal,
  );
  if (!read.ok) return read;
  const [winningChoice, counts, tied] = read.value;
  if (BigInt(counts.length) !== dispute.numberOfChoices + 1n) return fail("invalid-data", "The vote counts do not match the dispute's number of choices.");
  return { ok: true, value: { winningChoice, counts, tied } };
}
