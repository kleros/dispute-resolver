import { numberToHex, pad } from "viem";
import { describe, expect, it } from "vitest";
import { CHAINS } from "../chains";
import type { Address, ReadClient } from "../types";
import { scanEvidenceLogs } from "./events";
import { evidenceScanStart, readDisputeEvent, readMetaEvidenceEvent } from "./index";
import { disputeLog, fakeClient, recordedDispute, recordedNode, RECORDED, rpcError, type RpcLog } from "../test/evidence/testHelpers";
import { chainOf } from "../test/chains/testHelpers";

const ARBITRATOR = RECORDED.arbitrator;
const DISPUTE_1454 = recordedDispute(1454n);
const DISPUTE_505 = recordedDispute(505n);
const OTHER_ARBITRABLE: Address = "0x1111111111111111111111111111111111111111";

function readRecorded(disputeId: bigint, arbitrable: Address, node = recordedNode()) {
  const { client, requests } = fakeClient(node);
  const result = readDisputeEvent({ client, arbitrable, arbitrator: ARBITRATOR, disputeId, fromBlock: RECORDED.scanFromBlock });
  return { result, requests };
}

function syntheticDispute(blockNumber: bigint, logIndex: number): RpcLog {
  return disputeLog({ arbitrable: OTHER_ARBITRABLE, arbitrator: ARBITRATOR, disputeId: 7n, metaEvidenceId: 3n, evidenceGroupId: 9n, blockNumber, logIndex });
}

describe("readDisputeEvent", () => {
  it("reads the recorded Dispute event of mainnet 1454 with its block time as the creation time, filtering on both indexed arguments on the arbitrable", async () => {
    const { result, requests } = readRecorded(1454n, DISPUTE_1454.arbitrable);
    const recorded = DISPUTE_1454.disputeLogs[0];
    if (recorded === undefined) throw new Error("fixture has no Dispute log");
    expect(await result).toEqual({
      ok: true,
      value: {
        status: "found",
        event: {
          metaEvidenceId: 0n,
          evidenceGroupId: 0n,
          blockNumber: BigInt(recorded.blockNumber),
          createdAt: Number(DISPUTE_1454.timestamps[recorded.blockNumber]),
          transactionHash: recorded.transactionHash,
        },
      },
    });
    expect(requests.logs).toHaveLength(1);
    expect(requests.logs[0]?.address).toBe(DISPUTE_1454.arbitrable);
    expect(requests.logs[0]?.topics).toEqual([recorded.topics[0], pad(ARBITRATOR), numberToHex(1454n, { size: 32 })]);
  });

  it("reads the recorded Dispute event of mainnet 505, whose evidence group equals its meta-evidence ID", async () => {
    const { result } = readRecorded(505n, DISPUTE_505.arbitrable);
    const outcome = await result;
    expect(outcome.ok && outcome.value.status === "found" && outcome.value.event).toMatchObject({ metaEvidenceId: 57n, evidenceGroupId: 57n });
  });

  it("zero Dispute logs are reported as not-found, not thrown", async () => {
    const { result } = readRecorded(1453n, DISPUTE_1454.arbitrable);
    expect(await result).toEqual({ ok: true, value: { status: "not-found" } });
  });

  it("several Dispute logs are reported as ambiguous with their count, not thrown", async () => {
    const node = recordedNode({ logs: [syntheticDispute(100n, 1), syntheticDispute(200n, 4)], timestamps: {} });
    const { client } = fakeClient(node);
    const outcome = await readDisputeEvent({ client, arbitrable: OTHER_ARBITRABLE, arbitrator: ARBITRATOR, disputeId: 7n, fromBlock: 0n });
    expect(outcome).toEqual({ ok: true, value: { status: "ambiguous", count: 2 } });
  });

  it("a Dispute log whose data does not decode is invalid-data, not a crash", async () => {
    const broken: RpcLog = { ...syntheticDispute(100n, 1), data: "0x1234" };
    const { client } = fakeClient(recordedNode({ logs: [broken], timestamps: { [numberToHex(100n)]: "0x10" } }));
    const outcome = await readDisputeEvent({ client, arbitrable: OTHER_ARBITRABLE, arbitrator: ARBITRATOR, disputeId: 7n, fromBlock: 0n });
    expect(outcome.ok).toBe(false);
    expect(!outcome.ok && outcome.error.code).toBe("invalid-data");
  });

  it("a failed log read degrades to rpc-error without leaking the node's message", async () => {
    const secret = "https://mainnet.example/v3/SECRET-KEY";
    const { result } = readRecorded(1454n, DISPUTE_1454.arbitrable, recordedNode({ failing: { eth_getLogs: rpcError(-32000, secret) } }));
    const outcome = await result;
    expect(outcome.ok).toBe(false);
    expect(!outcome.ok && outcome.error.code).toBe("rpc-error");
    expect(!outcome.ok && outcome.error.message).not.toContain("SECRET-KEY");
  });

  it("a failed head read or block read degrades to rpc-error", async () => {
    for (const method of ["eth_blockNumber", "eth_getBlockByNumber"]) {
      const { result } = readRecorded(1454n, DISPUTE_1454.arbitrable, recordedNode({ failing: { [method]: rpcError(-32000, "down") } }));
      const outcome = await result;
      expect(!outcome.ok && outcome.error.code).toBe("rpc-error");
    }
  });

  it("an aborted read degrades to rpc-error instead of rejecting", async () => {
    const { client, requests } = fakeClient(recordedNode());
    const controller = new AbortController();
    controller.abort();
    const outcome = await readDisputeEvent({
      client,
      arbitrable: DISPUTE_1454.arbitrable,
      arbitrator: ARBITRATOR,
      disputeId: 1454n,
      fromBlock: RECORDED.scanFromBlock,
      signal: controller.signal,
    });
    expect(!outcome.ok && outcome.error.code).toBe("rpc-error");
    expect(requests.logs).toHaveLength(0);
  });

  it("a node that caps log ranges is scanned in windows and still finds the event", async () => {
    const recorded = DISPUTE_1454.disputeLogs[0];
    if (recorded === undefined) throw new Error("fixture has no Dispute log");
    const fromBlock = BigInt(recorded.blockNumber) - 25_000n;
    const node = recordedNode({ head: BigInt(recorded.blockNumber) + 25_000n, maxLogRange: 10_000n });
    const { client, requests } = fakeClient(node);
    const outcome = await readDisputeEvent({ client, arbitrable: DISPUTE_1454.arbitrable, arbitrator: ARBITRATOR, disputeId: 1454n, fromBlock });
    expect(outcome.ok && outcome.value.status).toBe("found");
    expect(requests.logs.length).toBeGreaterThan(1);
  });
});

describe("event scans", () => {
  const scan = { arbitrable: OTHER_ARBITRABLE, arbitrator: ARBITRATOR, fromBlock: RECORDED.scanFromBlock };
  it.each([
    ["readDisputeEvent", (client: ReadClient, signal: AbortSignal) => readDisputeEvent({ ...scan, client, disputeId: 7n, signal })],
    ["readMetaEvidenceEvent", (client: ReadClient, signal: AbortSignal) => readMetaEvidenceEvent({ ...scan, client, metaEvidenceId: 3n, signal })],
    ["scanEvidenceLogs", (client: ReadClient, signal: AbortSignal) => scanEvidenceLogs({ ...scan, client, evidenceGroupId: 9n, signal })],
  ])("%s sends no log request when aborted after the head read", async (_reader, read) => {
    const controller = new AbortController();
    const { client, requests } = fakeClient(recordedNode());
    const abortingClient: ReadClient = {
      ...client,
      getBlockNumber: async () => {
        controller.abort();
        return client.getBlockNumber();
      },
    };
    await read(abortingClient, controller.signal).catch(() => undefined);
    expect(requests.logs).toHaveLength(0);
  });
});

describe("Evidence and Dispute-event scan start", () => {
  const chainsWithArbitrator = Object.values(CHAINS).filter((chain) => chain.klerosLiquid !== undefined);

  it("a chain scans from its arbitrator deployment block, or from block 0 without one", () => {
    expect(evidenceScanStart(chainOf(1))).toBe(7_303_699n);
    expect(evidenceScanStart({ ...chainOf(1), arbitratorDeployedAtBlock: undefined })).toBe(0n);
  });

  it("the Dispute and Evidence scans run from the scan start to the head, never from head − lookback", async () => {
    for (const chain of chainsWithArbitrator) {
      const fromBlock = evidenceScanStart(chain);
      const head = fromBlock + BigInt(chain.maxLookback) * 10n;
      const { client, requests } = fakeClient(recordedNode({ head, logs: [], timestamps: {} }));
      await readDisputeEvent({ client, arbitrable: OTHER_ARBITRABLE, arbitrator: ARBITRATOR, disputeId: 7n, fromBlock });
      await scanEvidenceLogs({ client, arbitrable: OTHER_ARBITRABLE, arbitrator: ARBITRATOR, evidenceGroupId: 9n, fromBlock });
      expect(requests.logs.map((request) => [request.fromBlock, request.toBlock])).toEqual([
        [fromBlock, head],
        [fromBlock, head],
      ]);
    }
  });
});

describe("scanEvidenceLogs", () => {
  it("reads the recorded Evidence logs of mainnet 505 in chain order with lowercase submitters", async () => {
    const { client, requests } = fakeClient(recordedNode());
    const { logs } = await scanEvidenceLogs({
      client,
      arbitrable: DISPUTE_505.arbitrable,
      arbitrator: ARBITRATOR,
      evidenceGroupId: 57n,
      fromBlock: RECORDED.scanFromBlock,
    });
    expect(logs).toHaveLength(5);
    expect(logs.map((log) => [log.blockNumber, log.logIndex])).toEqual(DISPUTE_505.evidenceLogs.map((log) => [BigInt(log.blockNumber), Number(log.logIndex)]));
    expect(logs.map((log) => log.submitter)).toEqual(DISPUTE_505.evidenceLogs.map((log) => `0x${(log.topics[3] ?? "").slice(26)}`));
    expect(logs.every((log) => log.submitter === log.submitter.toLowerCase())).toBe(true);
    expect(logs[0]?.evidenceUri).toBe("/ipfs/QmPiLHsHHhzfWDaSYWXjaANAJyY2hU9VBPt7Txc94SCTsA/evidence.json");
    expect(requests.logs[0]?.topics).toEqual([DISPUTE_505.evidenceLogs[0]?.topics[0], pad(ARBITRATOR), numberToHex(57n, { size: 32 }), null]);
  });
});
