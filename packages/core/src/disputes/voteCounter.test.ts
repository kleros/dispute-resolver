import { describe, expect, it } from "vitest";
import { lookupDispute, readDisputeDetails, zeroRulingReason } from ".";
import type { VoteCounter } from "./types";
import { EXECUTION_GNOSIS, EXECUTION_MAINNET, executionNode, fakeClient } from "../test/disputes/testHelpers";
import type { ExecutionRecording } from "../test/disputes/testHelpers";

async function recordedCounter(recording: ExecutionRecording, disputeId: bigint): Promise<VoteCounter> {
  const { client } = fakeClient(executionNode(recording));
  const lookup = await lookupDispute({ chainId: recording.chainId, client }, disputeId);
  if (lookup.status !== "found") throw new Error(`dispute ${String(disputeId)} not found`);
  const reads = await readDisputeDetails({ chainId: recording.chainId, client }, lookup, undefined, null);
  if (reads.lastRoundVotes?.ok !== true) throw new Error(`no vote counter for dispute ${String(disputeId)}`);
  return reads.lastRoundVotes.value;
}

describe("zeroRulingReason", () => {
  it.each([
    ["a three-way tie", EXECUTION_MAINNET, 1495n],
    ["a tie with one juror absent", EXECUTION_MAINNET, 1530n],
    ["a tie in an appeal round", EXECUTION_GNOSIS, 939n],
  ])("classifies a tied vote: %s", async (_, recording, disputeId) => {
    expect(zeroRulingReason(await recordedCounter(recording, disputeId))).toBe("tie");
  });

  it("classifies a round without votes", async () => {
    expect(zeroRulingReason(await recordedCounter(EXECUTION_MAINNET, 108n))).toBe("no-votes");
  });

  it.each([
    ["every juror who voted chose it", 1684n],
    ["a majority chose it", 199n],
  ])("classifies a majority to refuse: %s", async (_, disputeId) => {
    expect(zeroRulingReason(await recordedCounter(EXECUTION_MAINNET, disputeId))).toBe("refused");
  });

  it("gives no reason for a counter whose winner is an option", () => {
    expect(zeroRulingReason({ winningChoice: 1n, counts: [0n, 2n, 1n], tied: false })).toBeNull();
  });
});
