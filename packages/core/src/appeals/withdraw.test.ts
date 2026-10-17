import { encodeAbiParameters, encodeEventTopics, getAbiItem } from "viem";
import { describe, expect, it } from "vitest";
import { governorAbi, idrV1Abi, idrV2Abi, klerosLiquidAbi } from "../abi";
import type { LocalIdResolution } from "../disputes/types";
import type { FamilyDetection } from "../families/types";
import { REGISTRY, getOverride } from "../registry";
import type { Address } from "../types";
import { GOVERNOR_1621, UNSLASHED } from "./__fixtures__/recorded";
import { governorSessionAbi } from "./governor";
import { readWithdrawable, roundStartBlock, roundsToScan } from "./index";
import type { AppealContext } from "./types";
import {
  FAMILY_SIGNATURES,
  answer,
  detectionFor,
  fakeNode,
  recordedDetection,
  reverting,
  rpcLog,
  testBinding,
  type CallReply,
  type FakeNodeSpec,
} from "../test/appeals/testHelpers";

const UNSLASHED_OVERRIDE = getOverride(REGISTRY, 1, UNSLASHED.arbitrable);
const SYNTHETIC: Address = "0x00000000000000000000000000000000000000cc";
const ARBITRATOR: Address = "0x988b3a538b618c7a603e1c11ab82cd16dbe28069";
const ME: Address = "0x00000000000000000000000000000000000000a1";
const OTHER: Address = "0x00000000000000000000000000000000000000a2";
const CONTRIBUTION = getAbiItem({ abi: idrV2Abi, name: "Contribution" });
/** The governor's `Session.status` values (verified source): `DisputeCreated` while the dispute runs, `Resolved` once ruled. */
const DISPUTE_CREATED = 1;
const RESOLVED = 2;

function contributionLog(input: { readonly round: bigint; readonly ruling: bigint; readonly contributor: Address; readonly block: bigint; readonly logIndex?: number }) {
  return rpcLog({
    address: SYNTHETIC,
    topics: encodeEventTopics({
      abi: [CONTRIBUTION],
      eventName: "Contribution",
      args: { _localDisputeID: 7n, _round: input.round, _contributor: input.contributor },
    }) as `0x${string}`[],
    data: encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [input.ruling, 1_000n]),
    blockNumber: input.block,
    logIndex: input.logIndex ?? 0,
  });
}

function context(spec: FakeNodeSpec, family: FamilyDetection, extra: Partial<AppealContext> = {}) {
  const { client, requests } = fakeNode(spec);
  const localId: LocalIdResolution = family.capabilities.localId === "none" ? { kind: "not-applicable" } : { kind: "local-id", value: 7n };
  const value: AppealContext = { client, binding: testBinding({ disputeId: 99n, arbitrated: family.arbitrable }), family, localId, override: undefined, ...extra };
  return { context: value, requests };
}

const v2Withdrawable = (ruling: bigint, result: bigint): [string, CallReply] =>
  answer({ to: SYNTHETIC, abi: idrV2Abi, functionName: "getTotalWithdrawableAmount", args: [7n, ME, ruling], result });
const v1Withdrawable = (ruling: bigint, result: bigint): [string, CallReply] =>
  answer({ to: SYNTHETIC, abi: idrV1Abi, functionName: "getTotalWithdrawableAmount", args: [7n, ME, [ruling]], result });

const MY_LOGS = [
  contributionLog({ round: 0n, ruling: 1n, contributor: ME, block: 100n }),
  contributionLog({ round: 1n, ruling: 2n, contributor: ME, block: 500n }),
  contributionLog({ round: 1n, ruling: 1n, contributor: ME, block: 600n }),
  contributionLog({ round: 1n, ruling: 3n, contributor: OTHER, block: 600n, logIndex: 1 }),
  contributionLog({ round: 2n, ruling: 4n, contributor: ME, block: 700n }),
];

describe("readWithdrawable (IDisputeResolver)", () => {
  it("P-22: without a connected account nothing is read", async () => {
    const { context: ctx, requests } = context({ head: 1_000n }, detectionFor(SYNTHETIC, FAMILY_SIGNATURES["idr-v2"]));
    expect(await readWithdrawable(ctx, { beneficiary: undefined, rounds: [0n], roundStartBlocks: [0n] })).toEqual({ status: "no-account" });
    expect(requests.methods).toEqual([]);
  });

  it("D-51: idr-v2 sums every ruling the account contributed to across the rounds, one item per non-zero ruling", async () => {
    const { context: ctx, requests } = context(
      { head: 1_000n, logs: MY_LOGS, calls: [v2Withdrawable(1n, 40n), v2Withdrawable(2n, 0n)] },
      detectionFor(SYNTHETIC, FAMILY_SIGNATURES["idr-v2"]),
    );
    const state = await readWithdrawable(ctx, { beneficiary: ME, rounds: [0n, 1n], roundStartBlocks: [100n, 400n] });
    expect(state).toEqual({ status: "available", beneficiary: ME, total: 40n, items: [{ dialect: "idr-v2", ruling: 1n, amount: 40n }] });
    expect(requests.calls).toEqual([v2Withdrawable(1n, 0n)[0], v2Withdrawable(2n, 0n)[0]]);
  });

  it("D-51: several non-zero rulings are several items, withdrawn one by one; the total is their sum", async () => {
    const { context: ctx } = context(
      { head: 1_000n, logs: MY_LOGS, calls: [v2Withdrawable(1n, 40n), v2Withdrawable(2n, 2n)] },
      detectionFor(SYNTHETIC, FAMILY_SIGNATURES["idr-v2"]),
    );
    const state = await readWithdrawable(ctx, { beneficiary: ME, rounds: [0n, 1n], roundStartBlocks: [100n, 400n] });
    expect(state).toEqual({
      status: "available",
      beneficiary: ME,
      total: 42n,
      items: [
        { dialect: "idr-v2", ruling: 1n, amount: 40n },
        { dialect: "idr-v2", ruling: 2n, amount: 2n },
      ],
    });
  });

  it("D-49: idr-v1 reads getTotalWithdrawableAmount with a one-ruling array", async () => {
    const { context: ctx, requests } = context(
      { head: 1_000n, logs: MY_LOGS, calls: [v1Withdrawable(1n, 5n), v1Withdrawable(2n, 6n)] },
      detectionFor(SYNTHETIC, FAMILY_SIGNATURES["idr-v1"]),
    );
    const state = await readWithdrawable(ctx, { beneficiary: ME, rounds: [0n, 1n], roundStartBlocks: [100n, 400n] });
    expect(state).toEqual({
      status: "available",
      beneficiary: ME,
      total: 11n,
      items: [
        { dialect: "idr-v1", ruling: 1n, amount: 5n },
        { dialect: "idr-v1", ruling: 2n, amount: 6n },
      ],
    });
    expect(requests.calls).toEqual([v1Withdrawable(1n, 0n)[0], v1Withdrawable(2n, 0n)[0]]);
  });

  it("D-30, D-49: golden 1678 reads the round-1 contribution of its first contributor through the v1 signature (already withdrawn: nothing)", async () => {
    const dispute = UNSLASHED.dispute1678;
    const { client, requests } = fakeNode({ head: UNSLASHED.readAtBlock, logs: dispute.fundingLogs, calls: dispute.withdrawCalls });
    const family = await recordedDetection(1, UNSLASHED.arbitrable);
    expect(family.capabilities.withdraw.kind).toBe("idr-v1");
    const ctx: AppealContext = {
      client,
      binding: testBinding({ disputeId: dispute.disputeId, arbitrated: UNSLASHED.arbitrable }),
      family,
      localId: { kind: "local-id", value: dispute.localId },
      override: UNSLASHED_OVERRIDE,
    };
    const rounds = roundsToScan(4, dispute.appealDecisions.length, UNSLASHED_OVERRIDE);
    const roundStartBlocks = rounds.map((round) => roundStartBlock(round, dispute.appealDecisions, UNSLASHED_OVERRIDE, dispute.disputeStartBlock));
    expect(await readWithdrawable(ctx, { beneficiary: dispute.firstContributor, rounds, roundStartBlocks })).toEqual({ status: "nothing" });
    expect(requests.calls).toEqual(dispute.withdrawCalls.map(([key]) => key));
  });

  it("§5.15: only the account's own contributions in the given rounds are considered", async () => {
    const { context: ctx, requests } = context(
      { head: 1_000n, logs: MY_LOGS, calls: [v2Withdrawable(1n, 0n), v2Withdrawable(2n, 0n)] },
      detectionFor(SYNTHETIC, FAMILY_SIGNATURES["idr-v2"]),
    );
    expect(await readWithdrawable(ctx, { beneficiary: ME, rounds: [0n, 1n], roundStartBlocks: [100n, 400n] })).toEqual({ status: "nothing" });
    expect(requests.calls).toHaveLength(2);
  });

  it("D-02: one scan from the earliest round start to the head", async () => {
    const { context: ctx, requests } = context(
      { head: 1_000n, logs: MY_LOGS, calls: [v2Withdrawable(1n, 1n), v2Withdrawable(2n, 1n)] },
      detectionFor(SYNTHETIC, FAMILY_SIGNATURES["idr-v2"]),
    );
    await readWithdrawable(ctx, { beneficiary: ME, rounds: [1n, 0n], roundStartBlocks: [400n, 100n] });
    expect(requests.logs).toHaveLength(1);
    expect(requests.logs[0]).toMatchObject({ fromBlock: 100n, toBlock: 1_000n });
  });

  it("§5.15: an account that contributed nothing has nothing to withdraw, without a withdrawable read", async () => {
    const { context: ctx, requests } = context({ head: 1_000n, logs: MY_LOGS }, detectionFor(SYNTHETIC, FAMILY_SIGNATURES["idr-v2"]));
    expect(await readWithdrawable(ctx, { beneficiary: "0x00000000000000000000000000000000000000a9", rounds: [0n, 1n], roundStartBlocks: [0n, 0n] })).toEqual({ status: "nothing" });
    expect(requests.calls).toEqual([]);
  });

  it("D-36: a failed read is unavailable, never zero", async () => {
    const reverted = context(
      { head: 1_000n, logs: MY_LOGS, calls: [v2Withdrawable(1n, 1n), reverting({ to: SYNTHETIC, abi: idrV2Abi, functionName: "getTotalWithdrawableAmount", args: [7n, ME, 2n] })] },
      detectionFor(SYNTHETIC, FAMILY_SIGNATURES["idr-v2"]),
    );
    expect(await readWithdrawable(reverted.context, { beneficiary: ME, rounds: [0n, 1n], roundStartBlocks: [0n, 0n] })).toMatchObject({
      status: "unavailable",
      error: { code: "reverted" },
    });
    const offline = context({ head: 1_000n, failing: { eth_getLogs: new Error("socket hang up") } }, detectionFor(SYNTHETIC, FAMILY_SIGNATURES["idr-v2"]));
    expect(await readWithdrawable(offline.context, { beneficiary: ME, rounds: [0n], roundStartBlocks: [0n] })).toMatchObject({
      status: "unavailable",
      error: { code: "rpc-error" },
    });
  });

  it("§5.3: an unresolved local ID is unavailable", async () => {
    const { context: ctx, requests } = context({ head: 1_000n }, detectionFor(SYNTHETIC, FAMILY_SIGNATURES["idr-v2"]), { localId: { kind: "unresolved", reason: "reverted" } });
    expect(await readWithdrawable(ctx, { beneficiary: ME, rounds: [0n], roundStartBlocks: [0n] })).toMatchObject({ status: "unavailable", error: { code: "reverted" } });
    expect(requests.methods).toEqual([]);
  });

  it("D-36: rounds without a start block each are invalid input", async () => {
    const { context: ctx } = context({ head: 1_000n }, detectionFor(SYNTHETIC, FAMILY_SIGNATURES["idr-v2"]));
    expect(await readWithdrawable(ctx, { beneficiary: ME, rounds: [0n, 1n], roundStartBlocks: [0n] })).toMatchObject({ status: "unavailable", error: { code: "invalid-data" } });
  });

  it("D-46: idr-legacy, Escrow V1 and view-only arbitrables have no withdraw read", async () => {
    for (const signatures of [FAMILY_SIGNATURES["idr-legacy"], FAMILY_SIGNATURES["escrow-v1"], FAMILY_SIGNATURES["view-only"]]) {
      const { context: ctx, requests } = context({ head: 1_000n }, detectionFor(SYNTHETIC, signatures));
      expect(await readWithdrawable(ctx, { beneficiary: ME, rounds: [0n], roundStartBlocks: [0n] })).toMatchObject({ status: "unavailable", error: { code: "unsupported" } });
      expect(requests.methods).toEqual([]);
    }
  });
});

describe("readWithdrawable (governor dialect)", () => {
  const GOVERNOR = GOVERNOR_1621.governor;
  const governorFamily = () => recordedDetection(1, GOVERNOR);
  const arbitratorState = (ruled: boolean, ruling: bigint): [string, CallReply][] => [
    answer({ to: ARBITRATOR, abi: klerosLiquidAbi, functionName: "disputes", args: [99n], result: [4n, GOVERNOR, 2n, 4, 0n, 0n, 0n, ruled] }),
    answer({ to: ARBITRATOR, abi: klerosLiquidAbi, functionName: "currentRuling", args: [99n], result: ruling }),
  ];
  /** `sessions(5)`: the session's settled ruling and status (1 DisputeCreated, 2 Resolved), for dispute 99 unless given. */
  const sessionState = (ruling: bigint, status: number, disputeId = 99n): [string, CallReply] =>
    answer({ to: GOVERNOR, abi: governorSessionAbi, functionName: "sessions", args: [5n], result: [ruling, disputeId, 0n, status, 0n] });
  const roundInfo = (session: bigint, round: bigint, result: readonly [readonly bigint[], readonly boolean[], bigint, bigint]) =>
    answer({ to: GOVERNOR, abi: governorAbi, functionName: "getRoundInfo", args: [session, round], result });
  const contributions = (session: bigint, round: bigint, result: readonly bigint[]) =>
    answer({ to: GOVERNOR, abi: governorAbi, functionName: "getContributions", args: [session, round, ME], result });

  it("D-47: the winner's contributors share the round's fee rewards; an unfunded side is refunded; items are per (round, list)", async () => {
    const { context: ctx } = context(
      {
        head: 1_000n,
        calls: [
          sessionState(2n, RESOLVED),
          roundInfo(5n, 0n, [[3_000n, 2_000n], [true, true], 4_000n, 5_000n]),
          contributions(5n, 0n, [300n, 1_000n]),
          roundInfo(5n, 1n, [[500n, 0n], [false, false], 0n, 0n]),
          contributions(5n, 1n, [200n, 0n]),
        ],
      },
      await governorFamily(),
      { evidenceGroupId: 5n },
    );
    expect(await readWithdrawable(ctx, { beneficiary: ME, rounds: [0n, 1n], roundStartBlocks: [0n, 0n] })).toEqual({
      status: "available",
      beneficiary: ME,
      total: 2_200n,
      items: [
        { dialect: "governor", session: 5n, round: 0n, listIndex: 1n, amount: 2_000n },
        { dialect: "governor", session: 5n, round: 1n, listIndex: 0n, amount: 200n },
      ],
    });
  });

  it("D-47: when the winner's side was not fully paid, every paid side is reimbursed in proportion", async () => {
    const { context: ctx } = context(
      { head: 1_000n, calls: [sessionState(2n, RESOLVED), roundInfo(5n, 0n, [[3_000n, 100n], [true, false], 3_000n, 3_000n]), contributions(5n, 0n, [1_500n, 50n])] },
      await governorFamily(),
      { evidenceGroupId: 5n },
    );
    expect(await readWithdrawable(ctx, { beneficiary: ME, rounds: [0n], roundStartBlocks: [0n] })).toMatchObject({
      status: "available",
      total: 1_550n,
      items: [
        { listIndex: 0n, amount: 1_500n },
        { listIndex: 1n, amount: 50n },
      ],
    });
  });

  it("D-47: with ruling 0 the paid sides are reimbursed in proportion to the successfully paid fees", async () => {
    const { context: ctx } = context(
      { head: 1_000n, calls: [sessionState(0n, RESOLVED), roundInfo(5n, 0n, [[2_000n, 2_000n], [true, true], 3_000n, 4_000n]), contributions(5n, 0n, [1_000n, 0n])] },
      await governorFamily(),
      { evidenceGroupId: 5n },
    );
    expect(await readWithdrawable(ctx, { beneficiary: ME, rounds: [0n], roundStartBlocks: [0n] })).toMatchObject({
      status: "available",
      total: 750n,
      items: [{ listIndex: 0n, amount: 750n }],
    });
  });

  it("D-47: a losing side that was fully paid gets nothing", async () => {
    const { context: ctx } = context(
      { head: 1_000n, calls: [sessionState(1n, RESOLVED), roundInfo(5n, 0n, [[2_000n, 3_000n], [true, true], 4_000n, 5_000n]), contributions(5n, 0n, [0n, 3_000n])] },
      await governorFamily(),
      { evidenceGroupId: 5n },
    );
    expect(await readWithdrawable(ctx, { beneficiary: ME, rounds: [0n], roundStartBlocks: [0n] })).toEqual({ status: "nothing" });
  });

  it("D-47: golden 1621 reads session 18 (the Dispute event's evidence group); round 0 holds nothing for the account", async () => {
    const { context: ctx, requests } = context(
      {
        head: GOVERNOR_1621.blockNumber,
        calls: [...GOVERNOR_1621.calls, answer({ to: GOVERNOR, abi: governorAbi, functionName: "getContributions", args: [18n, 0n, ME], result: [0n, 0n] })],
      },
      await governorFamily(),
      { evidenceGroupId: GOVERNOR_1621.evidenceGroupId, binding: testBinding({ disputeId: GOVERNOR_1621.disputeId, arbitrated: GOVERNOR }) },
    );
    expect(await readWithdrawable(ctx, { beneficiary: ME, rounds: roundsToScan(4, 0, undefined), roundStartBlocks: [GOVERNOR_1621.disputeStartBlock] })).toEqual({
      status: "nothing",
    });
    expect(requests.calls).toContain(roundInfo(18n, 0n, [[], [], 0n, 0n])[0]);
    expect(requests.calls).toContain(answer({ to: GOVERNOR, abi: governorSessionAbi, functionName: "sessions", args: [18n], result: [2n, 1621n, 0n, RESOLVED, 0n] })[0]);
  });

  it("D-47: before the ruling is executed the governor session is not resolved, so nothing is withdrawable", async () => {
    const { context: ctx, requests } = context({ head: 1_000n, calls: [sessionState(0n, DISPUTE_CREATED)] }, await governorFamily(), { evidenceGroupId: 5n });
    expect(await readWithdrawable(ctx, { beneficiary: ME, rounds: [0n], roundStartBlocks: [0n] })).toEqual({ status: "nothing" });
    expect(requests.calls).toEqual([sessionState(0n, DISPUTE_CREATED)[0]]);
  });

  it("F1 D-47: the governor's settled ruling, not the jury's, decides the rewards when only one list funded the final round", async () => {
    const { context: ctx } = context(
      {
        head: 1_000n,
        calls: [
          ...arbitratorState(true, 2n),
          sessionState(1n, RESOLVED),
          roundInfo(5n, 0n, [[3_000n, 2_000n], [true, true], 4_000n, 5_000n]),
          contributions(5n, 0n, [1_500n, 0n]),
          roundInfo(5n, 1n, [[2_500n, 0n], [true, false], 2_500n, 2_500n]),
          contributions(5n, 1n, [0n, 0n]),
        ],
      },
      await governorFamily(),
      { evidenceGroupId: 5n },
    );
    expect(await readWithdrawable(ctx, { beneficiary: ME, rounds: [0n, 1n], roundStartBlocks: [0n, 0n] })).toEqual({
      status: "available",
      beneficiary: ME,
      total: 2_000n,
      items: [{ dialect: "governor", session: 5n, round: 0n, listIndex: 0n, amount: 2_000n }],
    });
  });

  it("F1 D-47: a session that belongs to another dispute is invalid data, never a reward", async () => {
    const { context: ctx } = context(
      { head: 1_000n, calls: [sessionState(1n, RESOLVED, 98n), roundInfo(5n, 0n, [[3_000n, 2_000n], [true, true], 4_000n, 5_000n]), contributions(5n, 0n, [1_500n, 0n])] },
      await governorFamily(),
      { evidenceGroupId: 5n },
    );
    expect(await readWithdrawable(ctx, { beneficiary: ME, rounds: [0n], roundStartBlocks: [0n] })).toMatchObject({ status: "unavailable", error: { code: "invalid-data" } });
  });

  it("D-47: without the Dispute event's evidence group the session is unknown", async () => {
    const { context: ctx, requests } = context({ head: 1_000n }, await governorFamily());
    expect(await readWithdrawable(ctx, { beneficiary: ME, rounds: [0n], roundStartBlocks: [0n] })).toMatchObject({ status: "unavailable", error: { code: "not-found" } });
    expect(requests.methods).toEqual([]);
  });
});
