import { readFileSync } from "node:fs";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { encodeEventTopics, hexToBigInt, numberToHex, parseAbi, type Hex } from "viem";
import { z } from "zod";
import { ARBITRATOR_ABI, GNOSIS_ARBITRATOR, disputeStruct, isDisputesCall } from "../support/arbitrator";
import { fakeNetwork, loadRecording, type RpcAnswer, type RpcCall, type Traffic } from "../support/network";

// The on-chain meta-evidence of P-25 on the built app: Gnosis dispute 460, whose arbitrable recorded "DAI token
// compliance Review" in its MetaEvidence(84) event while the meta-evidence API answered another arbitrable's file (the
// Lemon case) on 2026-10-20. Its raw Dispute and MetaEvidence logs, both files and the API's answer are recorded in
// fixtures/gnosis-460-meta-evidence.json; the spec builds the arbitrator's answers itself. The build needs the Gnosis
// read RPC and the meta-evidence API configured, as a deploy has.

const FIXTURE_URL = new URL("fixtures/gnosis-460-meta-evidence.json", import.meta.url);
const RECORDING = loadRecording(FIXTURE_URL);

const LogSchema = z.object({ address: z.string(), topics: z.array(z.string()), blockNumber: z.string() }).loose();
const LogsSchema = z.object({
  arbitrable: z.string(),
  logs: z.object({ dispute: z.array(LogSchema), metaEvidence: z.array(LogSchema) }),
  blockTimestamps: z.record(z.string(), z.string()),
});
const RECORDED = LogsSchema.parse(JSON.parse(readFileSync(FIXTURE_URL, "utf8")) as unknown);
const ARBITRABLE = RECORDED.arbitrable as Hex;
const LOGS = [...RECORDED.logs.dispute, ...RECORDED.logs.metaEvidence];

const CASE_PATH = "/100/cases/460";
const EVENT_TITLE = "DAI token compliance Review";
const LOCATOR_TITLE = "¿Debería la empresa pagar la compensación exigida por el usuario?";
const EVENT_PATH = "/ipfs/QmbtSnH8BB3cgDLwtY6aT7fggnzhyEMVHExqsiVPjBxmcz/metaEvidence.json";
const LOCATOR_PATH = "/ipfs/QmPMaPsRbEQ4Z65GqiBnGEqQNnGQBZX2BuMW9AEXqtit9f/metaEvidence.json";

const ERC1497_ABI = parseAbi(["event MetaEvidence(uint256 indexed _metaEvidenceID, string _evidence)"]);
const [META_EVIDENCE_TOPIC] = encodeEventTopics({ abi: ERC1497_ABI, eventName: "MetaEvidence" });
const [DISPUTE_CREATION_TOPIC] = encodeEventTopics({ abi: ARBITRATOR_ABI, eventName: "DisputeCreation" });

interface LogFilter {
  readonly address?: string;
  readonly topics?: readonly (string | null)[];
  readonly fromBlock?: Hex;
  readonly toBlock?: Hex;
}

function filterOf(call: RpcCall): LogFilter {
  return call.params[0] ?? {};
}

/** The recorded logs a node returns for `filter`: same address, every non-null topic, inside the block range. */
function recordedLogs(filter: LogFilter): RpcAnswer {
  const from = filter.fromBlock === undefined ? 0n : hexToBigInt(filter.fromBlock);
  const to = filter.toBlock === undefined ? BigInt(RECORDING.readAtBlock) : hexToBigInt(filter.toBlock);
  const matching = LOGS.filter((log) => {
    const block = hexToBigInt(log.blockNumber as Hex);
    const topics = filter.topics ?? [];
    return log.address === filter.address?.toLowerCase() && topics.every((topic, index) => topic === null || log.topics[index] === topic) && block >= from && block <= to;
  });
  return { result: matching };
}

/** `disputes(460)` in the execution period, the recorded logs, and the blocks they were mined in. */
function caseRpc(call: RpcCall): RpcAnswer | undefined {
  if (isDisputesCall(call, GNOSIS_ARBITRATOR, 460n)) return disputeStruct({ arbitrated: ARBITRABLE, period: 4, lastPeriodChange: 1_747_840_645n });
  if (call.method === "eth_getLogs") return recordedLogs(filterOf(call));
  if (call.method === "eth_getBlockByNumber") {
    const [number] = call.params as [Hex];
    const timestamp = RECORDED.blockTimestamps[number];
    return timestamp === undefined ? undefined : { result: { number, timestamp, hash: `0x${"cd".repeat(32)}`, transactions: [] } };
  }
  return undefined;
}

async function openCase(context: BrowserContext, page: Page, baseURL: string | undefined, rpc: (call: RpcCall) => RpcAnswer | undefined): Promise<Traffic> {
  const traffic = await fakeNetwork(context, { appOrigin: new URL(baseURL ?? "http://localhost").origin, recordings: [RECORDING], rpc });
  await page.goto(CASE_PATH);
  return traffic;
}

function gatewayPaths(traffic: Traffic): string[] {
  return traffic.http.flatMap((request) => (request.kind === "gateway" ? [request.path] : []));
}

test("P-25: Gnosis 460 renders the on-chain meta-evidence while the locator points elsewhere", async ({ context, page, baseURL }) => {
  const traffic = await openCase(context, page, baseURL, caseRpc);

  await expect(page.getByRole("heading", { name: EVENT_TITLE, exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(LOCATOR_TITLE)).toHaveCount(0);
  expect(traffic.http).toContainEqual({ kind: "locator", chainId: "100", disputeId: "460" });
  expect(gatewayPaths(traffic)).toContain(EVENT_PATH);
  expect(gatewayPaths(traffic)).not.toContain(LOCATOR_PATH);
  const metaEvidenceScans = traffic.rpc.filter((call) => call.method === "eth_getLogs" && filterOf(call).topics?.[0] === META_EVIDENCE_TOPIC);
  expect(metaEvidenceScans.map((call) => filterOf(call).address?.toLowerCase())).toEqual([ARBITRABLE]);
});

test("P-25: when the arbitrable's logs cannot be read the locator's meta-evidence renders, as today", async ({ context, page, baseURL }) => {
  const failingLogs = (call: RpcCall): RpcAnswer | undefined =>
    call.method === "eth_getLogs" && filterOf(call).address?.toLowerCase() === ARBITRABLE ? { error: { code: -32000, message: "header not found" } } : caseRpc(call);
  const traffic = await openCase(context, page, baseURL, failingLogs);

  await expect(page.getByRole("heading", { name: LOCATOR_TITLE, exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("heading", { name: EVENT_TITLE, exact: true })).toHaveCount(0);
  expect(gatewayPaths(traffic)).toContain(LOCATOR_PATH);
  expect(gatewayPaths(traffic)).not.toContain(EVENT_PATH);
});

/** Gnosis's arbitrator lists dispute 460 as open: its creation log, and no `NewPeriod` log. */
function ongoingRpc(call: RpcCall): RpcAnswer | undefined {
  if (isDisputesCall(call, GNOSIS_ARBITRATOR, 460n)) return disputeStruct({ arbitrated: ARBITRABLE, period: 0, lastPeriodChange: BigInt(Math.floor(Date.now() / 1000)) });
  if (call.method !== "eth_getLogs") return undefined;
  const filter = filterOf(call);
  if (filter.address?.toLowerCase() !== GNOSIS_ARBITRATOR || filter.topics?.[0] !== DISPUTE_CREATION_TOPIC) return { result: [] };
  const blockNumber = BigInt(RECORDING.readAtBlock) - 10n;
  const creation = {
    address: GNOSIS_ARBITRATOR,
    topics: encodeEventTopics({ abi: ARBITRATOR_ABI, eventName: "DisputeCreation", args: { _disputeID: 460n, _arbitrable: ARBITRABLE } }),
    data: "0x",
    blockNumber: numberToHex(blockNumber),
    blockHash: `0x${blockNumber.toString(16).padStart(64, "0")}`,
    transactionHash: `0x${"46".repeat(32)}`,
    transactionIndex: "0x0",
    logIndex: "0x0",
    removed: false,
  };
  const from = filter.fromBlock === undefined ? 0n : hexToBigInt(filter.fromBlock);
  const to = filter.toBlock === undefined ? blockNumber : hexToBigInt(filter.toBlock);
  return { result: blockNumber >= from && blockNumber <= to ? [creation] : [] };
}

test("P-25, D-37: the Ongoing page reads no logs of the arbitrables", async ({ context, page, baseURL }) => {
  const traffic = await fakeNetwork(context, { appOrigin: new URL(baseURL ?? "http://localhost").origin, recordings: [RECORDING], rpc: ongoingRpc });
  const card = page.getByRole("link").filter({ has: page.getByText("#460", { exact: true }) });

  await page.goto("/100/ongoing");

  await expect(card.getByRole("heading", { level: 2 })).toHaveText(LOCATOR_TITLE, { timeout: 30_000 });
  const logAddresses = traffic.rpc.filter((call) => call.method === "eth_getLogs").map((call) => filterOf(call).address?.toLowerCase());
  expect(logAddresses.length).toBeGreaterThan(0);
  expect(logAddresses.filter((address) => address !== GNOSIS_ARBITRATOR)).toEqual([]);
  expect(gatewayPaths(traffic)).toContain(LOCATOR_PATH);
  expect(gatewayPaths(traffic)).not.toContain(EVENT_PATH);
});
