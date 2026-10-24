import { describe, expect, it } from "vitest";
import { REGISTRY, getOverride } from "../registry";
import type { BehaviorOverride } from "../registry/types";
import { DISPUTE_1170, UNSLASHED } from "./__fixtures__/recorded";
import { fundingRound, roundStartBlock, roundsToScan } from "./index";

const UNSLASHED_OVERRIDE: BehaviorOverride | undefined = getOverride(REGISTRY, 1, DISPUTE_1170.arbitrable);

function appealsBefore(position: { readonly blockNumber: bigint; readonly logIndex: number }): number {
  return DISPUTE_1170.appealDecisionPositions.filter(
    (decision) => decision.blockNumber < position.blockNumber || (decision.blockNumber === position.blockNumber && decision.logIndex < position.logIndex),
  ).length;
}

describe("fundingRound", () => {
  it("reads the round offset from the registry's Unslashed override", () => {
    expect(UNSLASHED_OVERRIDE?.roundIndexOffset).toBe(1);
  });

  it("is the appeal count plus the offset", () => {
    expect(fundingRound(5, UNSLASHED_OVERRIDE)).toBe(6n);
    expect(fundingRound(0, UNSLASHED_OVERRIDE)).toBe(1n);
    expect(fundingRound(5, undefined)).toBe(5n);
    expect(fundingRound(0, undefined)).toBe(0n);
  });

  it("leaves the round unshifted for an override without an offset", () => {
    expect(fundingRound(3, { justification: "test override without offset" })).toBe(3n);
  });

  it("places every recorded Contribution and RulingFunded event of dispute 1170 in round appeals-before + 1", () => {
    expect(DISPUTE_1170.fundingEvents).toHaveLength(27);
    expect(DISPUTE_1170.appealDecisions).toHaveLength(5);
    for (const event of DISPUTE_1170.fundingEvents) {
      expect({ ...event, round: fundingRound(appealsBefore(event), UNSLASHED_OVERRIDE) }).toEqual(event);
    }
    expect(new Set(DISPUTE_1170.fundingEvents.map((event) => event.type))).toEqual(new Set(["Contribution", "RulingFunded"]));
  });
});

describe("roundsToScan", () => {
  it("scans only the funding round in the appeal period", () => {
    expect(roundsToScan(3, 5, UNSLASHED_OVERRIDE)).toEqual([6n]);
    expect(roundsToScan(3, 2, undefined)).toEqual([2n]);
    expect(roundsToScan(3, 0, undefined)).toEqual([0n]);
  });

  it("scans Unslashed rounds 1 to appealCount + 1 in execution, the last one included", () => {
    expect(roundsToScan(4, 5, UNSLASHED_OVERRIDE)).toEqual([1n, 2n, 3n, 4n, 5n, 6n]);
    const scanned = new Set(roundsToScan(4, DISPUTE_1170.appealDecisions.length, UNSLASHED_OVERRIDE));
    for (const event of DISPUTE_1170.fundingEvents) expect(scanned.has(event.round)).toBe(true);
  });

  it("scans standard rounds 0 to appealCount in execution", () => {
    expect(roundsToScan(4, 2, undefined)).toEqual([0n, 1n, 2n]);
    expect(roundsToScan(4, 0, undefined)).toEqual([0n]);
  });

  it("scans round 1 for mainnet dispute 1678 (no appeal), where its contribution sits, not round 0", () => {
    const { appealDecisions } = UNSLASHED.dispute1678;
    expect(appealDecisions).toHaveLength(0);
    expect(roundsToScan(4, appealDecisions.length, UNSLASHED_OVERRIDE)).toEqual([1n]);
  });

  it("scans rounds 1 and 2 for mainnet dispute 1226 (one appeal)", () => {
    expect(roundsToScan(4, UNSLASHED.dispute1226.appealDecisions.length, UNSLASHED_OVERRIDE)).toEqual([1n, 2n]);
  });

  it("scans nothing before the appeal period", () => {
    for (const period of [0, 1, 2] as const) expect(roundsToScan(period, 3, undefined)).toEqual([]);
  });
});

describe("roundStartBlock", () => {
  const { appealDecisions, disputeStartBlock } = DISPUTE_1170;

  it("starts the first funding round at the Dispute event block", () => {
    expect(roundStartBlock(1n, appealDecisions, UNSLASHED_OVERRIDE, disputeStartBlock)).toBe(14_578_743n);
    expect(roundStartBlock(0n, appealDecisions, undefined, 777n)).toBe(777n);
  });

  it("starts round offset + k at the k-th appeal decision", () => {
    const starts = [2n, 3n, 4n, 5n, 6n].map((round) => roundStartBlock(round, appealDecisions, UNSLASHED_OVERRIDE, disputeStartBlock));
    expect(starts).toEqual([14_640_476n, 14_694_467n, 14_726_733n, 14_795_056n, 14_866_053n]);
    expect(roundStartBlock(2n, appealDecisions, undefined, disputeStartBlock)).toBe(14_694_467n);
  });

  it("puts every recorded funding event of dispute 1170 at or after its round's start block", () => {
    for (const event of DISPUTE_1170.fundingEvents) {
      expect(event.blockNumber).toBeGreaterThanOrEqual(roundStartBlock(event.round, appealDecisions, UNSLASHED_OVERRIDE, disputeStartBlock));
    }
  });

  it("starts a round before the offset at the Dispute event block", () => {
    expect(roundStartBlock(0n, appealDecisions, UNSLASHED_OVERRIDE, disputeStartBlock)).toBe(disputeStartBlock);
  });

  it("starts a round past the recorded decisions at the last decision, so the scan covers more, never less", () => {
    expect(roundStartBlock(9n, appealDecisions, UNSLASHED_OVERRIDE, disputeStartBlock)).toBe(14_866_053n);
    expect(roundStartBlock(1n, [], undefined, 42n)).toBe(42n);
  });
});
