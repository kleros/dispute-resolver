import type { RealityProxyEntry } from "../registry/types";
import { createRequestBudget, getLogsChunked } from "../rpc";
import type { ChainId, GetReadClient, Hex, ReadClient, RegistryKey } from "../types";
import { ARBITRATION_CREATED, DISPUTE_ID_TO_QUESTION_ID, LOG_NEW_QUESTION } from "./events";
import { findLatestLogs } from "./findLatestLogs";
import { blockOf, requireHex, requireSingleLog } from "./logs";
import { requireClient } from "./lookup";
import type { KnownDisputeQuestion } from "./types";

export interface KnownQuestionsData {
  /** Arbitrator chain ID → last block covered by `questions`. */
  readonly snapshotBlocks: Readonly<Record<ChainId, number>>;
  /** Keyed by `"<arbitrator chain>:<lowercase proxy>:<dispute ID>"`. */
  readonly questions: Readonly<Record<string, KnownDisputeQuestion>>;
}

/**
 * - `incremental`: disputes already known are re-verified with single-block queries, and the disputeID → questionID
 *   events are only scanned after the previous snapshot block (from the deployment block for proxies without known
 *   disputes, such as newly registered ones).
 * - `full`: everything is rescanned from the deployment blocks.
 * - `check`: everything is recomputed at the current snapshot blocks; the caller compares the rendering with the file.
 */
export type GeneratorMode = "incremental" | "full" | "check";

export interface GeneratorRequest {
  readonly proxies: Readonly<Record<RegistryKey, RealityProxyEntry>>;
  readonly previous: KnownQuestionsData;
  readonly mode: GeneratorMode;
  /** Built from the registry chains' configured RPCs. */
  readonly clients: GetReadClient;
  readonly onProgress?: (line: string) => void;
}

interface DisputeMapping {
  readonly questionId: Hex;
  readonly mappingBlock: bigint;
}

/** The generator runs unattended for minutes: its requests are bounded only by the clients' own timeouts. */
const UNLIMITED = createRequestBudget({ maxRequests: Number.POSITIVE_INFINITY, deadlineMs: Number.POSITIVE_INFINITY });

async function finalizedBlock(client: ReadClient): Promise<number> {
  return Number((await client.getBlock({ blockTag: "finalized", includeTransactions: false })).number);
}

async function collectDisputes(key: string, entry: RealityProxyEntry, client: ReadClient, fromBlock: bigint, toBlock: bigint): Promise<Map<bigint, DisputeMapping>> {
  const event = entry.kind === "single-chain" ? DISPUTE_ID_TO_QUESTION_ID : ARBITRATION_CREATED;
  const logs = await getLogsChunked(client, { address: entry.proxy, event, fromBlock, toBlock });
  const disputes = new Map<bigint, DisputeMapping>();
  for (const log of logs) {
    const disputeId = log.args._disputeID;
    if (disputeId === undefined) throw new Error(`${key}: malformed ${event.name} log.`);
    if (disputes.has(disputeId)) throw new Error(`${key}: dispute ${disputeId.toString()} mapped twice`);
    disputes.set(disputeId, { questionId: requireHex(log.args._questionID, event.name).toLowerCase() as Hex, mappingBlock: blockOf(log) });
  }
  return disputes;
}

function questionFromLog(
  log: { readonly blockNumber: bigint | null; readonly args: { readonly question_id?: Hex; readonly template_id?: bigint } },
  questionId: Hex,
): KnownDisputeQuestion {
  if (log.args.question_id?.toLowerCase() !== questionId || log.args.template_id === undefined) throw new Error(`Unexpected LogNewQuestion for ${questionId}`);
  return { questionId, questionBlock: Number(blockOf(log)), templateId: Number(log.args.template_id) };
}

function questionLogs(entry: RealityProxyEntry, client: ReadClient, questionId: Hex, fromBlock: bigint, toBlock: bigint) {
  return findLatestLogs(client, { address: entry.reality, event: LOG_NEW_QUESTION, args: { question_id: questionId }, fromBlock, toBlock }, UNLIMITED);
}

async function questionIn(key: string, entry: RealityProxyEntry, client: ReadClient, questionId: Hex, fromBlock: bigint, toBlock: bigint): Promise<KnownDisputeQuestion> {
  const logs = await questionLogs(entry, client, questionId, fromBlock, toBlock);
  return questionFromLog(requireSingleLog(logs, `LogNewQuestion for ${questionId} (${key})`), questionId);
}

async function verifyQuestion(key: string, entry: RealityProxyEntry, client: ReadClient, known: KnownDisputeQuestion): Promise<KnownDisputeQuestion> {
  const block = BigInt(known.questionBlock);
  const [log, ...others] = await questionLogs(entry, client, known.questionId, block, block);
  if (log === undefined || others.length > 0) throw new Error(`${key}: LogNewQuestion of ${known.questionId} not at ${String(known.questionBlock)}`);
  const question = questionFromLog(log, known.questionId);
  if (question.templateId !== known.templateId) throw new Error(`${key}: template of ${known.questionId} changed`);
  return question;
}

function chainOfKey(key: string): ChainId {
  return Number(key.slice(0, key.indexOf(":")));
}

function previousDisputes(previous: KnownQuestionsData, key: string): [string, KnownDisputeQuestion][] {
  return Object.entries(previous.questions)
    .filter(([knownKey]) => knownKey.startsWith(`${key}:`))
    .map(([knownKey, question]) => [knownKey.slice(key.length + 1), question]);
}

async function generateProxy(
  request: GeneratorRequest,
  key: RegistryKey,
  entry: RealityProxyEntry,
  snapshotBlocks: Readonly<Record<ChainId, number>>,
): Promise<Record<string, KnownDisputeQuestion>> {
  const chainId = chainOfKey(key);
  const snapshotBlock = snapshotBlocks[chainId];
  if (snapshotBlock === undefined || snapshotBlock === 0) throw new Error(`No snapshot block for chain ${String(chainId)}`);
  const arbitrator = requireClient(request.clients, chainId);
  const reality = entry.realityChainId === chainId ? arbitrator : requireClient(request.clients, entry.realityChainId);

  const known = previousDisputes(request.previous, key);
  const previousSnapshot = request.previous.snapshotBlocks[chainId];
  const incremental = request.mode === "incremental" && known.length > 0 && previousSnapshot !== undefined && previousSnapshot > 0;
  const fromBlock = BigInt(incremental ? Math.max(previousSnapshot + 1, entry.proxyDeployBlock) : entry.proxyDeployBlock);
  const disputes = await collectDisputes(key, entry, arbitrator, fromBlock, BigInt(snapshotBlock));

  const questions: Record<string, KnownDisputeQuestion> = {};
  if (incremental) {
    for (const [disputeId, question] of known) {
      if (disputes.has(BigInt(disputeId))) throw new Error(`${key}: dispute ${disputeId} mapped twice`);
      questions[`${key}:${disputeId}`] = await verifyQuestion(key, entry, reality, question);
    }
  }
  for (const [disputeId, mapping] of disputes) {
    const knownKey = `${key}:${disputeId.toString()}`;
    const previousQuestion = request.previous.questions[knownKey];
    if (previousQuestion?.questionId === mapping.questionId) {
      questions[knownKey] = await verifyQuestion(key, entry, reality, previousQuestion);
      continue;
    }
    const toBlock = entry.realityChainId === chainId ? mapping.mappingBlock : BigInt(await finalizedBlock(reality));
    questions[knownKey] = await questionIn(key, entry, reality, mapping.questionId, BigInt(entry.realityDeployBlock), toBlock);
  }
  return questions;
}

/**
 * Rejects on any inconsistency: a known question that moved or changed template, a dispute mapped twice, a log count
 * other than one.
 */
export async function generateKnownQuestions(request: GeneratorRequest): Promise<KnownQuestionsData> {
  const entries = Object.entries(request.proxies) as [RegistryKey, RealityProxyEntry][];
  const chainIds = [...new Set(entries.map(([key]) => chainOfKey(key)))];

  const snapshotBlocks: Record<ChainId, number> =
    request.mode === "check"
      ? { ...request.previous.snapshotBlocks }
      : Object.fromEntries(await Promise.all(chainIds.map(async (chainId) => [chainId, await finalizedBlock(requireClient(request.clients, chainId))] as const)));

  const questions: Record<string, KnownDisputeQuestion> = {};
  for (const [key, entry] of entries) {
    const proxyQuestions = await generateProxy(request, key, entry, snapshotBlocks);
    Object.assign(questions, proxyQuestions);
    request.onProgress?.(`${key}: ${String(Object.keys(proxyQuestions).length)} dispute(s)`);
  }
  return { snapshotBlocks, questions };
}

function compareKeys(a: string, b: string): number {
  const [chainA = "", proxyA = "", disputeA = "0"] = a.split(":");
  const [chainB = "", proxyB = "", disputeB = "0"] = b.split(":");
  if (chainA !== chainB) return Number(chainA) - Number(chainB);
  if (proxyA !== proxyB) return proxyA < proxyB ? -1 : 1;
  const difference = BigInt(disputeA) - BigInt(disputeB);
  if (difference === 0n) return 0;
  return difference < 0n ? -1 : 1;
}

/**
 * Sorted, in the layout prettier keeps, so a regeneration only changes what the chain data changed. `--check` compares
 * this text with the committed file.
 */
export function renderKnownQuestionsModule(data: KnownQuestionsData): string {
  const blocks = Object.entries(data.snapshotBlocks)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([chainId, block]) => `${chainId}: ${String(block)}`)
    .join(", ");
  const entries = Object.keys(data.questions)
    .sort(compareKeys)
    .map((key) => {
      const question = data.questions[key];
      return question === undefined
        ? ""
        : `  "${key}": {\n    questionId: "${question.questionId}",\n    questionBlock: ${String(question.questionBlock)},\n    templateId: ${String(question.templateId)},\n  },`;
    });
  return `// Generated by the known-questions generator (reality/generator.ts): do not edit by hand.
//
// Reality.eth questions of the disputes created by the registered Reality.eth proxies (REGISTRY.realityProxies), keyed by
// "<arbitrator chain ID>:<lowercase proxy>:<dispute ID>". Lets fetchRealityQuestion skip the eth_getLogs scans of the
// disputeID -> questionID event and of the LogNewQuestion event for these disputes.
//
// The map is complete up to REGISTRY_SNAPSHOT_BLOCKS[arbitratorChainId] (a finalized block at generation time):
// disputes missing from it are only searched after that block. Regenerate this file whenever a proxy is added to
// the registry.
import type { ChainId } from "../types";
import type { KnownDisputeQuestion } from "./types";

/** Arbitrator chain ID => last block covered by KNOWN_DISPUTE_QUESTIONS. */
export const REGISTRY_SNAPSHOT_BLOCKS: Readonly<Record<ChainId, number>> = { ${blocks} };

export const KNOWN_DISPUTE_QUESTIONS: Readonly<Record<string, KnownDisputeQuestion>> = {
${entries.join("\n")}
};
`;
}
