/**
 * Recorder of the on-chain meta-evidence fixtures: the raw `Dispute` and `MetaEvidence` logs of Gnosis disputes
 * 460, 431 and 863 read at one pinned block (`src/evidence/__fixtures__/gnosis-460-863-meta-evidence.json`), the 460
 * Playwright recording (`packages/web/e2e/app/fixtures/gnosis-460-meta-evidence.json`), and the `MetaEvidence(0)`
 * `eth_getLogs` answer of the mainnet 1621 governor added to the two mainnet 1621 recordings of packages/web/e2e, at
 * each recording's own block, with the exact filter the case page sends.
 *
 * Usage (from the repository root):
 *   yarn workspace @dispute-resolver/core tsx scripts/record-meta-evidence-events.ts
 *
 * Operator tooling: reads the read RPCs from `process.env` (the repository's `.env`), prints results only, never a URL.
 * Exit code 0 when every file was written, 1 on any failure.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { decodeAbiParameters, encodeEventTopics, numberToHex, type Hex } from "viem";
import { z } from "zod";
import { erc1497Abi } from "../src/abi";
import type { ChainId } from "../src/types";
import { loadRepositoryEnv, rawRpcFor, type RawRpc } from "./recordingRpc";

const RECORDED_ON = "2026-10-20";
const GNOSIS: ChainId = 100;
const MAINNET: ChainId = 1;
/** The Gnosis head the recorded facts were verified at. */
const GNOSIS_HEAD = 48_850_832n;
/** `CHAINS[100].klerosLiquid` and its deployment block (`arbitratorDeployedAtBlock`). */
const GNOSIS_ARBITRATOR = "0x9c1da9a04925bdfdedf0f6421bc7eea8305f9002";
const GNOSIS_SCAN_FROM = 16_895_601n;
/** `CHAINS[1].arbitratorDeployedAtBlock`: the first block of the case page's scans on mainnet. */
const MAINNET_SCAN_FROM = 7_303_699n;
const GATEWAY = "https://cdn.kleros.link";

const GNOSIS_DISPUTES = [
  { disputeId: 460n, arbitrable: "0xc7add3c961f7935cb4914e37da991d2f1cd7986c" },
  { disputeId: 431n, arbitrable: "0xc7add3c961f7935cb4914e37da991d2f1cd7986c" },
  { disputeId: 863n, arbitrable: "0x25fa9432832efdd48deec6d4cf1cd3f139678a5b" },
] as const;

/** The 1621 governor and the two recordings of its case page. */
const MAINNET_1621_ARBITRABLE = "0x327a29fce0a6490e4236240be176daa282eccfdf";
const WEB_E2E = resolve(import.meta.dirname, "../../web/e2e");
const MAINNET_1621_RECORDINGS = [resolve(WEB_E2E, "runner/fixtures/mainnet-1621.rpc.json"), resolve(WEB_E2E, "app/fixtures/mainnet-1621-appeal.json")];

const CORE_FIXTURE = resolve(import.meta.dirname, "../src/evidence/__fixtures__/gnosis-460-863-meta-evidence.json");
const E2E_460_FIXTURE = resolve(WEB_E2E, "app/fixtures/gnosis-460-meta-evidence.json");

/** What the meta-evidence API answered for Gnosis 460 on every request of 2026-10-20 (5 of 5): another arbitrable's file. */
const LOCATOR_460 = "/ipfs/QmPMaPsRbEQ4Z65GqiBnGEqQNnGQBZX2BuMW9AEXqtit9f/metaEvidence.json";
/** The default script both 460 files name; the e2e gateway answers it 404, as the unit tests do. */
const DEFAULT_SCRIPT_PATH = "/ipfs/QmZZHwVaXWtvChdFPG4UeXStKaC9aHamwQkNTEAfRmT2Fj";

const rawLog = z.looseObject({ blockNumber: z.string(), logIndex: z.string(), data: z.string(), topics: z.array(z.string()), transactionHash: z.string() });
type RawLog = z.infer<typeof rawLog>;
const rawLogs = z.array(rawLog);

/** The node's logs exactly as it sent them, key order included, once they are checked to be logs. */
async function requestLogs(rpc: RawRpc, params: readonly unknown[]): Promise<RawLog[]> {
  const result = await rpc.request("eth_getLogs", params);
  rawLogs.parse(result);
  return result as RawLog[];
}
const block = z.looseObject({ timestamp: z.string() });
const recordedCall = z.looseObject({ method: z.string(), params: z.array(z.unknown()) });
const recording = z.looseObject({ description: z.string(), readAtBlock: z.number(), calls: z.array(recordedCall) });

function hex(value: bigint): Hex {
  return numberToHex(value);
}

/** One `eth_getLogs` filter, spelled as viem sends it. */
function filterOf(address: string, topics: readonly (Hex | null)[], fromBlock: bigint, toBlock: bigint) {
  return { address, topics, fromBlock: hex(fromBlock), toBlock: hex(toBlock) };
}

function metaEvidenceTopics(metaEvidenceId: bigint): Hex[] {
  return encodeEventTopics({ abi: erc1497Abi, eventName: "MetaEvidence", args: { _metaEvidenceID: metaEvidenceId } }) as Hex[];
}

/** The logs of `[from, to]`, the range halved where the node refuses it. */
async function scan(rpc: RawRpc, address: string, topics: readonly (Hex | null)[], from: bigint, to: bigint, depth = 0): Promise<RawLog[]> {
  try {
    return await requestLogs(rpc, [filterOf(address, topics, from, to)]);
  } catch (error) {
    if (depth >= 16 || to <= from) throw error;
    const middle = from + (to - from) / 2n;
    return [...(await scan(rpc, address, topics, from, middle, depth + 1)), ...(await scan(rpc, address, topics, middle + 1n, to, depth + 1))];
  }
}

async function timestampOf(rpc: RawRpc, blockNumber: string): Promise<Hex> {
  return block.parse(await rpc.request("eth_getBlockByNumber", [blockNumber, false])).timestamp as Hex;
}

function decodedUri(log: RawLog): string {
  const [uri] = decodeAbiParameters([{ type: "string" }], log.data as Hex);
  return uri;
}

/** The latest log by block and log index. */
function latest(logs: readonly RawLog[]): RawLog | undefined {
  const order = (log: RawLog): readonly [bigint, bigint] => [BigInt(log.blockNumber), BigInt(log.logIndex)];
  return [...logs]
    .sort((left, right) => {
      const [leftBlock, leftIndex] = order(left);
      const [rightBlock, rightIndex] = order(right);
      return leftBlock === rightBlock ? Number(leftIndex - rightIndex) : Number(leftBlock - rightBlock);
    })
    .at(-1);
}

interface GnosisDispute {
  readonly disputeId: string;
  readonly arbitrable: string;
  readonly metaEvidenceId: string;
  readonly disputeLogs: RawLog[];
  readonly metaEvidenceLogs: RawLog[];
  readonly blockTimestamps: Record<string, Hex>;
}

async function recordGnosisDispute(rpc: RawRpc, dispute: (typeof GNOSIS_DISPUTES)[number]): Promise<GnosisDispute> {
  const disputeTopics = encodeEventTopics({ abi: erc1497Abi, eventName: "Dispute", args: { _arbitrator: GNOSIS_ARBITRATOR, _disputeID: dispute.disputeId } }) as Hex[];
  const disputeLogs = await scan(rpc, dispute.arbitrable, disputeTopics, GNOSIS_SCAN_FROM, GNOSIS_HEAD);
  const [disputeLog] = disputeLogs;
  if (disputeLogs.length !== 1 || disputeLog === undefined) throw new Error(`Gnosis ${String(dispute.disputeId)}: ${String(disputeLogs.length)} Dispute logs.`);
  const [metaEvidenceId] = decodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], disputeLog.data as Hex);
  const metaEvidenceLogs = await scan(rpc, dispute.arbitrable, metaEvidenceTopics(metaEvidenceId), 0n, GNOSIS_HEAD);
  const blocks = [...new Set([disputeLog, ...metaEvidenceLogs].map((log) => log.blockNumber))];
  const blockTimestamps: Record<string, Hex> = Object.fromEntries(await Promise.all(blocks.map(async (number) => [number, await timestampOf(rpc, number)] as const)));
  return { disputeId: dispute.disputeId.toString(), arbitrable: dispute.arbitrable, metaEvidenceId: metaEvidenceId.toString(), disputeLogs, metaEvidenceLogs, blockTimestamps };
}

function describeDispute(dispute: GnosisDispute): string {
  const emissions = dispute.metaEvidenceLogs.map((log) => `${String(BigInt(log.blockNumber))}/${String(BigInt(log.logIndex))} ${decodedUri(log)}`).join("; ");
  const [disputeLog] = dispute.disputeLogs;
  const at = disputeLog === undefined ? "?" : `${String(BigInt(disputeLog.blockNumber))}/${String(BigInt(disputeLog.logIndex))}`;
  return `Gnosis ${dispute.disputeId}: Dispute at ${at}, metaEvidenceID ${dispute.metaEvidenceId}, MetaEvidence ${emissions}`;
}

async function fetchGatewayJson(path: string): Promise<unknown> {
  const response = await fetch(`${GATEWAY}${path}`);
  if (!response.ok) throw new Error(`The gateway answered HTTP ${String(response.status)} for ${path}.`);
  return response.json();
}

async function recordGnosis(): Promise<GnosisDispute[]> {
  const rpc = rawRpcFor(GNOSIS);
  const disputes: GnosisDispute[] = [];
  for (const dispute of GNOSIS_DISPUTES) disputes.push(await recordGnosisDispute(rpc, dispute));
  const fixture = {
    provenance: `Raw eth_getLogs objects and block timestamps read from the Gnosis (chain 100) read RPC on ${RECORDED_ON} with the chain head at block ${String(GNOSIS_HEAD)} (readAtBlock), by packages/core/scripts/record-meta-evidence-events.ts: each dispute's ERC-1497 Dispute log (filtered on the arbitrator and the dispute ID over [scanFromBlock, readAtBlock]) and every MetaEvidence log of its metaEvidenceID (over [0, readAtBlock]). P-25: the meta-evidence API answered ${LOCATOR_460} for dispute 460 on every request of that day.`,
    chainId: GNOSIS,
    readAtBlock: Number(GNOSIS_HEAD),
    arbitrator: GNOSIS_ARBITRATOR,
    scanFromBlock: Number(GNOSIS_SCAN_FROM),
    disputes,
  };
  writeFileSync(CORE_FIXTURE, `${JSON.stringify(fixture, null, 2)}\n`);
  for (const dispute of disputes) console.info(describeDispute(dispute));
  return disputes;
}

/** The Playwright recording of Gnosis 460's case page: its two logs, the two files the chain and the API name, the API's answer. */
async function record460E2e(dispute: GnosisDispute): Promise<void> {
  const eventLog = latest(dispute.metaEvidenceLogs);
  if (eventLog === undefined) throw new Error("Gnosis 460 has no MetaEvidence log.");
  const eventPath = decodedUri(eventLog);
  const recorded = await Promise.all([eventPath, LOCATOR_460].map(async (path) => ({ path, status: 200, body: await fetchGatewayJson(path) })));
  const files = [...recorded, { path: DEFAULT_SCRIPT_PATH, status: 404, body: null }];
  const fixture = {
    description: `Gnosis dispute 460 (ArbitrableProxy, local meta-evidence ID 84) for P-25: its raw Dispute and MetaEvidence(84) logs read from the Gnosis read RPC on ${RECORDED_ON} with the head at readAtBlock, the two meta-evidence files read from ${GATEWAY} the same day (the chain's ${eventPath} and the API's ${LOCATOR_460}), and the meta-evidence API's answer of that day (locator). The default script both files name is answered 404, so the files render without it. The spec answers eth_getLogs by topic from logs and builds every other read itself.`,
    chainId: GNOSIS,
    disputeId: dispute.disputeId,
    readAtBlock: Number(GNOSIS_HEAD),
    arbitrable: dispute.arbitrable,
    logs: { dispute: dispute.disputeLogs, metaEvidence: dispute.metaEvidenceLogs },
    blockTimestamps: dispute.blockTimestamps,
    calls: [],
    locator: { metaEvidenceUri: LOCATOR_460 },
    files,
  };
  writeFileSync(E2E_460_FIXTURE, `${JSON.stringify(fixture, null, 2)}\n`);
  const served = files.map((file) => `${file.path} ${String(file.status)}`).join(", ");
  console.info(`Gnosis 460 e2e: files ${served}`);
}

/** Where the recording's top-level `calls` array closes, so new calls are inserted without reformatting the rest of the file. */
function callsEnd(text: string): number {
  const start = text.indexOf('"calls": [');
  const close = /\n {2}\]/g;
  close.lastIndex = start;
  const match = close.exec(text);
  if (start < 0 || match === null) throw new Error("The recording has no top-level calls array.");
  return match.index;
}

/**
 * Adds the MetaEvidence(0) scan of the 1621 governor at the recording's block, as the case page sends it: the first
 * pass, and the second when the first is empty. The file is edited in place: a call already recorded is left as it is,
 * and the rest of the file keeps its formatting.
 */
async function recordMainnet1621(file: string, rpc: RawRpc): Promise<void> {
  const text = readFileSync(file, "utf8");
  const parsed = recording.parse(JSON.parse(text));
  const head = BigInt(parsed.readAtBlock);
  const topics = metaEvidenceTopics(0n);
  const passes = [filterOf(MAINNET_1621_ARBITRABLE, topics, MAINNET_SCAN_FROM, head)];
  const added: { method: string; params: unknown[]; result: RawLog[] }[] = [];
  const first = await requestLogs(rpc, passes);
  added.push({ method: "eth_getLogs", params: passes, result: first });
  if (first.length === 0) {
    const second = [filterOf(MAINNET_1621_ARBITRABLE, topics, 0n, MAINNET_SCAN_FROM - 1n)];
    added.push({ method: "eth_getLogs", params: second, result: await requestLogs(rpc, second) });
  }
  const recorded = new Set(parsed.calls.map((call) => JSON.stringify([call.method, call.params])));
  const missing = added.filter((call) => !recorded.has(JSON.stringify([call.method, call.params])));
  const latestLog = latest(added.flatMap((call) => call.result));
  const name = file.slice(WEB_E2E.length + 1);
  console.info(
    `${name}: ${String(added.length)} pass(es), latest MetaEvidence(0) ${latestLog === undefined ? "none" : decodedUri(latestLog)}, ${String(missing.length)} call(s) added`,
  );
  if (missing.length === 0) return;
  const provenance = ` P-25: the governor's MetaEvidence(0) eth_getLogs answer was added on ${RECORDED_ON}, read from the chain-1 read RPC at readAtBlock by packages/core/scripts/record-meta-evidence-events.ts.`;
  const end = callsEnd(text);
  const inserted = missing.map((call) => `,\n    ${JSON.stringify(call)}`).join("");
  // The provenance is appended inside the description's JSON string, which keeps its own escapes.
  const updated = `${text.slice(0, end)}${inserted}${text.slice(end)}`.replace(/("description": "(?:[^"\\]|\\.)*)"/, (_match, head: string) => `${head}${provenance}"`);
  writeFileSync(file, updated);
}

async function main(): Promise<number> {
  loadRepositoryEnv();
  const disputes = await recordGnosis();
  const dispute460 = disputes.find((dispute) => dispute.disputeId === "460");
  if (dispute460 === undefined) throw new Error("Gnosis 460 was not recorded.");
  await record460E2e(dispute460);
  const mainnet = rawRpcFor(MAINNET);
  for (const file of MAINNET_1621_RECORDINGS) await recordMainnet1621(file, mainnet);
  return 0;
}

try {
  process.exitCode = await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "The recording failed.");
  process.exitCode = 1;
}
