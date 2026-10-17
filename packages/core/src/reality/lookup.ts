import type { AbiEvent, GetLogsReturnType } from "viem";
import { realityAbi, realityProxyAbi } from "../abi";
import type { RealityProxyEntry } from "../registry/types";
import { createRequestBudget, isLookupLimitError } from "../rpc";
import type { RequestBudget } from "../rpc/types";
import type { ChainId, GetReadClient, Hex, ReadClient } from "../types";
import { LOOKUP_LIMITS } from "./constants";
import { ARBITRATION_CREATED, DISPUTE_ID_TO_QUESTION_ID, LOG_NEW_QUESTION, LOG_NEW_TEMPLATE } from "./events";
import { findLatestLogsRemembering, type LogsRequest, type WindowMemory } from "./findLatestLogs";
import { REGISTRY_SNAPSHOT_BLOCKS } from "./knownQuestions.generated";
import { blockOf, requireHex, requireSingleLog } from "./logs";
import type { KnownDisputeQuestion, LookupReadClients, RealityQuestion } from "./types";

/** The question of a cross-chain dispute was created before its arbitration, one clock-skew margin at most. */
const CLOCK_SKEW_MARGIN_S = 3600;
const MAX_BLOCK_SEARCH_STEPS = 8;

/** The state shared by every request of one lookup. */
interface Lookup {
  readonly entry: RealityProxyEntry;
  readonly arbitrator: ReadClient;
  /** The arbitrator chain client that makes one attempt per request, for the `arbitrationCreatedBlock` hint. */
  readonly hintReader: ReadClient;
  readonly reality: ReadClient;
  /** Already spent by the clients for every attempt they send, so the searches must not spend it again. */
  readonly counted: RequestBudget;
  readonly signal: AbortSignal | undefined;
  readonly windows: Map<ReadClient, WindowMemory>;
}

interface BlockHeader {
  readonly number: number;
  readonly timestamp: number;
}

export interface LookupRequest {
  readonly entry: RealityProxyEntry;
  readonly arbitratorChainId: ChainId;
  readonly disputeId: bigint;
  readonly clients: LookupReadClients;
  readonly known: KnownDisputeQuestion | undefined;
  readonly deadlineMs: number | undefined;
  readonly signal: AbortSignal | undefined;
}

/** Whether an error must end the lookup instead of falling back to another way of searching. */
function isFatal(lookup: Lookup, error: unknown): boolean {
  return isLookupLimitError(error) || lookup.signal?.aborted === true;
}

/**
 * The request budget of a lookup, spent by its clients before every attempt, retries included: it stops the lookup at the
 * first attempt after its request count or deadline is exceeded, or once `signal` aborts.
 */
function lookupBudget(deadlineMs: number | undefined, signal: AbortSignal | undefined): RequestBudget {
  const budget = createRequestBudget({ maxRequests: LOOKUP_LIMITS.requestBudget, deadlineMs: Math.min(deadlineMs ?? LOOKUP_LIMITS.deadlineMs, LOOKUP_LIMITS.deadlineMs) });
  return {
    spend() {
      signal?.throwIfAborted();
      budget.spend();
    },
    remainingMs: () => budget.remainingMs(),
  };
}

export function requireClient(clients: GetReadClient, chainId: ChainId): ReadClient {
  const client = clients(chainId);
  if (client === undefined) throw new Error(`no RPC configured for chain ${String(chainId)}`);
  return client;
}

async function findLogs<const TEvent extends AbiEvent>(lookup: Lookup, client: ReadClient, request: LogsRequest<TEvent>): Promise<GetLogsReturnType<TEvent>> {
  const memory = lookup.windows.get(client) ?? { size: undefined };
  lookup.windows.set(client, memory);
  return findLatestLogsRemembering(client, request, lookup.counted, memory);
}

async function headBlock(client: ReadClient): Promise<bigint> {
  return client.getBlockNumber({ cacheTime: 0 });
}

async function blockHeader(client: ReadClient, blockNumber: bigint): Promise<BlockHeader> {
  const block = await client.getBlock({ blockNumber, includeTransactions: false });
  return { number: Number(block.number), timestamp: Number(block.timestamp) };
}

/** Search window of the disputeID -> questionID event of a dispute missing from the known disputes map. */
function unknownDisputeFromBlock(arbitratorChainId: ChainId, entry: RealityProxyEntry): bigint {
  return BigInt(Math.max(entry.proxyDeployBlock, (REGISTRY_SNAPSHOT_BLOCKS[arbitratorChainId] ?? 0) + 1));
}

/**
 * The `ArbitrationCreated` event of the dispute at the block the proxy says it was emitted in, when it says so. The hint
 * is read once: if it fails the lookup falls back to the scan at once instead of waiting for retries.
 */
async function arbitrationCreatedFromHint(lookup: Lookup, disputeId: bigint) {
  const { entry } = lookup;
  if (!entry.hasArbitrationCreatedBlock) return undefined;
  try {
    const block = await lookup.hintReader.readContract({ address: entry.proxy, abi: realityProxyAbi, functionName: "arbitrationCreatedBlock", args: [disputeId] });
    if (block <= 0n) return undefined;
    const logs = await findLogs(lookup, lookup.arbitrator, { address: entry.proxy, event: ARBITRATION_CREATED, args: { _disputeID: disputeId }, fromBlock: block, toBlock: block });
    return logs.length === 1 ? logs[0] : undefined;
  } catch (error) {
    if (isFatal(lookup, error)) throw error;
    return undefined; // Falls back to the scan.
  }
}

/** The question ID of a dispute created after the known disputes snapshot, and the block of the event that maps it. */
async function findQuestionId(lookup: Lookup, arbitratorChainId: ChainId, disputeId: bigint): Promise<{ readonly questionId: Hex; readonly mappingBlock: bigint }> {
  const { entry } = lookup;
  const fromBlock = unknownDisputeFromBlock(arbitratorChainId, entry);

  if (entry.kind === "single-chain") {
    const toBlock = await headBlock(lookup.arbitrator);
    const logs = await findLogs(lookup, lookup.arbitrator, { address: entry.proxy, event: DISPUTE_ID_TO_QUESTION_ID, args: { _disputeID: disputeId }, fromBlock, toBlock });
    const log = requireSingleLog(logs, "DisputeIDToQuestionID");
    return { questionId: requireHex(log.args._questionID, "DisputeIDToQuestionID"), mappingBlock: blockOf(log) };
  }

  const hinted = await arbitrationCreatedFromHint(lookup, disputeId);
  const log = hinted ?? requireSingleLog(await scanArbitrationCreated(lookup, disputeId, fromBlock), "ArbitrationCreated");
  return { questionId: requireHex(log.args._questionID, "ArbitrationCreated"), mappingBlock: blockOf(log) };
}

async function scanArbitrationCreated(lookup: Lookup, disputeId: bigint, fromBlock: bigint) {
  const toBlock = await headBlock(lookup.arbitrator);
  return findLogs(lookup, lookup.arbitrator, { address: lookup.entry.proxy, event: ARBITRATION_CREATED, args: { _disputeID: disputeId }, fromBlock, toBlock });
}

/**
 * Upper bound of the `LogNewQuestion` block of a cross-chain dispute: the question was created on the Reality.eth chain
 * before the arbitration was created on the arbitrator chain (after a bridge round trip), so the first Reality.eth chain
 * block at or after the `ArbitrationCreated` timestamp (plus a margin for clock skew) bounds it. Found by interpolation
 * search in a few requests, any block at or after the timestamp being a valid (if looser) bound. Falls back to the
 * Reality.eth chain head, which is always a valid bound.
 */
async function crossChainQuestionBlockUpperBound(lookup: Lookup, mappingBlock: bigint): Promise<bigint> {
  const latest = await headBlock(lookup.reality);
  try {
    const target = (await blockHeader(lookup.arbitrator, mappingBlock)).timestamp + CLOCK_SKEW_MARGIN_S;
    let [low, high] = await Promise.all([blockHeader(lookup.reality, BigInt(lookup.entry.realityDeployBlock)), blockHeader(lookup.reality, latest)]);
    if (high.timestamp <= target) return latest;
    if (low.timestamp >= target) return BigInt(low.number);
    for (let step = 0; step < MAX_BLOCK_SEARCH_STEPS && high.number - low.number > 1; step++) {
      const ratio = (target - low.timestamp) / (high.timestamp - low.timestamp);
      const guess = Math.min(high.number - 1, Math.max(low.number + 1, Math.ceil(low.number + ratio * (high.number - low.number))));
      const block = await blockHeader(lookup.reality, BigInt(guess));
      if (block.timestamp >= target) high = block;
      else low = block;
    }
    return BigInt(high.number);
  } catch (error) {
    if (isFatal(lookup, error)) throw error;
    return latest;
  }
}

/** The `LogNewQuestion` of `questionId` in `[fromBlock, toBlock]`: its template ID and question text. */
async function readQuestionLog(lookup: Lookup, questionId: Hex, fromBlock: bigint, toBlock: bigint): Promise<{ readonly templateId: string; readonly questionText: string }> {
  const logs = await findLogs(lookup, lookup.reality, { address: lookup.entry.reality, event: LOG_NEW_QUESTION, args: { question_id: questionId }, fromBlock, toBlock });
  const { args } = requireSingleLog(logs, "LogNewQuestion");
  if (args.question_id?.toLowerCase() !== questionId.toLowerCase()) throw new Error(`LogNewQuestion log does not match question ${questionId}.`);
  if (args.template_id === undefined || args.question === undefined) throw new Error(`Malformed LogNewQuestion log for question ${questionId}.`);
  return { templateId: args.template_id.toString(), questionText: args.question };
}

async function readTemplateText(lookup: Lookup, templateId: bigint): Promise<string> {
  const { entry } = lookup;
  const block = await lookup.reality.readContract({ address: entry.reality, abi: realityAbi, functionName: "templates", args: [templateId] });
  if (block === 0n) throw new Error(`Template ${templateId.toString()} does not exist.`);
  const logs = await findLogs(lookup, lookup.reality, { address: entry.reality, event: LOG_NEW_TEMPLATE, args: { template_id: templateId }, fromBlock: block, toBlock: block });
  const { args } = requireSingleLog(logs, "LogNewTemplate");
  if (args.question_text === undefined) throw new Error(`Malformed LogNewTemplate log for template ${templateId.toString()}.`);
  return args.question_text;
}

/** A known dispute: question ID, question block and template ID are known, so 3 requests in 2 round trips. */
async function lookupKnown(lookup: Lookup, known: KnownDisputeQuestion): Promise<RealityQuestion> {
  const { questionId } = known;
  const questionBlock = BigInt(known.questionBlock);
  const [question, templateText] = await Promise.all([readQuestionLog(lookup, questionId, questionBlock, questionBlock), readTemplateText(lookup, BigInt(known.templateId))]);
  if (question.templateId !== String(known.templateId)) throw new Error(`Question ${questionId} uses template ${question.templateId}, expected ${String(known.templateId)}.`);
  return toQuestion(lookup.entry, questionId, question, templateText);
}

/** A dispute created after the snapshot: its question ID is searched on the proxy, then its question and template. */
async function lookupUnknown(lookup: Lookup, arbitratorChainId: ChainId, disputeId: bigint): Promise<RealityQuestion> {
  const { questionId, mappingBlock } = await findQuestionId(lookup, arbitratorChainId, disputeId);
  const upperBound = lookup.entry.kind === "single-chain" ? mappingBlock : await crossChainQuestionBlockUpperBound(lookup, mappingBlock);
  const question = await readQuestionLog(lookup, questionId, BigInt(lookup.entry.realityDeployBlock), upperBound);
  const templateText = await readTemplateText(lookup, BigInt(question.templateId));
  return toQuestion(lookup.entry, questionId, question, templateText);
}

function toQuestion(entry: RealityProxyEntry, questionId: Hex, question: { readonly templateId: string; readonly questionText: string }, templateText: string): RealityQuestion {
  return {
    questionId,
    templateId: question.templateId,
    templateText,
    questionText: question.questionText,
    reality: entry.reality,
    realityChainId: entry.realityChainId,
  };
}

/**
 * Looks up the Reality.eth question and template behind a dispute of a registered proxy straight from the chain (spec
 * 9.1). Rejects on any failure: a missing client, an exhausted budget or deadline, an abort, an RPC error, a log count
 * other than one, inconsistent data.
 */
export async function lookupRealityQuestion(request: LookupRequest): Promise<RealityQuestion> {
  const { entry, arbitratorChainId } = request;
  const budget = lookupBudget(request.deadlineMs, request.signal);
  const clients = request.clients(budget);
  const arbitrator = requireClient(clients, arbitratorChainId);
  const reality = entry.realityChainId === arbitratorChainId ? arbitrator : requireClient(clients, entry.realityChainId);
  const hintReader = requireClient(request.clients(budget, { retryCount: 0 }), arbitratorChainId);
  const counted: RequestBudget = { spend: () => undefined, remainingMs: () => budget.remainingMs() };
  const lookup: Lookup = { entry, arbitrator, hintReader, reality, counted, signal: request.signal, windows: new Map() };
  return request.known === undefined ? lookupUnknown(lookup, arbitratorChainId, request.disputeId) : lookupKnown(lookup, request.known);
}
