import { createPublicClient, custom, encodeAbiParameters, encodeEventTopics, numberToHex } from "viem";
import { erc1497Abi } from "../../abi";
import type { Address, FetchInit, FetchResponse, Fetcher, Hex, ReadClient } from "../../types";
import fixture from "../../evidence/__fixtures__/mainnet-1454-505.json";

/** A log as a JSON-RPC node returns it. */
export interface RpcLog {
  readonly address: Hex;
  readonly topics: readonly Hex[];
  readonly data: Hex;
  readonly blockNumber: Hex;
  readonly blockHash: Hex;
  readonly transactionHash: Hex;
  readonly transactionIndex: Hex;
  readonly logIndex: Hex;
  readonly removed: boolean;
}

/** The `eth_getLogs` filter the fake node received, with block numbers decoded. */
export interface LogsRequest {
  readonly address: string;
  readonly topics: readonly (string | null)[];
  readonly fromBlock: bigint;
  readonly toBlock: bigint;
}

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

/** Every request the fake node received, by method. */
export interface NodeRequests {
  readonly logs: LogsRequest[];
  readonly blocks: bigint[];
  readonly methods: string[];
}

/** A JSON-RPC error as a node reports it: an `Error` with a numeric `code`. */
export function rpcError(code: number, message: string): Error {
  return Object.assign(new Error(message), { code });
}

function asLogsRequest(params: unknown): LogsRequest {
  const [filter] = params as [{ address: string; topics?: (string | null)[]; fromBlock: Hex; toBlock: Hex }];
  return { address: filter.address, topics: filter.topics ?? [], fromBlock: BigInt(filter.fromBlock), toBlock: BigInt(filter.toBlock) };
}

/** Whether `log` matches the filter as a node applies it: address, block range and every non-null topic. */
function matches(log: RpcLog, request: LogsRequest): boolean {
  const block = BigInt(log.blockNumber);
  const sameTopics = request.topics.every((topic, index) => topic === null || log.topics[index] === topic);
  return log.address === request.address.toLowerCase() && sameTopics && block >= request.fromBlock && block <= request.toBlock;
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
      return Promise.resolve(node.logs.filter((log) => matches(log, logsRequest)));
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

/** A stub fetcher answering from a map of URL → body; a URL missing from the map answers 404. */
export function fakeFetcher(bodies: Readonly<Record<string, string | Error>>): { fetcher: Fetcher; urls: string[]; inits: (FetchInit | undefined)[] } {
  const urls: string[] = [];
  const inits: (FetchInit | undefined)[] = [];
  const fetcher: Fetcher = (url, init) => {
    urls.push(url);
    inits.push(init);
    const body = bodies[url];
    if (body instanceof Error) return Promise.reject(body);
    return Promise.resolve(textResponse(body));
  };
  return { fetcher, urls, inits };
}

function textResponse(body: string | undefined): FetchResponse {
  const ok = body !== undefined;
  const text = body ?? "Not Found";
  return {
    ok,
    status: ok ? 200 : 404,
    json: () => Promise.resolve().then((): unknown => JSON.parse(text)),
    text: () => Promise.resolve(text),
  };
}

const LOG_DEFAULTS = {
  blockHash: `0x${"ab".repeat(32)}`,
  transactionIndex: "0x0",
  removed: false,
} as const;

/** A synthetic `Evidence` log whose `_evidence` string is `uri`. */
export function evidenceLog(input: {
  readonly arbitrable: Address;
  readonly arbitrator: Address;
  readonly evidenceGroupId: bigint;
  readonly party: Address;
  readonly uri: string;
  readonly blockNumber: bigint;
  readonly logIndex: number;
}): RpcLog {
  const topics = encodeEventTopics({
    abi: erc1497Abi,
    eventName: "Evidence",
    args: { _arbitrator: input.arbitrator, _evidenceGroupID: input.evidenceGroupId, _party: input.party },
  });
  return {
    ...LOG_DEFAULTS,
    address: input.arbitrable,
    topics: topics as Hex[],
    data: encodeAbiParameters([{ type: "string" }], [input.uri]),
    blockNumber: numberToHex(input.blockNumber),
    transactionHash: syntheticTxHash(input.blockNumber, input.logIndex),
    logIndex: numberToHex(input.logIndex),
  };
}

/** A synthetic `Dispute` log. */
export function disputeLog(input: {
  readonly arbitrable: Address;
  readonly arbitrator: Address;
  readonly disputeId: bigint;
  readonly metaEvidenceId: bigint;
  readonly evidenceGroupId: bigint;
  readonly blockNumber: bigint;
  readonly logIndex: number;
}): RpcLog {
  const topics = encodeEventTopics({ abi: erc1497Abi, eventName: "Dispute", args: { _arbitrator: input.arbitrator, _disputeID: input.disputeId } });
  return {
    ...LOG_DEFAULTS,
    address: input.arbitrable,
    topics: topics as Hex[],
    data: encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [input.metaEvidenceId, input.evidenceGroupId]),
    blockNumber: numberToHex(input.blockNumber),
    transactionHash: syntheticTxHash(input.blockNumber, input.logIndex),
    logIndex: numberToHex(input.logIndex),
  };
}

function syntheticTxHash(blockNumber: bigint, logIndex: number): Hex {
  return numberToHex((blockNumber << 32n) + BigInt(logIndex), { size: 32 });
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
    metaEvidenceId: BigInt(dispute.metaEvidenceId),
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

/** One recorded dispute by ID. */
export function recordedDispute(disputeId: bigint): (typeof RECORDED.disputes)[number] {
  const dispute = RECORDED.disputes.find((candidate) => candidate.disputeId === disputeId);
  if (dispute === undefined) throw new Error(`dispute ${String(disputeId)} is not recorded`);
  return dispute;
}

/** A fake node holding every recorded log and timestamp at the recorded head. */
export function recordedNode(overrides: Partial<FakeNode> = {}): FakeNode {
  return {
    head: RECORDED.readAtBlock,
    logs: RECORDED.disputes.flatMap((dispute) => [...dispute.disputeLogs, ...dispute.evidenceLogs]),
    timestamps: Object.assign({}, ...RECORDED.disputes.map((dispute) => dispute.timestamps)) as Record<string, Hex>,
    ...overrides,
  };
}

/** The gateway bodies of every recorded evidence document. */
export function recordedBodies(): Record<string, string> {
  return Object.assign(
    {},
    ...RECORDED.disputes.map((dispute) => Object.fromEntries(Object.entries(dispute.documents).map(([uri, body]) => [`${RECORDED.gateway}${uri}`, body]))),
  ) as Record<string, string>;
}
