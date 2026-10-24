/**
 * Test-only fake node and fetcher for the disputes module. A fake node answers `eth_call` from recorded or synthetic
 * answers keyed by target and calldata, and `eth_getLogs`, `eth_getBlockByNumber` and `eth_blockNumber` from a log list.
 */
import { createPublicClient, custom, encodeAbiParameters, encodeEventTopics, encodeFunctionData, encodeFunctionResult, numberToHex, pad } from "viem";
import type { Abi, ContractFunctionArgs, ContractFunctionName, ContractFunctionReturnType } from "viem";
import { z } from "../../zod";
import { EIP1967_IMPLEMENTATION_SLOT, klerosLiquidAbi } from "../../abi";
import { detectFamily } from "../../families";
import type { FamilyDetection } from "../../families/types";
import bytecode1 from "../../families/__fixtures__/bytecode-1.json";
import bytecode100 from "../../families/__fixtures__/bytecode-100.json";
import type { Address, ChainId, FetchInit, FetchResponse, Fetcher, Hex, ReadClient } from "../../types";
import mainnet from "../../disputes/__fixtures__/arbitrator-1.json";
import gnosis from "../../disputes/__fixtures__/arbitrator-100.json";
import sepolia from "../../disputes/__fixtures__/arbitrator-11155111.json";

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

/** A JSON-RPC error as the node sent it. */
export interface RpcErrorBody {
  readonly code: number;
  readonly message: string;
}

/** The answer to one `eth_call`: raw return data, or the node's error. */
export type CallAnswer = { readonly result: Hex } | { readonly error: RpcErrorBody };

/** The `eth_getLogs` filter the fake node received, with block numbers decoded. */
export interface LogsRequest {
  readonly address: string;
  readonly topics: readonly (string | null)[];
  readonly fromBlock: bigint;
  readonly toBlock: bigint;
}

export interface FakeNode {
  readonly head: bigint;
  /** `eth_call` answers keyed by `callKey`. */
  readonly calls: ReadonlyMap<string, CallAnswer>;
  readonly logs?: readonly RpcLog[];
  /** Block number (hex) → timestamp (hex). */
  readonly timestamps?: Readonly<Record<string, Hex>>;
  /** Thrown for every request of this JSON-RPC method, as the transport would. */
  readonly failing?: Readonly<Record<string, Error>>;
}

/** Every request the fake node received. */
export interface NodeRequests {
  readonly methods: string[];
  /** `callKey` of every `eth_call`. */
  readonly calls: string[];
  readonly logs: LogsRequest[];
  readonly blocks: bigint[];
}

/** A transport-level JSON-RPC error: an `Error` with a numeric `code`, as viem's custom transport receives it. */
export function rpcError(code: number, message: string): Error {
  return Object.assign(new Error(message), { code });
}

export function callKey(to: string, data: Hex): string {
  return `${to.toLowerCase()}:${data.toLowerCase()}`;
}

/** The key and the encoded answer of a synthetic call. */
export function answer<const TAbi extends Abi, TName extends ContractFunctionName<TAbi, "view" | "pure">>(input: {
  readonly to: Address;
  readonly abi: TAbi;
  readonly functionName: TName;
  readonly args: ContractFunctionArgs<TAbi, "view" | "pure", TName>;
  readonly result: ContractFunctionReturnType<TAbi, "view" | "pure", TName>;
}): [string, CallAnswer] {
  const data = encodeFunctionData({ abi: input.abi, functionName: input.functionName, args: input.args } as Parameters<typeof encodeFunctionData>[0]);
  // Encoded against the widened ABI: the generic parameters are already checked at the call site.
  const abi: Abi = input.abi;
  const result = encodeFunctionResult({ abi, functionName: input.functionName, result: input.result });
  return [callKey(input.to, data), { result }];
}

/** The key of a synthetic call answered with a node error. */
export function failure<const TAbi extends Abi, TName extends ContractFunctionName<TAbi, "view" | "pure">>(input: {
  readonly to: Address;
  readonly abi: TAbi;
  readonly functionName: TName;
  readonly args: ContractFunctionArgs<TAbi, "view" | "pure", TName>;
  readonly error: RpcErrorBody;
}): [string, CallAnswer] {
  const data = encodeFunctionData({ abi: input.abi, functionName: input.functionName, args: input.args } as Parameters<typeof encodeFunctionData>[0]);
  return [callKey(input.to, data), { error: input.error }];
}

function asLogsRequest(params: unknown): LogsRequest {
  const [filter] = params as [{ address: string; topics?: (string | null)[]; fromBlock: Hex; toBlock: Hex }];
  return { address: filter.address, topics: filter.topics ?? [], fromBlock: BigInt(filter.fromBlock), toBlock: BigInt(filter.toBlock) };
}

function matches(log: RpcLog, request: LogsRequest): boolean {
  const block = BigInt(log.blockNumber);
  const sameTopics = request.topics.every((topic, index) => topic === null || log.topics[index] === topic);
  return log.address === request.address.toLowerCase() && sameTopics && block >= request.fromBlock && block <= request.toBlock;
}

/** A `ReadClient` over a fake node, viem retries off so every request reaches the node once. */
export function fakeClient(node: FakeNode): { client: ReadClient; requests: NodeRequests } {
  const requests: NodeRequests = { methods: [], calls: [], logs: [], blocks: [] };
  const request = ({ method, params }: { method: string; params?: unknown }): Promise<unknown> => {
    requests.methods.push(method);
    const failing = node.failing?.[method];
    if (failing !== undefined) return Promise.reject(failing);
    switch (method) {
      case "eth_blockNumber":
        return Promise.resolve(numberToHex(node.head));
      case "eth_call": {
        const [{ to, data }] = params as [{ to: string; data: Hex }];
        const key = callKey(to, data);
        requests.calls.push(key);
        const found = node.calls.get(key);
        if (found === undefined) return Promise.reject(rpcError(-32099, `no answer recorded for ${key}`));
        return "error" in found ? Promise.reject(rpcError(found.error.code, found.error.message)) : Promise.resolve(found.result);
      }
      case "eth_getLogs": {
        const logsRequest = asLogsRequest(params);
        requests.logs.push(logsRequest);
        return Promise.resolve((node.logs ?? []).filter((log) => matches(log, logsRequest)));
      }
      case "eth_getBlockByNumber": {
        const [number] = params as [Hex];
        requests.blocks.push(BigInt(number));
        const timestamp = node.timestamps?.[number];
        return Promise.resolve(timestamp === undefined ? null : { number, timestamp, hash: `0x${"cd".repeat(32)}` });
      }
      default:
        return Promise.reject(rpcError(-32601, `unexpected method ${method}`));
    }
  };
  return { client: createPublicClient({ transport: custom({ request }, { retryCount: 0 }) }), requests };
}

const LOG_DEFAULTS = { blockHash: `0x${"ab".repeat(32)}`, transactionIndex: "0x0", removed: false } as const;

function syntheticTxHash(blockNumber: bigint, logIndex: number): Hex {
  return numberToHex((blockNumber << 32n) + BigInt(logIndex), { size: 32 });
}

/** A synthetic KlerosLiquid `DisputeCreation(_disputeID, _arbitrable)` log. */
export function disputeCreationLog(arbitrator: Address, disputeId: bigint, arbitrable: Address, blockNumber: bigint, logIndex = 0): RpcLog {
  const topics = encodeEventTopics({ abi: klerosLiquidAbi, eventName: "DisputeCreation", args: { _disputeID: disputeId, _arbitrable: arbitrable } });
  return {
    ...LOG_DEFAULTS,
    address: arbitrator,
    topics: topics as Hex[],
    data: "0x",
    blockNumber: numberToHex(blockNumber),
    transactionHash: syntheticTxHash(blockNumber, logIndex),
    logIndex: numberToHex(logIndex),
  };
}

/** A synthetic KlerosLiquid `NewPeriod(_disputeID, _period)` log. */
export function newPeriodLog(arbitrator: Address, disputeId: bigint, period: number, blockNumber: bigint, logIndex = 0): RpcLog {
  const topics = encodeEventTopics({ abi: klerosLiquidAbi, eventName: "NewPeriod", args: { _disputeID: disputeId } });
  return {
    ...LOG_DEFAULTS,
    address: arbitrator,
    topics: topics as Hex[],
    data: encodeAbiParameters([{ type: "uint8" }], [period]),
    blockNumber: numberToHex(blockNumber),
    transactionHash: syntheticTxHash(blockNumber, logIndex),
    logIndex: numberToHex(logIndex),
  };
}

/** A synthetic KlerosLiquid `AppealDecision(_disputeID, _arbitrable)` log. */
export function appealDecisionLog(arbitrator: Address, disputeId: bigint, arbitrable: Address, blockNumber: bigint, logIndex = 0): RpcLog {
  const topics = encodeEventTopics({ abi: klerosLiquidAbi, eventName: "AppealDecision", args: { _disputeID: disputeId, _arbitrable: arbitrable } });
  return {
    ...LOG_DEFAULTS,
    address: arbitrator,
    topics: topics as Hex[],
    data: "0x",
    blockNumber: numberToHex(blockNumber),
    transactionHash: syntheticTxHash(blockNumber, logIndex),
    logIndex: numberToHex(logIndex),
  };
}

/** A stub fetcher answering from a map of URL → body; a URL missing from the map answers 404, an `Error` rejects. */
export function fakeFetcher(bodies: Readonly<Record<string, string | Error>>): { fetcher: Fetcher; urls: string[]; inits: (FetchInit | undefined)[] } {
  const urls: string[] = [];
  const inits: (FetchInit | undefined)[] = [];
  const fetcher: Fetcher = (url, init) => {
    urls.push(url);
    inits.push(init);
    const body = bodies[url];
    if (body instanceof Error) return Promise.reject(body);
    const ok = body !== undefined;
    const text = body ?? "Not Found";
    const response: FetchResponse = {
      ok,
      status: ok ? 200 : 404,
      json: () => Promise.resolve().then((): unknown => JSON.parse(text)),
      text: () => Promise.resolve(text),
    };
    return Promise.resolve(response);
  };
  return { fetcher, urls, inits };
}

const hexSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]*$/)
  .transform((value) => value as Hex);
const addressSchema = z
  .string()
  .regex(/^0x[0-9a-f]{40}$/)
  .transform((value) => value as Address);
const logSchema = z.object({
  address: addressSchema,
  topics: z.array(hexSchema),
  data: hexSchema,
  blockNumber: hexSchema,
  blockHash: hexSchema,
  transactionHash: hexSchema,
  transactionIndex: hexSchema,
  logIndex: hexSchema,
  removed: z.boolean(),
});
const recordingSchema = z.object({
  chainId: z.number(),
  readAtBlock: z.number(),
  arbitrator: addressSchema,
  policyRegistry: addressSchema,
  gateway: z
    .string()
    .startsWith("https://")
    .transform((value) => value as `https://${string}`),
  calls: z.array(
    z.object({
      to: addressSchema,
      data: hexSchema,
      result: hexSchema.optional(),
      error: z.object({ code: z.number(), message: z.string() }).optional(),
    }),
  ),
  logs: z.array(logSchema),
  timestamps: z.record(z.string(), hexSchema),
  policies: z.record(z.string(), z.string()),
});

/** One chain's recording (`__fixtures__/arbitrator-<chainId>.json`), read at `readAtBlock`. */
export interface Recording {
  readonly chainId: number;
  readonly readAtBlock: bigint;
  readonly arbitrator: Address;
  readonly policyRegistry: Address;
  readonly gateway: `https://${string}`;
  /** `eth_call` answers keyed by `callKey`. */
  readonly calls: ReadonlyMap<string, CallAnswer>;
  readonly logs: readonly RpcLog[];
  readonly timestamps: Readonly<Record<string, Hex>>;
  /** Policy URI as stored on chain → the gateway's body. */
  readonly policies: Readonly<Record<string, string>>;
}

function toRecording(raw: unknown): Recording {
  const parsed = recordingSchema.parse(raw);
  const entries = parsed.calls.map((call): [string, CallAnswer] => [
    callKey(call.to, call.data),
    call.error === undefined ? { result: call.result ?? "0x" } : { error: call.error },
  ]);
  return {
    chainId: parsed.chainId,
    readAtBlock: BigInt(parsed.readAtBlock),
    arbitrator: parsed.arbitrator,
    policyRegistry: parsed.policyRegistry,
    gateway: parsed.gateway,
    calls: new Map(entries),
    logs: parsed.logs,
    timestamps: parsed.timestamps,
    policies: parsed.policies,
  };
}

/** Mainnet, read at block 26,190,696. */
export const MAINNET = toRecording(mainnet);
/** Gnosis, read at block 48,752,200. */
export const GNOSIS = toRecording(gnosis);
/** Sepolia, read at block 11,913,201. */
export const SEPOLIA = toRecording(sepolia);

/** A fake node replaying a recording, with optional extra or replaced call answers. */
export function recordedNode(recording: Recording, overrides: Partial<FakeNode> & { readonly extraCalls?: readonly [string, CallAnswer][] } = {}): FakeNode {
  const { extraCalls = [], ...rest } = overrides;
  return {
    head: recording.readAtBlock,
    calls: new Map([...recording.calls, ...extraCalls]),
    logs: recording.logs,
    timestamps: recording.timestamps,
    ...rest,
  };
}

/** The recorded policy bodies as gateway URL → body, as a fetcher for `listCourts`. */
export function recordedPolicyBodies(recording: Recording): Record<string, string> {
  return Object.fromEntries(Object.entries(recording.policies).map(([uri, body]) => [`${recording.gateway}${uri}`, body]));
}

const bytecodeSchema = z.object({
  chainId: z.number(),
  contracts: z.array(
    z.object({
      address: z.string().transform((value) => value.toLowerCase()),
      code: hexSchema,
      eip1967Implementation: z.object({ address: z.string().transform((value) => value.toLowerCase()), code: hexSchema }).optional(),
    }),
  ),
});

/** Code and EIP-1967 slot words of the bytecode recorded by `families` (`families/__fixtures__/bytecode-<chain>.json`). */
function recordedCode(chainId: ChainId): { readonly code: ReadonlyMap<string, Hex>; readonly slots: ReadonlyMap<string, Hex> } {
  const record = [bytecode1, bytecode100].map((raw) => bytecodeSchema.parse(raw)).find((candidate) => candidate.chainId === chainId);
  const code = new Map<string, Hex>();
  const slots = new Map<string, Hex>();
  for (const contract of record?.contracts ?? []) {
    code.set(contract.address, contract.code);
    if (contract.eip1967Implementation !== undefined) {
      code.set(contract.eip1967Implementation.address, contract.eip1967Implementation.code);
      slots.set(contract.address, pad(contract.eip1967Implementation.address as Hex, { size: 32 }));
    }
  }
  return { code, slots };
}

/** The family `detectFamily` gives an arbitrable from its recorded bytecode. */
export function recordedDetection(chainId: ChainId, arbitrable: Address): Promise<FamilyDetection> {
  const { code, slots } = recordedCode(chainId);
  if (!code.has(arbitrable)) return Promise.reject(new Error(`no recorded bytecode for ${String(chainId)}:${arbitrable}`));
  const request = ({ method, params }: { method: string; params?: unknown }): Promise<unknown> => {
    const [address, slot] = params as [string, string];
    if (method === "eth_getCode") return Promise.resolve(code.get(address.toLowerCase()) ?? "0x");
    if (method === "eth_getStorageAt" && slot.toLowerCase() === EIP1967_IMPLEMENTATION_SLOT) return Promise.resolve(slots.get(address.toLowerCase()) ?? pad("0x", { size: 32 }));
    return Promise.reject(rpcError(-32601, `unexpected method ${method}`));
  };
  const client = createPublicClient({ transport: custom({ request }, { retryCount: 0 }) });
  return detectFamily({ client, chainId, arbitrable });
}
