import { createPublicClient, custom, encodeEventTopics, maxUint256, numberToHex, pad, toEventSelector } from "viem";
import { describe, expect, it } from "vitest";
import { erc792Abi } from "../abi";
import type { Address, Hex } from "../types";
import { lookupDispute, readExecutedRuling } from ".";
import type { ArbitratedBinding, ArbitratorDispute } from "./types";
import { EXECUTION_GNOSIS, EXECUTION_MAINNET, executionNode, fakeClient, rpcError, rulingLog } from "../test/disputes/testHelpers";
import type { ExecutionRecording, FakeNode } from "../test/disputes/testHelpers";
import { rpcLog, type RpcLog } from "../test/rpc/testHelpers";

const RULING_TOPIC = toEventSelector("Ruling(address,uint256,uint256)");
const APPEAL_DECISION_TOPIC = toEventSelector("AppealDecision(uint256,address)");
const CREATION_TOPIC = toEventSelector("DisputeCreation(uint256,address)");

interface Found {
  readonly dispute: ArbitratorDispute;
  readonly binding: ArbitratedBinding;
  /** The block the last round started at: the last AppealDecision, else the DisputeCreation. */
  readonly fromBlock: bigint;
}

function topicOf(disputeId: bigint): Hex {
  return pad(numberToHex(disputeId), { size: 32 });
}

function lastRoundStart(recording: ExecutionRecording, disputeId: bigint): bigint {
  const ofDispute = (topic: Hex) => recording.logs.filter((log) => log.topics[0] === topic && log.topics[1] === topicOf(disputeId));
  const [lastAppeal] = ofDispute(APPEAL_DECISION_TOPIC).slice(-1);
  const [creation] = ofDispute(CREATION_TOPIC);
  const start = lastAppeal ?? creation;
  if (start === undefined) throw new Error(`no recorded start for dispute ${String(disputeId)}`);
  return BigInt(start.blockNumber);
}

async function found(recording: ExecutionRecording, disputeId: bigint): Promise<Found> {
  const { client } = fakeClient(executionNode(recording));
  const lookup = await lookupDispute({ chainId: recording.chainId, client }, disputeId);
  if (lookup.status !== "found") throw new Error(`dispute ${String(disputeId)} not found`);
  return { dispute: lookup.dispute, binding: lookup.binding, fromBlock: lastRoundStart(recording, disputeId) };
}

/** The recorded logs without the arbitrable's Ruling logs, plus `extra`. */
function withRulingLogs(recording: ExecutionRecording, extra: readonly RpcLog[]): readonly RpcLog[] {
  return [...recording.logs.filter((log) => log.topics[0] !== RULING_TOPIC), ...extra];
}

async function read(recording: ExecutionRecording, disputeId: bigint, node: FakeNode = executionNode(recording)) {
  const subject = await found(recording, disputeId);
  const { client, requests } = fakeClient(node);
  const executed = await readExecutedRuling({ chainId: recording.chainId, client }, subject);
  return { executed, requests, subject };
}

describe("readExecutedRuling", () => {
  it.each([
    ["a Light Curate clone that executed the second option after a tied appeal round", EXECUTION_GNOSIS, 939n],
    ["Proof of Humanity after a three-way tie", EXECUTION_MAINNET, 1495n],
    ["Proof of Humanity after a tie with one juror absent", EXECUTION_MAINNET, 1530n],
    ["an Unslashed tie the funded option won", EXECUTION_MAINNET, 1678n],
  ])("reads the ruling the arbitrable executed when it differs from the court's ruling: %s", async (_, recording, disputeId) => {
    const { executed, subject } = await read(recording, disputeId);
    expect(subject.dispute).toMatchObject({ period: 4, ruled: true });
    expect(executed).toEqual({ status: "executed", ruling: 2n });
  });

  it("reads a ruling equal to the court's ruling the same way", async () => {
    const { executed } = await read(EXECUTION_MAINNET, 150n);
    expect(executed).toEqual({ status: "executed", ruling: 0n });
  });

  it("scans only the arbitrable the arbitrator names, for this arbitrator and dispute, from the given block to the head", async () => {
    const { requests, subject } = await read(EXECUTION_GNOSIS, 939n);
    expect(subject.fromBlock).toBe(47822191n);
    expect(requests.logs).toEqual([
      {
        address: subject.binding.arbitrated,
        topics: [RULING_TOPIC, pad(subject.binding.arbitrator), topicOf(939n)],
        fromBlock: 47822191n,
        toBlock: EXECUTION_GNOSIS.readAtBlock,
      },
    ]);
  });

  it("does not read logs while the court has not executed the ruling", async () => {
    for (const disputeId of [108n, 1684n]) {
      const { executed, requests, subject } = await read(EXECUTION_MAINNET, disputeId);
      expect(subject.dispute).toMatchObject({ period: 4, ruled: false });
      expect(executed).toEqual({ status: "not-executed" });
      expect(requests.methods).toEqual([]);
    }
  });

  it("does not read logs before the execution period", async () => {
    const subject = await found(EXECUTION_GNOSIS, 939n);
    const { client, requests } = fakeClient(executionNode(EXECUTION_GNOSIS));
    const executed = await readExecutedRuling({ chainId: 100, client }, { ...subject, dispute: { ...subject.dispute, period: 3 } });
    expect(executed).toEqual({ status: "not-executed" });
    expect(requests.methods).toEqual([]);
  });

  it("reports no executed ruling when the arbitrable emitted no Ruling event", async () => {
    const { executed } = await read(EXECUTION_GNOSIS, 939n, executionNode(EXECUTION_GNOSIS, { logs: withRulingLogs(EXECUTION_GNOSIS, []) }));
    expect(executed).toEqual({ status: "none-reported" });
  });

  it("treats different executed rulings as inconsistent", async () => {
    const subject = await found(EXECUTION_GNOSIS, 939n);
    const { arbitrated, arbitrator } = subject.binding;
    const logs = withRulingLogs(EXECUTION_GNOSIS, [rulingLog(arbitrated, arbitrator, 939n, 2n, 47_973_792n), rulingLog(arbitrated, arbitrator, 939n, 1n, 47_973_800n)]);
    const { executed } = await read(EXECUTION_GNOSIS, 939n, executionNode(EXECUTION_GNOSIS, { logs }));
    expect(executed).toEqual({ status: "inconsistent" });
  });

  it("counts repeated reports of the same ruling once", async () => {
    const subject = await found(EXECUTION_GNOSIS, 939n);
    const { arbitrated, arbitrator } = subject.binding;
    const repeated = [1, 2, 3].map((index) => rulingLog(arbitrated, arbitrator, 939n, 2n, 47_973_792n + BigInt(index), index));
    const { executed } = await read(EXECUTION_GNOSIS, 939n, executionNode(EXECUTION_GNOSIS, { logs: [...EXECUTION_GNOSIS.logs, ...repeated] }));
    expect(executed).toEqual({ status: "executed", ruling: 2n });
  });

  it("treats more Ruling events than the cap as inconsistent and stops the scan", async () => {
    const subject = await found(EXECUTION_GNOSIS, 939n);
    const { arbitrated, arbitrator } = subject.binding;
    const flood = Array.from({ length: 9 }, (_, index) => rulingLog(arbitrated, arbitrator, 939n, 2n, 47_900_000n + BigInt(index) * 20_000n, index));
    const { executed, requests } = await read(EXECUTION_GNOSIS, 939n, executionNode(EXECUTION_GNOSIS, { logs: withRulingLogs(EXECUTION_GNOSIS, flood), maxRange: 10_000n }));
    expect(executed).toEqual({ status: "inconsistent" });
    const windows = requests.logs.slice(1);
    const lastWindow = windows.at(-1);
    expect(lastWindow?.toBlock ?? 0n).toBeLessThan(EXECUTION_GNOSIS.readAtBlock);
  });

  it("treats an undecodable Ruling event as inconsistent", async () => {
    const subject = await found(EXECUTION_GNOSIS, 939n);
    const { arbitrated, arbitrator } = subject.binding;
    const topics = encodeEventTopics({ abi: erc792Abi, eventName: "Ruling", args: { _arbitrator: arbitrator, _disputeID: 939n } }) as Hex[];
    const undecodable = rpcLog({ address: arbitrated, topics, data: "0x", blockNumber: 47_973_792n, logIndex: 0 });
    const { executed } = await read(EXECUTION_GNOSIS, 939n, executionNode(EXECUTION_GNOSIS, { logs: withRulingLogs(EXECUTION_GNOSIS, [undecodable]) }));
    expect(executed).toEqual({ status: "inconsistent" });
  });

  it("ignores logs a node returns for another contract, arbitrator or dispute", async () => {
    const subject = await found(EXECUTION_GNOSIS, 939n);
    const { arbitrated, arbitrator } = subject.binding;
    const other: Address = "0x00000000000000000000000000000000000000ee";
    const answered = [
      rulingLog(arbitrated, arbitrator, 939n, 2n, 47_973_792n),
      rulingLog(other, arbitrator, 939n, 1n, 47_973_793n),
      rulingLog(arbitrated, other, 939n, 1n, 47_973_794n),
      rulingLog(arbitrated, arbitrator, 940n, 1n, 47_973_795n),
    ];
    const request = ({ method }: { method: string }): Promise<unknown> => {
      if (method === "eth_blockNumber") return Promise.resolve(numberToHex(EXECUTION_GNOSIS.readAtBlock));
      if (method === "eth_getLogs") return Promise.resolve(answered);
      return Promise.reject(rpcError(-32601, `unexpected method ${method}`));
    };
    const client = createPublicClient({ transport: custom({ request }, { retryCount: 0 }) });
    expect(await readExecutedRuling({ chainId: 100, client }, subject)).toEqual({ status: "executed", ruling: 2n });
  });

  it("rejects a ruling above the dispute's number of choices", async () => {
    const subject = await found(EXECUTION_GNOSIS, 939n);
    expect(subject.dispute.numberOfChoices).toBe(2n);
    const { arbitrated, arbitrator } = subject.binding;
    const logs = withRulingLogs(EXECUTION_GNOSIS, [rulingLog(arbitrated, arbitrator, 939n, 3n, 47_973_792n)]);
    const { executed } = await read(EXECUTION_GNOSIS, 939n, executionNode(EXECUTION_GNOSIS, { logs }));
    expect(executed).toEqual({ status: "out-of-range", ruling: 3n });
  });

  it("keeps the top of the uint256 range on a dispute whose choices span the whole word", async () => {
    const { executed, subject } = await read(EXECUTION_MAINNET, 1347n);
    expect(subject.dispute.numberOfChoices).toBe(maxUint256);
    expect(executed).toEqual({ status: "executed", ruling: maxUint256 });
  });

  it("rejects the top of the uint256 range on a dispute with one choice fewer", async () => {
    const { subject } = await read(EXECUTION_MAINNET, 1347n);
    const oneShort = { ...subject, dispute: { ...subject.dispute, numberOfChoices: maxUint256 - 1n } };
    const { client } = fakeClient(executionNode(EXECUTION_MAINNET));
    expect(await readExecutedRuling({ chainId: 1, client }, oneShort)).toEqual({ status: "out-of-range", ruling: maxUint256 });
  });

  it("scans from the given block to the head and splits a refused range", async () => {
    const { executed, requests, subject } = await read(EXECUTION_GNOSIS, 939n, executionNode(EXECUTION_GNOSIS, { maxRange: 10_000n }));
    expect(executed).toEqual({ status: "executed", ruling: 2n });
    const [whole, ...windows] = requests.logs;
    expect(whole).toMatchObject({ fromBlock: subject.fromBlock, toBlock: EXECUTION_GNOSIS.readAtBlock });
    expect(windows.length).toBeGreaterThan(1);
    expect(windows.every((window) => window.toBlock - window.fromBlock < 10_000n)).toBe(true);
  });

  it("a failed scan is unread, never an empty result", async () => {
    const { executed } = await read(EXECUTION_GNOSIS, 939n, executionNode(EXECUTION_GNOSIS, { failing: { eth_getLogs: rpcError(-32000, "header not found") } }));
    expect(executed).toMatchObject({ status: "unread", error: { code: "rpc-error" } });
  });

  it("without a read RPC the executed ruling is unread", async () => {
    const subject = await found(EXECUTION_GNOSIS, 939n);
    const executed = await readExecutedRuling({ chainId: 100, client: undefined }, subject);
    expect(executed).toEqual({ status: "unread", error: { code: "no-rpc", message: "This network's data is unavailable." } });
  });
});
