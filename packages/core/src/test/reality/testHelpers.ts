import {
  createPublicClient,
  custom,
  decodeFunctionData,
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionResult,
  numberToHex,
  pad,
  type Abi,
  type AbiEvent,
  type EIP1193RequestOptions,
  type Transport,
} from "viem";
import { realityAbi, realityProxyAbi } from "../../abi";
import { isLookupLimitError, isRangeLimitError } from "../../rpc";
import type { ReadClientOptions, RequestBudget } from "../../rpc/types";
import { ARBITRATION_CREATED, DISPUTE_ID_TO_QUESTION_ID, LOG_NEW_QUESTION, LOG_NEW_TEMPLATE } from "../../reality/events";
import { rpcError, type RpcLog } from "../rpc/testHelpers";
import type { GetReadClient, Hex, ReadClient } from "../../types";
import type { LookupReadClients } from "../../reality/types";

/** A fake chain: the logs and contract state a node answers from, and its limits. */
export interface FakeChain {
  /** The head block; the `finalized` block when `finalized` is absent. */
  latest: bigint;
  finalized?: bigint;
  /** `eth_getLogs` ranges wider than this many blocks are refused, like a provider's range cap. */
  maxRange: bigint;
  logs: RpcLog[];
  /** Reality.eth `templates(id)`: the block of the template's `LogNewTemplate`. */
  templates: Record<string, bigint>;
  /** The proxy whose `arbitrationCreatedBlock(id)` answers from `createdBlocks`; every other contract reverts. */
  hintProxy?: string;
  createdBlocks: Record<string, bigint>;
  /** Seconds between blocks, for block timestamps. */
  blockTimeS: number;
  /** The node returns every log twice. */
  duplicateLogs?: boolean;
  /** Runs first for every request: an `Error` fails it, a defined value answers it. */
  onRequest?: (method: string, params: unknown) => unknown;
}

/** One request that reached a fake node, retries included. */
export interface NodeCall {
  readonly chainId: number;
  readonly method: string;
  readonly params: unknown;
}

export interface FakeLogsFilter {
  readonly address: string;
  readonly topics: readonly (string | null)[];
  readonly fromBlock: Hex;
  readonly toBlock: Hex;
}

/** The `eth_getLogs` filter of a call. */
export function filterOf(call: NodeCall): FakeLogsFilter {
  const [filter] = call.params as [FakeLogsFilter];
  return filter;
}

/** The read client of a chain the test knows is configured. */
export function readClientOf(clients: GetReadClient, chainId: number): ReadClient {
  const client = clients(chainId);
  if (client === undefined) throw new Error(`no read client for chain ${String(chainId)}`);
  return client;
}

/** The item at `index`; a test fails loudly when there is none. */
export function nth<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`expected an item at index ${String(index)}, got ${String(items.length)} items`);
  return item;
}

/** Whether a request is an `eth_getLogs` over a single block. */
export function singleBlockLogs(method: string, params: unknown): boolean {
  if (method !== "eth_getLogs") return false;
  const [filter] = params as [FakeLogsFilter];
  return filter.fromBlock === filter.toBlock;
}

export function blockTimestamp(chain: Pick<FakeChain, "blockTimeS">, block: bigint): bigint {
  return 1_000_000_000n + BigInt(chain.blockTimeS) * block;
}

const FAKE_ABI = [...realityAbi.filter((item) => item.type === "function"), ...realityProxyAbi.filter((item) => item.type === "function")] as const satisfies Abi;

const BLOCK_HASH: Hex = `0x${"ab".repeat(32)}`;
const RETRY_DELAY_MS = 1;
/** The retry policy of a read client (`rpc.createReadClient`): two retries, except range refusals of getLogs. */
const RETRIES = 2;

function fakeBlock(chain: FakeChain, block: bigint): unknown {
  return {
    number: numberToHex(block),
    hash: BLOCK_HASH,
    parentHash: BLOCK_HASH,
    timestamp: numberToHex(blockTimestamp(chain, block)),
    transactions: [],
  };
}

function matchesTopics(log: RpcLog, topics: readonly (string | null)[]): boolean {
  return topics.every((topic, index) => topic === null || log.topics[index]?.toLowerCase() === topic.toLowerCase());
}

function answerLogs(chain: FakeChain, filter: FakeLogsFilter): unknown {
  const from = BigInt(filter.fromBlock);
  const to = BigInt(filter.toBlock);
  if (to - from + 1n > chain.maxRange) return rpcError(-32005, `query exceeds max block range ${chain.maxRange.toString()}`);
  const matching = chain.logs.filter((log) => {
    const block = BigInt(log.blockNumber);
    return log.address === filter.address.toLowerCase() && block >= from && block <= to && matchesTopics(log, filter.topics);
  });
  return chain.duplicateLogs === true ? [...matching, ...matching] : matching;
}

function answerCall(chain: FakeChain, params: unknown): unknown {
  const [{ to, data }] = params as [{ to: string; data: Hex }];
  const { functionName, args } = decodeFunctionData({ abi: FAKE_ABI, data });
  const [id] = args;
  if (functionName === "templates") return encodeFunctionResult({ abi: FAKE_ABI, functionName, result: chain.templates[id.toString()] ?? 0n });
  if (to.toLowerCase() === chain.hintProxy) return encodeFunctionResult({ abi: FAKE_ABI, functionName, result: chain.createdBlocks[id.toString()] ?? 0n });
  return rpcError(3, "execution reverted");
}

function blockOfTag(chain: FakeChain, tag: string): bigint {
  if (tag === "finalized") return chain.finalized ?? chain.latest;
  return tag === "latest" ? chain.latest : BigInt(tag);
}

function answerBlock(chain: FakeChain, params: unknown): unknown {
  const [tag] = params as [string];
  const block = blockOfTag(chain, tag);
  return block > chain.latest ? null : fakeBlock(chain, block);
}

function answer(chain: FakeChain, method: string, params: unknown): unknown {
  const override = chain.onRequest?.(method, params);
  if (override !== undefined) return override;
  switch (method) {
    case "eth_blockNumber":
      return numberToHex(chain.latest);
    case "eth_getBlockByNumber":
      return answerBlock(chain, params);
    case "eth_call":
      return answerCall(chain, params);
    case "eth_getLogs": {
      const [filter] = params as [FakeLogsFilter];
      return answerLogs(chain, filter);
    }
    default:
      return rpcError(-32601, `unexpected method ${method}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The `LookupLimitError` that `error` wraps, as the read clients of `rpc` unwrap it from viem's wrapper. */
function unwrapLookupLimit(error: unknown): unknown {
  let current = error;
  for (let depth = 0; depth < 8 && typeof current === "object" && current !== null; depth += 1) {
    if (isLookupLimitError(current)) return current;
    current = "cause" in current ? current.cause : undefined;
  }
  return error;
}

/**
 * A read client over a fake node with the retry policy of a real one: a failed request is retried `retries` times unless
 * it is an `eth_getLogs` range refusal. Every attempt is recorded in `calls`, and spends `budget` first when there is one,
 * like the clients `rpc.createReadClient` builds with a budget.
 */
function fakeClient(chainId: number, chain: FakeChain, calls: NodeCall[], budget?: RequestBudget, retries: number = RETRIES): ReadClient {
  const attempt = async (method: string, params: unknown, attempted: number): Promise<unknown> => {
    budget?.spend();
    calls.push({ chainId, method, params });
    await sleep(0);
    const result = answer(chain, method, params);
    if (!(result instanceof Error)) return result;
    const retryable = attempted < retries && !(method === "eth_getLogs" && isRangeLimitError(result));
    if (!retryable) throw result;
    await sleep(RETRY_DELAY_MS);
    return attempt(method, params, attempted + 1);
  };
  const request = ({ method, params }: { method: string; params?: unknown }) => attempt(method, params, 0);
  const base = custom({ request }, { retryCount: 0 });
  const transport: Transport = (parameters) => {
    const built = base(parameters);
    const unwrapped = async (call: { method: string; params?: unknown }, requestOptions?: EIP1193RequestOptions): Promise<unknown> => {
      try {
        return await built.request(call, requestOptions);
      } catch (error) {
        throw unwrapLookupLimit(error);
      }
    };
    return { ...built, request: unwrapped as typeof built.request };
  };
  return createPublicClient({ transport, cacheTime: 0 });
}

/** The read clients of fake chains, the clients of a lookup that spend the lookup's budget per attempt, and every request the nodes received. */
export function fakeNetwork(chains: Readonly<Record<number, FakeChain>>): {
  readonly clients: GetReadClient;
  readonly lookupClients: LookupReadClients;
  readonly calls: NodeCall[];
} {
  const calls: NodeCall[] = [];
  const clients = new Map<number, ReadClient>();
  return {
    calls,
    clients: (chainId) => {
      const chain = chains[chainId];
      if (chain === undefined) return undefined;
      const existing = clients.get(chainId);
      if (existing !== undefined) return existing;
      const client = fakeClient(chainId, chain, calls);
      clients.set(chainId, client);
      return client;
    },
    lookupClients: (budget: RequestBudget, options?: ReadClientOptions) => {
      const built = new Map<number, ReadClient>();
      return (chainId) => {
        const chain = chains[chainId];
        if (chain === undefined) return undefined;
        const existing = built.get(chainId);
        if (existing !== undefined) return existing;
        const client = fakeClient(chainId, chain, calls, budget, options?.retryCount);
        built.set(chainId, client);
        return client;
      };
    },
  };
}

let logCounter = 0;

/** The log `event` is emitted as: `indexed` fills the topics, `data` is the non-indexed arguments in order. */
export function eventLog(event: AbiEvent, address: string, blockNumber: number, indexed: Record<string, unknown>, data: readonly unknown[]): RpcLog {
  const topics = encodeEventTopics({ abi: [event], eventName: event.name, args: indexed }).filter((topic): topic is Hex => typeof topic === "string");
  logCounter += 1;
  return {
    address: address.toLowerCase() as Hex,
    topics,
    data: encodeAbiParameters(
      event.inputs.filter((input) => !input.indexed),
      data,
    ),
    blockNumber: numberToHex(blockNumber),
    blockHash: BLOCK_HASH,
    transactionHash: pad(numberToHex(logCounter)),
    transactionIndex: "0x0",
    logIndex: "0x0",
    removed: false,
  };
}

const ZERO_ADDRESS = `0x${"00".repeat(20)}`;

/** A `LogNewQuestion` of a Reality.eth contract. */
export function questionLog(reality: string, block: number, questionId: Hex, templateId: number, text: string): RpcLog {
  return eventLog(LOG_NEW_QUESTION, reality, block, { question_id: questionId, user: ZERO_ADDRESS, content_hash: pad("0x0") }, [
    BigInt(templateId),
    text,
    ZERO_ADDRESS,
    86_400,
    0,
    0n,
    0n,
  ]);
}

/** A `LogNewTemplate` of a Reality.eth contract. */
export function templateLog(reality: string, block: number, templateId: number, text: string): RpcLog {
  return eventLog(LOG_NEW_TEMPLATE, reality, block, { template_id: BigInt(templateId), user: ZERO_ADDRESS }, [text]);
}

/** A `DisputeIDToQuestionID` of a single-chain proxy. */
export function mappingLog(proxy: string, block: number, disputeId: number, questionId: Hex): RpcLog {
  return eventLog(DISPUTE_ID_TO_QUESTION_ID, proxy, block, { _disputeID: BigInt(disputeId) }, [questionId]);
}

/** An `ArbitrationCreated` of a cross-chain foreign proxy. */
export function createdLog(proxy: string, block: number, disputeId: number, questionId: Hex): RpcLog {
  return eventLog(ARBITRATION_CREATED, proxy, block, { _questionID: questionId, _requester: ZERO_ADDRESS, _disputeID: BigInt(disputeId) }, []);
}
