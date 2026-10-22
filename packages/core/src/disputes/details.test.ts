import { numberToHex, toFunctionSelector } from "viem";
import { describe, expect, it } from "vitest";
import { lookupDispute, readAppealDecisions, readDisputeDetails } from ".";
import type { ArbitratedBinding, ArbitratorDispute } from "./types";
import { appealDecisionLog, fakeClient, MAINNET, recordedDetection, recordedNode, rpcError } from "../test/disputes/testHelpers";
import type { FakeNode } from "../test/disputes/testHelpers";

const GET_DISPUTE = toFunctionSelector("getDispute(uint256)").slice(2);
const DISPUTES = toFunctionSelector("disputes(uint256)").slice(2);
const APPEAL_COST = toFunctionSelector("appealCost(uint256,bytes)").slice(2);
const APPEAL_PERIOD = toFunctionSelector("appealPeriod(uint256)").slice(2);
const CURRENT_RULING = toFunctionSelector("currentRuling(uint256)").slice(2);
const MAINNET_DEPLOY_BLOCK = 7303699n;
/** Block of the recorded ERC-1497 Dispute event of mainnet 1454 (`evidence/__fixtures__/mainnet-1454-505.json`). */
const DISPUTE_1454_EVENT_BLOCK = 0xf9ad5an;

function recordedTimestamp(blockNumber: bigint): number {
  const timestamp = MAINNET.timestamps[numberToHex(blockNumber)];
  if (timestamp === undefined) throw new Error(`no recorded timestamp for block ${blockNumber.toString()}`);
  return Number(BigInt(timestamp));
}

function selectorOf(key: string): string {
  return key.split(":0x")[1]?.slice(0, 8) ?? "";
}

async function found(disputeId: bigint, node: FakeNode = recordedNode(MAINNET)): Promise<{ dispute: ArbitratorDispute; binding: ArbitratedBinding }> {
  const { client } = fakeClient(node);
  const lookup = await lookupDispute({ chainId: 1, client }, disputeId);
  if (lookup.status !== "found") throw new Error(`dispute ${String(disputeId)} not found`);
  return { dispute: lookup.dispute, binding: lookup.binding };
}

describe("readDisputeDetails", () => {
  it("reads votesLengths, the current ruling, the appeal decisions, the local ID and, in execution, the appeal info (mainnet 328)", async () => {
    const dispute = await found(328n);
    const family = await recordedDetection(1, dispute.binding.arbitrated);
    const { client } = fakeClient(recordedNode(MAINNET));
    const reads = await readDisputeDetails({ chainId: 1, client }, dispute, family, null);
    expect(reads.dispute).toBe(dispute.dispute);
    expect(reads.binding).toBe(dispute.binding);
    expect(reads.votesLengths).toEqual({ ok: true, value: [3n, 7n, 15n, 31n] });
    expect(reads.currentRuling).toEqual({ ok: true, value: 2n });
    expect(reads.localId).toEqual({ kind: "local-id", value: 51n });
    expect(reads.appealInfo).toEqual({ ok: true, value: { appealCost: 340200000000000000n, appealPeriodStart: 0, appealPeriodEnd: 0 } });
    expect(reads.appealDecisions).toEqual({
      ok: true,
      value: [
        { blockNumber: 10659157n, appealedAt: recordedTimestamp(10659157n) },
        { blockNumber: 10717404n, appealedAt: recordedTimestamp(10717404n) },
        { blockNumber: 10773369n, appealedAt: recordedTimestamp(10773369n) },
      ],
    });
  });

  it("reads getDispute once and never reads the Ruling event or a second dispute struct", async () => {
    const dispute = await found(1454n);
    const family = await recordedDetection(1, dispute.binding.arbitrated);
    const { client, requests } = fakeClient(recordedNode(MAINNET));
    await readDisputeDetails({ chainId: 1, client }, dispute, family, DISPUTE_1454_EVENT_BLOCK);
    const selectors = requests.calls.map(selectorOf);
    expect(selectors.filter((selector) => selector === GET_DISPUTE)).toHaveLength(1);
    expect(selectors).not.toContain(DISPUTES);
    expect(requests.logs).toHaveLength(1);
    expect(requests.logs[0]?.address).toBe(MAINNET.arbitrator);
  });

  it("starts the AppealDecision scan at the Dispute event's block when known", async () => {
    const dispute = await found(1454n);
    const { client, requests } = fakeClient(recordedNode(MAINNET));
    await readDisputeDetails({ chainId: 1, client }, dispute, undefined, DISPUTE_1454_EVENT_BLOCK);
    expect(requests.logs[0]).toMatchObject({ fromBlock: DISPUTE_1454_EVENT_BLOCK, toBlock: MAINNET.readAtBlock });
  });

  it("without the Dispute event the AppealDecision scan starts at the arbitrator's deployment block", async () => {
    const dispute = await found(1454n);
    const { client, requests } = fakeClient(recordedNode(MAINNET));
    await readDisputeDetails({ chainId: 1, client }, dispute, undefined, null);
    expect(requests.logs[0]?.fromBlock).toBe(MAINNET_DEPLOY_BLOCK);
  });

  it("reads appealCost and appealPeriod only in periods 3 and 4", async () => {
    const executed = await found(1454n);
    const inVote = { ...executed, dispute: { ...executed.dispute, period: 2 as const } };
    const { client, requests } = fakeClient(recordedNode(MAINNET));
    const reads = await readDisputeDetails({ chainId: 1, client }, inVote, undefined, null);
    expect(reads.appealInfo).toBeNull();
    const selectors = requests.calls.map(selectorOf);
    expect(selectors).not.toContain(APPEAL_COST);
    expect(selectors).not.toContain(APPEAL_PERIOD);
  });

  it("a failing getDispute leaves the other reads intact", async () => {
    const dispute = await found(328n);
    const family = await recordedDetection(1, dispute.binding.arbitrated);
    const node = recordedNode(MAINNET);
    const calls = new Map(node.calls);
    for (const key of calls.keys()) if (selectorOf(key) === GET_DISPUTE) calls.set(key, { error: { code: -32000, message: "header not found" } });
    const { client } = fakeClient({ ...node, calls });
    const reads = await readDisputeDetails({ chainId: 1, client }, dispute, family, null);
    expect(reads.votesLengths).toMatchObject({ ok: false, error: { code: "rpc-error" } });
    expect(reads.currentRuling).toEqual({ ok: true, value: 2n });
    expect(reads.localId).toEqual({ kind: "local-id", value: 51n });
    expect(reads.appealDecisions.ok).toBe(true);
    expect(reads.appealInfo?.ok).toBe(true);
  });

  it("a failing currentRuling read leaves the other reads intact and is never read as ruling 0", async () => {
    const dispute = await found(328n);
    const family = await recordedDetection(1, dispute.binding.arbitrated);
    const node = recordedNode(MAINNET);
    const calls = new Map(node.calls);
    for (const key of calls.keys()) if (selectorOf(key) === CURRENT_RULING) calls.set(key, { error: { code: -32000, message: "header not found" } });
    const { client } = fakeClient({ ...node, calls });
    const reads = await readDisputeDetails({ chainId: 1, client }, dispute, family, null);
    expect(reads.currentRuling).toMatchObject({ ok: false, error: { code: "rpc-error" } });
    expect(reads.currentRuling).not.toHaveProperty("value");
    expect(reads.votesLengths).toEqual({ ok: true, value: [3n, 7n, 15n, 31n] });
    expect(reads.localId).toEqual({ kind: "local-id", value: 51n });
    expect(reads.appealDecisions.ok).toBe(true);
    expect(reads.appealInfo?.ok).toBe(true);
  });

  it("a failing log scan degrades only the appeal decisions", async () => {
    const dispute = await found(1454n);
    const { client } = fakeClient(recordedNode(MAINNET, { failing: { eth_getLogs: rpcError(-32000, "header not found") } }));
    const reads = await readDisputeDetails({ chainId: 1, client }, dispute, undefined, null);
    expect(reads.appealDecisions).toMatchObject({ ok: false, error: { code: "rpc-error" } });
    expect(reads.votesLengths).toEqual({ ok: true, value: [10n] });
    expect(reads.currentRuling).toEqual({ ok: true, value: 0n });
  });

  it("a reverted read keeps its kind (reverted), not a fake value", async () => {
    const dispute = await found(1454n);
    const node = recordedNode(MAINNET);
    const calls = new Map(node.calls);
    for (const key of calls.keys()) if (selectorOf(key) === APPEAL_COST) calls.set(key, { error: { code: 3, message: "execution reverted" } });
    const { client } = fakeClient({ ...node, calls });
    const reads = await readDisputeDetails({ chainId: 1, client }, dispute, undefined, null);
    expect(reads.appealInfo).toMatchObject({ ok: false, error: { code: "reverted" } });
  });

  it("without a known family the local ID is not read and stays unresolved", async () => {
    const dispute = await found(1454n);
    const { client, requests } = fakeClient(recordedNode(MAINNET));
    const reads = await readDisputeDetails({ chainId: 1, client }, dispute, undefined, null);
    expect(reads.localId).toEqual({ kind: "unresolved", reason: "rpc-error" });
    expect(requests.calls.some((key) => key.startsWith(dispute.binding.arbitrated))).toBe(false);
  });

  it("without a read RPC every read is unavailable with no-rpc", async () => {
    const dispute = await found(1454n);
    const reads = await readDisputeDetails({ chainId: 1, client: undefined }, dispute, undefined, null);
    expect(reads.votesLengths).toMatchObject({ ok: false, error: { code: "no-rpc" } });
    expect(reads.currentRuling).toMatchObject({ ok: false, error: { code: "no-rpc" } });
    expect(reads.appealDecisions).toMatchObject({ ok: false, error: { code: "no-rpc" } });
    expect(reads.appealInfo).toMatchObject({ ok: false, error: { code: "no-rpc" } });
    expect(reads.localId).toEqual({ kind: "unresolved", reason: "rpc-error" });
    for (const outcome of [reads.votesLengths, reads.currentRuling, reads.appealDecisions, reads.appealInfo]) {
      expect(outcome).toMatchObject({ ok: false, error: { message: "This network's data is unavailable." } });
      if (outcome?.ok === false) expect(outcome.error.message).not.toMatch(/configur|RPC|REACT_APP/i);
    }
  });
});

describe("readAppealDecisions", () => {
  it("reads AppealDecision(id) from the given block to the head, with one block read per distinct block", async () => {
    const dispute = await found(1454n);
    const { arbitrator, arbitrated, disputeId } = dispute.binding;
    const node: FakeNode = {
      head: 500n,
      calls: new Map(),
      logs: [
        appealDecisionLog(arbitrator, disputeId, arbitrated, 120n, 1),
        appealDecisionLog(arbitrator, disputeId, arbitrated, 120n, 4),
        appealDecisionLog(arbitrator, disputeId + 1n, arbitrated, 130n),
        appealDecisionLog(arbitrator, disputeId, arbitrated, 90n),
        appealDecisionLog(arbitrator, disputeId, arbitrated, 300n),
      ],
      timestamps: { "0x78": "0x64", "0x12c": "0xc8" },
    };
    const { client, requests } = fakeClient(node);
    const decisions = await readAppealDecisions({ chainId: 1, client }, dispute.binding, 100n);
    expect(decisions).toEqual({
      ok: true,
      value: [
        { blockNumber: 120n, appealedAt: 100 },
        { blockNumber: 120n, appealedAt: 100 },
        { blockNumber: 300n, appealedAt: 200 },
      ],
    });
    expect(requests.logs[0]).toMatchObject({ fromBlock: 100n, toBlock: 500n });
    expect(requests.blocks).toEqual([120n, 300n]);
  });

  it("a missing block is a failed read, not an appeal at time 0", async () => {
    const dispute = await found(1454n);
    const { arbitrator, arbitrated, disputeId } = dispute.binding;
    const node: FakeNode = { head: 500n, calls: new Map(), logs: [appealDecisionLog(arbitrator, disputeId, arbitrated, 120n)], timestamps: {} };
    const { client } = fakeClient(node);
    expect((await readAppealDecisions({ chainId: 1, client }, dispute.binding, 0n)).ok).toBe(false);
  });

  it("an aborted scan is a failed read", async () => {
    const dispute = await found(1454n);
    const controller = new AbortController();
    controller.abort();
    const { client, requests } = fakeClient(recordedNode(MAINNET));
    const decisions = await readAppealDecisions({ chainId: 1, client, signal: controller.signal }, dispute.binding, 0n);
    expect(decisions).toMatchObject({ ok: false, error: { code: "rpc-error" } });
    expect(requests.logs).toEqual([]);
  });
});
