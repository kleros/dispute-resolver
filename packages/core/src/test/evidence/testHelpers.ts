import { createPublicClient, custom, encodeAbiParameters, encodeEventTopics, numberToHex } from "viem";
import { erc1497Abi } from "../../abi";
import type { Address, Hex, ReadClient } from "../../types";
import fixture from "../../evidence/__fixtures__/mainnet-1454-505.json";
import gnosisFixture from "../../evidence/__fixtures__/gnosis-460-863-meta-evidence.json";
import { asLogsRequest, matchesFilter, rpcError, syntheticLog, type LogsRequest, type RpcLog } from "../rpc/testHelpers";

export { fakeFetcher } from "../fetch/testHelpers";
export { rpcError, type RpcLog } from "../rpc/testHelpers";

/** What the fake node holds and how it fails. */
export interface FakeNode {
  readonly head: bigint;
  readonly logs: readonly RpcLog[];
  /** Block number (hex) → timestamp (hex). A block missing here is answered with `null` (block not found). */
  readonly timestamps: Readonly<Record<string, Hex>>;
  /** Thrown for every request of this JSON-RPC method. */
  readonly failing?: Readonly<Record<string, Error>>;
  /** `eth_getLogs` ranges wider than this many blocks are refused like Infura's result cap. */
  readonly maxLogRange?: bigint;
}

export interface NodeRequests {
  readonly logs: LogsRequest[];
  readonly blocks: bigint[];
  readonly methods: string[];
}

/** A `ReadClient` over a fake node, with viem's retries off so every request reaches the node once. */
export function fakeClient(node: FakeNode): { client: ReadClient; requests: NodeRequests } {
  const requests: NodeRequests = { logs: [], blocks: [], methods: [] };
  const request = ({ method, params }: { method: string; params?: unknown }): Promise<unknown> => {
    requests.methods.push(method);
    const failure = node.failing?.[method];
    if (failure !== undefined) return Promise.reject(failure);
    if (method === "eth_blockNumber") return Promise.resolve(numberToHex(node.head));
    if (method === "eth_getLogs") {
      const logsRequest = asLogsRequest(params);
      requests.logs.push(logsRequest);
      const tooWide = node.maxLogRange !== undefined && logsRequest.toBlock - logsRequest.fromBlock + 1n > node.maxLogRange;
      if (tooWide) return Promise.reject(rpcError(-32005, "query returned more than 10000 results"));
      return Promise.resolve(node.logs.filter((log) => matchesFilter(log, logsRequest)));
    }
    if (method === "eth_getBlockByNumber") {
      const [number] = params as [Hex];
      requests.blocks.push(BigInt(number));
      const timestamp = node.timestamps[number];
      return Promise.resolve(timestamp === undefined ? null : { number, timestamp, hash: `0x${"cd".repeat(32)}` });
    }
    return Promise.reject(rpcError(-32601, `unexpected method ${method}`));
  };
  return { client: createPublicClient({ transport: custom({ request }, { retryCount: 0 }) }), requests };
}

interface LogPlacement {
  readonly arbitrable: Address;
  readonly blockNumber: bigint;
  readonly logIndex: number;
}

/** A synthetic `Evidence` log whose `_evidence` string is `uri`. */
export function evidenceLog(input: LogPlacement & { readonly arbitrator: Address; readonly evidenceGroupId: bigint; readonly party: Address; readonly uri: string }): RpcLog {
  const topics = encodeEventTopics({
    abi: erc1497Abi,
    eventName: "Evidence",
    args: { _arbitrator: input.arbitrator, _evidenceGroupID: input.evidenceGroupId, _party: input.party },
  });
  return syntheticLog(input.arbitrable, topics as Hex[], encodeAbiParameters([{ type: "string" }], [input.uri]), input.blockNumber, input.logIndex);
}

export function disputeLog(
  input: LogPlacement & { readonly arbitrator: Address; readonly disputeId: bigint; readonly metaEvidenceId: bigint; readonly evidenceGroupId: bigint },
): RpcLog {
  const topics = encodeEventTopics({ abi: erc1497Abi, eventName: "Dispute", args: { _arbitrator: input.arbitrator, _disputeID: input.disputeId } });
  return syntheticLog(
    input.arbitrable,
    topics as Hex[],
    encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [input.metaEvidenceId, input.evidenceGroupId]),
    input.blockNumber,
    input.logIndex,
  );
}

/** A synthetic `MetaEvidence` log whose `_evidence` string is `uri`. */
export function metaEvidenceLog(input: LogPlacement & { readonly metaEvidenceId: bigint; readonly uri: string }): RpcLog {
  const topics = encodeEventTopics({ abi: erc1497Abi, eventName: "MetaEvidence", args: { _metaEvidenceID: input.metaEvidenceId } });
  return syntheticLog(input.arbitrable, topics as Hex[], encodeAbiParameters([{ type: "string" }], [input.uri]), input.blockNumber, input.logIndex);
}

/** The recorded mainnet disputes 1454 and 505, read at block 26,190,208 (`__fixtures__/mainnet-1454-505.json`). */
export const RECORDED = {
  readAtBlock: BigInt(fixture.readAtBlock),
  arbitrator: fixture.arbitrator as Address,
  scanFromBlock: BigInt(fixture.scanFromBlock),
  gateway: fixture.gateway as `https://${string}`,
  disputes: fixture.disputes.map((dispute) => ({
    disputeId: BigInt(dispute.disputeId),
    arbitrable: dispute.arbitrable as Address,
    evidenceGroupId: BigInt(dispute.evidenceGroupId),
    disputeLogs: dispute.disputeLogs as RpcLog[],
    evidenceLogs: dispute.evidenceLogs as RpcLog[],
    timestamps: stringEntries(dispute.blockTimestamps) as Record<string, Hex>,
    documents: stringEntries(dispute.documents),
  })),
};

/** The string values of a fixture object (JSON imports type each dispute's keys as a union of optional properties). */
function stringEntries(value: object): Record<string, string> {
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

function findRecorded<T extends { readonly disputeId: bigint }>(disputes: readonly T[], disputeId: bigint, what: string): T {
  const dispute = disputes.find((candidate) => candidate.disputeId === disputeId);
  if (dispute === undefined) throw new Error(`${what} ${String(disputeId)} is not recorded`);
  return dispute;
}

function nodeOf<T extends { readonly timestamps: Record<string, Hex> }>(
  head: bigint,
  disputes: readonly T[],
  logsOf: (dispute: T) => readonly RpcLog[],
  overrides: Partial<FakeNode>,
): FakeNode {
  return { head, logs: disputes.flatMap(logsOf), timestamps: Object.assign({}, ...disputes.map((dispute) => dispute.timestamps)) as Record<string, Hex>, ...overrides };
}

export function recordedDispute(disputeId: bigint): (typeof RECORDED.disputes)[number] {
  return findRecorded(RECORDED.disputes, disputeId, "dispute");
}

/** A fake node holding every recorded log and timestamp at the recorded head. */
export function recordedNode(overrides: Partial<FakeNode> = {}): FakeNode {
  return nodeOf(RECORDED.readAtBlock, RECORDED.disputes, (dispute) => [...dispute.disputeLogs, ...dispute.evidenceLogs], overrides);
}

/** The gateway bodies of every recorded evidence document. */
export function recordedBodies(): Record<string, string> {
  return Object.assign(
    {},
    ...RECORDED.disputes.map((dispute) => Object.fromEntries(Object.entries(dispute.documents).map(([uri, body]) => [`${RECORDED.gateway}${uri}`, body]))),
  ) as Record<string, string>;
}

/**
 * The recorded Gnosis disputes 460, 431 and 863, read at block 48,850,832
 * (`__fixtures__/gnosis-460-863-meta-evidence.json`): each one's Dispute log and every MetaEvidence log of its ID.
 */
export const RECORDED_GNOSIS = {
  readAtBlock: BigInt(gnosisFixture.readAtBlock),
  scanFromBlock: BigInt(gnosisFixture.scanFromBlock),
  disputes: gnosisFixture.disputes.map((dispute) => ({
    disputeId: BigInt(dispute.disputeId),
    arbitrable: dispute.arbitrable as Address,
    disputeLogs: dispute.disputeLogs as RpcLog[],
    metaEvidenceLogs: dispute.metaEvidenceLogs as RpcLog[],
    timestamps: stringEntries(dispute.blockTimestamps) as Record<string, Hex>,
  })),
};

export function recordedGnosisDispute(disputeId: bigint): (typeof RECORDED_GNOSIS.disputes)[number] {
  return findRecorded(RECORDED_GNOSIS.disputes, disputeId, "Gnosis dispute");
}

/** A fake Gnosis node holding every recorded Dispute and MetaEvidence log and timestamp at the recorded head. */
export function recordedGnosisNode(overrides: Partial<FakeNode> = {}): FakeNode {
  return nodeOf(RECORDED_GNOSIS.readAtBlock, RECORDED_GNOSIS.disputes, (dispute) => [...dispute.disputeLogs, ...dispute.metaEvidenceLogs], overrides);
}
