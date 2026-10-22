import { numberToHex, pad, toEventSelector } from "viem";
import { describe, expect, it } from "vitest";
import { erc1497Abi } from "../abi";
import type { Address } from "../types";
import { readMetaEvidenceEvent } from "./index";
import { fakeClient, metaEvidenceLog, recordedGnosisDispute, recordedGnosisNode, RECORDED_GNOSIS, rpcError, type FakeNode, type RpcLog } from "../test/evidence/testHelpers";

const DISPUTE_460 = recordedGnosisDispute(460n);
const DISPUTE_863 = recordedGnosisDispute(863n);
const SYNTHETIC: Address = "0x1111111111111111111111111111111111111111";
const META_EVIDENCE_SELECTOR = toEventSelector(erc1497Abi[0]);

function read(arbitrable: Address, metaEvidenceId: bigint, node: FakeNode = recordedGnosisNode(), fromBlock = RECORDED_GNOSIS.scanFromBlock, signal?: AbortSignal) {
  const { client, requests } = fakeClient(node);
  return { result: readMetaEvidenceEvent({ client, arbitrable, metaEvidenceId, fromBlock, signal }), requests };
}

function synthetic(uri: string, blockNumber: bigint, logIndex: number): RpcLog {
  return metaEvidenceLog({ arbitrable: SYNTHETIC, metaEvidenceId: 5n, uri, blockNumber, logIndex });
}

function syntheticNode(logs: readonly RpcLog[], overrides: Partial<FakeNode> = {}): FakeNode {
  return { head: 1_000_000n, logs, timestamps: {}, ...overrides };
}

describe("readMetaEvidenceEvent", () => {
  it("reads the recorded MetaEvidence(84) log of Gnosis 460 from the arbitrable, filtered on the selector and the ID", async () => {
    const { result, requests } = read(DISPUTE_460.arbitrable, 84n);
    const [recorded] = DISPUTE_460.metaEvidenceLogs;
    if (recorded === undefined) throw new Error("fixture has no MetaEvidence log");
    expect(await result).toEqual({
      ok: true,
      value: {
        status: "found",
        event: {
          uri: "/ipfs/QmbtSnH8BB3cgDLwtY6aT7fggnzhyEMVHExqsiVPjBxmcz/metaEvidence.json",
          blockNumber: 40_176_860n,
          logIndex: 3,
          transactionHash: recorded.transactionHash,
          emissions: 1,
        },
      },
    });
    expect(recorded.transactionHash.startsWith("0x58c509e0")).toBe(true);
    expect(requests.logs).toHaveLength(1);
    expect(requests.logs[0]?.address).toBe(DISPUTE_460.arbitrable);
    expect(requests.logs[0]?.topics).toEqual([META_EVIDENCE_SELECTOR, pad(numberToHex(84n))]);
    expect(requests.logs[0]?.fromBlock).toBe(16_895_601n);
    expect(requests.logs[0]?.toBlock).toBe(RECORDED_GNOSIS.readAtBlock);
  });

  it("several emissions of one ID: the latest by block and log index wins (Gnosis 863's re-emitted https URL)", async () => {
    const { result } = read(DISPUTE_863.arbitrable, 0n);
    const outcome = await result;
    expect(outcome.ok && outcome.value.status === "found" && outcome.value.event).toMatchObject({
      uri: "https://cdn.kleros.link/ipfs/bafkreigi53smvtvoi2s5zh3wd5ztu7pzl4lao5v4y7xihd3bjrpwtuyk2a",
      blockNumber: 47_029_860n,
      logIndex: 49,
      emissions: 2,
    });
  });

  it("the latest emission wins over an older one in the same block by log index", async () => {
    const node = syntheticNode([synthetic("/ipfs/QmLater/meta.json", 500n, 7), synthetic("/ipfs/QmEarlier/meta.json", 500n, 2)]);
    const { result } = read(SYNTHETIC, 5n, node, 0n);
    const outcome = await result;
    expect(outcome.ok && outcome.value.status === "found" && outcome.value.event).toMatchObject({ uri: "/ipfs/QmLater/meta.json", logIndex: 7, emissions: 2 });
  });

  it("zero logs are not-found, a failed read is rpc-error without the node's message, an undecodable latest log is invalid-data, an aborted read is rpc-error", async () => {
    const none = read(SYNTHETIC, 5n, syntheticNode([]), 0n);
    expect(await none.result).toEqual({ ok: true, value: { status: "not-found" } });

    const secret = "https://gnosis.example/v3/SECRET-KEY";
    const failed = await read(DISPUTE_460.arbitrable, 84n, recordedGnosisNode({ failing: { eth_getLogs: rpcError(-32000, secret) } })).result;
    expect(!failed.ok && failed.error.code).toBe("rpc-error");
    expect(!failed.ok && failed.error.message).not.toContain("SECRET-KEY");

    const older = synthetic("/ipfs/QmOlder/meta.json", 400n, 0);
    const broken: RpcLog = { ...synthetic("/ipfs/QmBroken/meta.json", 500n, 0), data: "0x1234" };
    const undecodable = await read(SYNTHETIC, 5n, syntheticNode([older, broken]), 0n).result;
    expect(!undecodable.ok && undecodable.error.code).toBe("invalid-data");

    const aborted = read(DISPUTE_460.arbitrable, 84n, recordedGnosisNode(), RECORDED_GNOSIS.scanFromBlock, AbortSignal.abort());
    const abortedOutcome = await aborted.result;
    expect(!abortedOutcome.ok && abortedOutcome.error.code).toBe("rpc-error");
    expect(aborted.requests.logs).toHaveLength(0);
  });

  it("a MetaEvidence emission older than the arbitrator's deployment is found by the second pass over the blocks before it", async () => {
    const fromBlock = 16_895_601n;
    const node = syntheticNode([synthetic("/ipfs/QmBeforeDeployment/meta.json", fromBlock - 1_000n, 0)], { head: 20_000_000n });
    const { result, requests } = read(SYNTHETIC, 5n, node, fromBlock);
    const outcome = await result;
    expect(outcome.ok && outcome.value.status === "found" && outcome.value.event).toMatchObject({
      uri: "/ipfs/QmBeforeDeployment/meta.json",
      blockNumber: fromBlock - 1_000n,
      emissions: 1,
    });
    expect(requests.logs.map((request) => [request.fromBlock, request.toBlock])).toEqual([
      [fromBlock, 20_000_000n],
      [0n, fromBlock - 1n],
    ]);
  });

  it("no second pass when the first finds a log, and none when fromBlock is 0", async () => {
    const found = read(SYNTHETIC, 5n, syntheticNode([synthetic("/ipfs/QmAfter/meta.json", 900_000n, 0)]), 800_000n);
    await found.result;
    expect(found.requests.logs).toHaveLength(1);

    const fromZero = read(SYNTHETIC, 5n, syntheticNode([]), 0n);
    expect(await fromZero.result).toEqual({ ok: true, value: { status: "not-found" } });
    expect(fromZero.requests.logs.map((request) => [request.fromBlock, request.toBlock])).toEqual([[0n, 1_000_000n]]);
  });
});
