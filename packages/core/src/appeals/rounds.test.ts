import { describe, expect, it } from "vitest";
import { REGISTRY, getOverride } from "../registry";
import type { BehaviorOverride } from "../registry/types";
import { DISPUTE_1170, UNSLASHED } from "./__fixtures__/recorded";
import { fundingRound, roundStartBlock, roundsToScan } from "./index";

const UNSLASHED_OVERRIDE: BehaviorOverride | undefined = getOverride(REGISTRY, 1, DISPUTE_1170.arbitrable);

/** Appeal decisions strictly before a log, in `(blockNumber, logIndex)` order. */
function appealsBefore(position: { readonly blockNumber: bigint; readonly logIndex: number }): number {
  return DISPUTE_1170.appealDecisionPositions.filter(
    (decision) => decision.blockNumber < position.blockNumber || (decision.blockNumber === position.blockNumber && decision.logIndex < position.logIndex),
  ).length;
}

describe("fundingRound", () => {
  it("D-30: the registry's Unslashed override carries the round offset", () => {
    expect(UNSLASHED_OVERRIDE?.roundIndexOffset).toBe(1);
  });

  it("D-30: the funding round is the appeal count plus the offset", () => {
    expect(fundingRound(5, UNSLASHED_OVERRIDE)).toBe(6n);
    expect(fundingRound(0, UNSLASHED_OVERRIDE)).toBe(1n);
    expect(fundingRound(5, undefined)).toBe(5n);
    expect(fundingRound(0, undefined)).toBe(0n);
  });

  it("D-30: an override without an offset leaves the round unshifted", () => {
    expect(fundingRound(3, { justification: "test override without offset" })).toBe(3n);
  });

  it("D-30: every recorded Contribution and RulingFunded event of dispute 1170 is in round appeals-before + 1", () => {
    expect(DISPUTE_1170.fundingEvents).toHaveLength(27);
    expect(DISPUTE_1170.appealDecisions).toHaveLength(5);
    for (const event of DISPUTE_1170.fundingEvents) {
      expect({ ...event, round: fundingRound(appealsBefore(event), UNSLASHED_OVERRIDE) }).toEqual(event);
    }
    expect(new Set(DISPUTE_1170.fundingEvents.map((event) => event.type))).toEqual(new Set(["Contribution", "RulingFunded"]));
  });
});

describe("roundsToScan", () => {
  it("D-30: the appeal period scans the funding round only", () => {
    expect(roundsToScan(3, 5, UNSLASHED_OVERRIDE)).toEqual([6n]);
    expect(roundsToScan(3, 2, undefined)).toEqual([2n]);
    expect(roundsToScan(3, 0, undefined)).toEqual([0n]);
  });

  it("D-30: execution scans Unslashed rounds 1 to appealCount + 1, the last one included", () => {
    expect(roundsToScan(4, 5, UNSLASHED_OVERRIDE)).toEqual([1n, 2n, 3n, 4n, 5n, 6n]);
    const scanned = new Set(roundsToScan(4, DISPUTE_1170.appealDecisions.length, UNSLASHED_OVERRIDE));
    for (const event of DISPUTE_1170.fundingEvents) expect(scanned.has(event.round)).toBe(true);
  });

  it("D-30: execution scans standard rounds 0 to appealCount", () => {
    expect(roundsToScan(4, 2, undefined)).toEqual([0n, 1n, 2n]);
    expect(roundsToScan(4, 0, undefined)).toEqual([0n]);
  });

  it("D-30: mainnet 1678 (no appeal) scans round 1, where its contribution sits, not round 0", () => {
    const { appealDecisions } = UNSLASHED.dispute1678;
    expect(appealDecisions).toHaveLength(0);
    expect(roundsToScan(4, appealDecisions.length, UNSLASHED_OVERRIDE)).toEqual([1n]);
  });

  it("D-30: mainnet 1226 (one appeal) scans rounds 1 and 2", () => {
    expect(roundsToScan(4, UNSLASHED.dispute1226.appealDecisions.length, UNSLASHED_OVERRIDE)).toEqual([1n, 2n]);
  });

  it("§5.11: periods before the appeal period scan nothing", () => {
    for (const period of [0, 1, 2] as const) expect(roundsToScan(period, 3, undefined)).toEqual([]);
  });
});

describe("roundStartBlock", () => {
  const { appealDecisions, disputeStartBlock } = DISPUTE_1170;

  it("D-02: the first funding round starts at the Dispute event block", () => {
    expect(roundStartBlock(1n, appealDecisions, UNSLASHED_OVERRIDE, disputeStartBlock)).toBe(14_578_743n);
    expect(roundStartBlock(0n, appealDecisions, undefined, 777n)).toBe(777n);
  });

  it("D-02: round offset + k starts at the k-th appeal decision", () => {
    const starts = [2n, 3n, 4n, 5n, 6n].map((round) => roundStartBlock(round, appealDecisions, UNSLASHED_OVERRIDE, disputeStartBlock));
    expect(starts).toEqual([14_640_476n, 14_694_467n, 14_726_733n, 14_795_056n, 14_866_053n]);
    expect(roundStartBlock(2n, appealDecisions, undefined, disputeStartBlock)).toBe(14_694_467n);
  });

  it("D-02, D-30: every recorded funding event of dispute 1170 is at or after its round's start block", () => {
    for (const event of DISPUTE_1170.fundingEvents) {
      expect(event.blockNumber).toBeGreaterThanOrEqual(roundStartBlock(event.round, appealDecisions, UNSLASHED_OVERRIDE, disputeStartBlock));
    }
  });

  it("D-02: a round before the offset starts at the Dispute event block", () => {
    expect(roundStartBlock(0n, appealDecisions, UNSLASHED_OVERRIDE, disputeStartBlock)).toBe(disputeStartBlock);
  });

  it("D-02: a round past the recorded decisions starts at the last decision, so the scan covers more, never less", () => {
    expect(roundStartBlock(9n, appealDecisions, UNSLASHED_OVERRIDE, disputeStartBlock)).toBe(14_866_053n);
    expect(roundStartBlock(1n, [], undefined, 42n)).toBe(42n);
  });
});
