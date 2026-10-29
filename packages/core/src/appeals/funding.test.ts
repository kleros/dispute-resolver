import { encodeEventTopics, encodeAbiParameters } from "viem";
import { describe, expect, it } from "vitest";
import { governorAbi } from "../abi";
import type { LocalIdResolution } from "../disputes/types";
import { REGISTRY, getOverride } from "../registry";
import type { Address } from "../types";
import { DISPUTE_1170, GOVERNOR_1621, UNSLASHED } from "./__fixtures__/recorded";
import { readRoundFunding, roundStartBlock } from "./index";
import { CONTRIBUTION_EVENT, RULING_FUNDED_EVENT } from "./context";
import type { AppealContext } from "./types";
import { FAMILY_SIGNATURES, answer, detectionFor, fakeNode, recordedDetection, reverting, rpcError, rpcLog, testBinding, type FakeNodeSpec } from "../test/appeals/testHelpers";

const UNSLASHED_OVERRIDE = getOverride(REGISTRY, 1, UNSLASHED.arbitrable);
const SYNTHETIC: Address = "0x00000000000000000000000000000000000000bb";

async function unslashedContext(spec: FakeNodeSpec, disputeId: bigint, localId: bigint) {
  const { client, requests } = fakeNode(spec);
  const context: AppealContext = {
    client,
    binding: testBinding({ disputeId, arbitrated: UNSLASHED.arbitrable }),
    family: await recordedDetection(1, UNSLASHED.arbitrable),
    localId: { kind: "local-id", value: localId },
    override: UNSLASHED_OVERRIDE,
  };
  return { context, requests };
}

function syntheticContext(spec: FakeNodeSpec, localId: LocalIdResolution = { kind: "local-id", value: 7n }) {
  const { client, requests } = fakeNode(spec);
  const context: AppealContext = {
    client,
    binding: testBinding({ disputeId: 99n, arbitrated: SYNTHETIC }),
    family: detectionFor(SYNTHETIC, FAMILY_SIGNATURES["idr-v2"]),
    localId,
    override: undefined,
  };
  return { context, requests };
}

function contributionLog(input: { readonly localId: bigint; readonly round: bigint; readonly ruling: bigint; readonly amount: bigint; readonly logIndex?: number }) {
  return rpcLog({
    address: SYNTHETIC,
    topics: encodeEventTopics({
      abi: [CONTRIBUTION_EVENT],
      eventName: "Contribution",
      args: { _localDisputeID: input.localId, _round: input.round, _contributor: "0x00000000000000000000000000000000000000c1" },
    }) as `0x${string}`[],
    data: encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [input.ruling, input.amount]),
    blockNumber: 100n,
    logIndex: input.logIndex ?? 0,
  });
}

function rulingFundedLog(input: { readonly localId: bigint; readonly round: bigint; readonly ruling: bigint; readonly block: bigint; readonly logIndex?: number }) {
  return rpcLog({
    address: SYNTHETIC,
    topics: encodeEventTopics({
      abi: [RULING_FUNDED_EVENT],
      eventName: "RulingFunded",
      args: { _localDisputeID: input.localId, _round: input.round, _ruling: input.ruling },
    }) as `0x${string}`[],
    data: "0x",
    blockNumber: input.block,
    logIndex: input.logIndex ?? 1,
  });
}

function expectedRound(round: bigint, amounts: Readonly<Record<string, bigint>>, fundedRulings: readonly bigint[]) {
  return { round, contributions: Object.entries(amounts).map(([ruling, amount]) => ({ ruling: BigInt(ruling), amount })), fundedRulings };
}

describe("readRoundFunding (IDisputeResolver)", () => {
  const rounds1170 = [
    expectedRound(1n, { 1: 1_008_000_000_000_000_000n, 2: 756_000_000_000_000_000n }, [1n, 2n]),
    expectedRound(2n, { 1: 1_620_000_000_000_000_000n, 2: 2_160_000_000_000_000_000n }, [2n, 1n]),
    expectedRound(3n, { 1: 3_348_000_000_000_000_000n, 2: 4_464_000_000_000_000_000n }, [1n, 2n]),
    expectedRound(4n, { 1: 9_072_000_000_000_000_000n, 2: 6_804_000_000_000_000_000n }, [1n, 2n]),
    expectedRound(5n, { 1: 6_350_000_000_000_000_000n, 2: 4_762_500_000_000_000_000n }, [1n, 2n]),
    expectedRound(6n, { 2: 9_562_500_000_000_000_000n }, [2n]),
  ];

  it("sums the recorded Contribution events of every round of dispute 1170 per ruling and lists its RulingFunded rulings", async () => {
    const { context } = await unslashedContext({ head: DISPUTE_1170.readAtBlock, logs: DISPUTE_1170.fundingLogs }, DISPUTE_1170.disputeId, DISPUTE_1170.localId);
    for (const expected of rounds1170) {
      const fromBlock = roundStartBlock(expected.round, DISPUTE_1170.appealDecisions, UNSLASHED_OVERRIDE, DISPUTE_1170.disputeStartBlock);
      expect(await readRoundFunding(context, expected.round, fromBlock)).toEqual({ ok: true, value: expected });
    }
  });

  it("scans each round from its start block to the head, with no 10,000-block window", async () => {
    const { context, requests } = await unslashedContext({ head: DISPUTE_1170.readAtBlock, logs: DISPUTE_1170.fundingLogs }, DISPUTE_1170.disputeId, DISPUTE_1170.localId);
    const fromBlock = roundStartBlock(4n, DISPUTE_1170.appealDecisions, UNSLASHED_OVERRIDE, DISPUTE_1170.disputeStartBlock);
    await readRoundFunding(context, 4n, fromBlock);
    expect(requests.logs).toHaveLength(2);
    for (const filter of requests.logs) {
      expect(filter).toMatchObject({ address: UNSLASHED.arbitrable, fromBlock: 14_726_733n, toBlock: DISPUTE_1170.readAtBlock });
    }
  });

  it("finds dispute 1678's 0.273 ETH contribution and funded ruling in round 1", async () => {
    const dispute = UNSLASHED.dispute1678;
    const { context } = await unslashedContext({ head: UNSLASHED.readAtBlock, logs: dispute.fundingLogs }, dispute.disputeId, dispute.localId);
    const result = await readRoundFunding(context, 1n, roundStartBlock(1n, dispute.appealDecisions, UNSLASHED_OVERRIDE, dispute.disputeStartBlock));
    expect(result).toEqual({ ok: true, value: { round: 1n, contributions: [{ ruling: 2n, amount: 273_000_000_000_000_000n }], fundedRulings: [2n] } });
    expect(await readRoundFunding(context, 0n, dispute.disputeStartBlock)).toEqual({ ok: true, value: { round: 0n, contributions: [], fundedRulings: [] } });
  });

  it("finds rulings 1 and 2 of dispute 1226 in round 1, the first 56,623 blocks after the Dispute event, through a capped RPC", async () => {
    const dispute = UNSLASHED.dispute1226;
    const { context, requests } = await unslashedContext({ head: UNSLASHED.readAtBlock, logs: dispute.fundingLogs, maxRange: 10_000n }, dispute.disputeId, dispute.localId);
    const result = await readRoundFunding(context, 1n, roundStartBlock(1n, dispute.appealDecisions, UNSLASHED_OVERRIDE, dispute.disputeStartBlock));
    expect(result).toEqual({
      ok: true,
      value: {
        round: 1n,
        contributions: [
          { ruling: 1n, amount: 756_000_000_000_000_000n },
          { ruling: 2n, amount: 1_008_000_000_000_000_000n },
        ],
        fundedRulings: [2n, 1n],
      },
    });
    expect(requests.logs.length).toBeGreaterThan(2);
    const round2 = await readRoundFunding(context, 2n, roundStartBlock(2n, dispute.appealDecisions, UNSLASHED_OVERRIDE, dispute.disputeStartBlock));
    expect(round2).toEqual({ ok: true, value: { round: 2n, contributions: [], fundedRulings: [] } });
  });

  it("counts only the dispute's own local ID and round", async () => {
    const logs = [
      contributionLog({ localId: 7n, round: 1n, ruling: 1n, amount: 5n }),
      contributionLog({ localId: 8n, round: 1n, ruling: 1n, amount: 50n, logIndex: 2 }),
      contributionLog({ localId: 7n, round: 2n, ruling: 1n, amount: 500n, logIndex: 3 }),
      rulingFundedLog({ localId: 7n, round: 2n, ruling: 1n, block: 100n, logIndex: 4 }),
    ];
    const { context } = syntheticContext({ head: 200n, logs });
    expect(await readRoundFunding(context, 1n, 0n)).toEqual({ ok: true, value: { round: 1n, contributions: [{ ruling: 1n, amount: 5n }], fundedRulings: [] } });
  });

  it("reports a failed scan as rpc-error, never an empty funding", async () => {
    const { context } = syntheticContext({ head: 200n, failing: { eth_getLogs: rpcError(-32000, "header not found") } });
    expect(await readRoundFunding(context, 1n, 0n)).toMatchObject({ ok: false, error: { code: "rpc-error" } });
  });

  it("needs a resolved local ID for an IDisputeResolver family", async () => {
    const reverted = syntheticContext({ head: 1n }, { kind: "unresolved", reason: "reverted" });
    expect(await readRoundFunding(reverted.context, 0n, 0n)).toMatchObject({ ok: false, error: { code: "reverted" } });
    expect(reverted.requests.methods).toEqual([]);
    const offline = syntheticContext({ head: 1n }, { kind: "unresolved", reason: "rpc-error" });
    expect(await readRoundFunding(offline.context, 0n, 0n)).toMatchObject({ ok: false, error: { code: "rpc-error" } });
    const notApplicable = syntheticContext({ head: 1n }, { kind: "not-applicable" });
    expect(await readRoundFunding(notApplicable.context, 0n, 0n)).toMatchObject({ ok: false, error: { code: "unsupported" } });
  });

  it("reports families without a funding dialect as unsupported", async () => {
    for (const signatures of [FAMILY_SIGNATURES["escrow-v1"], FAMILY_SIGNATURES["view-only"]]) {
      const { context, requests } = syntheticContext({ head: 1n });
      const result = await readRoundFunding({ ...context, family: detectionFor(SYNTHETIC, signatures) }, 0n, 0n);
      expect(result).toMatchObject({ ok: false, error: { code: "unsupported" } });
      expect(requests.methods).toEqual([]);
    }
  });

  it("refuses a detection of another contract than the binding's arbitrable", async () => {
    const { context, requests } = syntheticContext({ head: 1n });
    const result = await readRoundFunding({ ...context, family: detectionFor("0x00000000000000000000000000000000000000ee", FAMILY_SIGNATURES["idr-v2"]) }, 0n, 0n);
    expect(result).toMatchObject({ ok: false, error: { code: "invalid-data" } });
    expect(requests.methods).toEqual([]);
  });
});

describe("readRoundFunding (governor dialect)", () => {
  const governorContext = async (spec: FakeNodeSpec, evidenceGroupId: bigint | undefined) => {
    const { client, requests } = fakeNode(spec);
    const context: AppealContext = {
      client,
      binding: testBinding({ disputeId: GOVERNOR_1621.disputeId, arbitrated: GOVERNOR_1621.governor }),
      family: await recordedDetection(1, GOVERNOR_1621.governor),
      localId: { kind: "not-applicable" },
      override: undefined,
      ...(evidenceGroupId === undefined ? {} : { evidenceGroupId }),
    };
    return { context, requests };
  };

  it("reads round 0 of session 18 for dispute 1621, the Dispute event's evidence group, not the current session", async () => {
    expect(GOVERNOR_1621.evidenceGroupId).toBe(18n);
    const { context, requests } = await governorContext({ head: GOVERNOR_1621.blockNumber, calls: GOVERNOR_1621.calls }, GOVERNOR_1621.evidenceGroupId);
    expect(await readRoundFunding(context, 0n, GOVERNOR_1621.disputeStartBlock)).toEqual({ ok: true, value: { round: 0n, contributions: [], fundedRulings: [] } });
    const [roundInfoKey] = answer({ to: GOVERNOR_1621.governor, abi: governorAbi, functionName: "getRoundInfo", args: [18n, 0n], result: [[], [], 0n, 0n] });
    expect(requests.calls).toEqual([roundInfoKey]);
    expect(requests.methods).not.toContain("eth_getLogs");
  });

  it("maps list index i to ruling i + 1, paid fees to contributions and fully paid lists to funded rulings", async () => {
    const { context } = await governorContext(
      {
        head: 1n,
        calls: [
          answer({ to: GOVERNOR_1621.governor, abi: governorAbi, functionName: "getRoundInfo", args: [5n, 1n], result: [[100n, 0n, 300n], [true, false, false], 100n, 100n] }),
        ],
      },
      5n,
    );
    expect(await readRoundFunding(context, 1n, 0n)).toEqual({
      ok: true,
      value: {
        round: 1n,
        contributions: [
          { ruling: 1n, amount: 100n },
          { ruling: 3n, amount: 300n },
        ],
        fundedRulings: [1n],
      },
    });
  });

  it("reports the governor session as unknown without the Dispute event's evidence group", async () => {
    const { context, requests } = await governorContext({ head: 1n }, undefined);
    expect(await readRoundFunding(context, 0n, 0n)).toMatchObject({ ok: false, error: { code: "not-found" } });
    expect(requests.methods).toEqual([]);
  });

  it("reports a round the governor does not have as reverted, not empty", async () => {
    const { context } = await governorContext({ head: GOVERNOR_1621.blockNumber, calls: GOVERNOR_1621.calls }, 18n);
    expect(await readRoundFunding(context, 1n, 0n)).toMatchObject({ ok: false, error: { code: "reverted" } });
  });

  it("reports a governor transport failure as rpc-error", async () => {
    const { context } = await governorContext(
      {
        head: 1n,
        calls: [reverting({ to: GOVERNOR_1621.governor, abi: governorAbi, functionName: "getRoundInfo", args: [18n, 0n], error: { code: -32000, message: "header not found" } })],
      },
      18n,
    );
    expect(await readRoundFunding(context, 0n, 0n)).toMatchObject({ ok: false, error: { code: "rpc-error" } });
  });
});
