import { readFileSync } from "node:fs";
import { expect, test, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { encodeEventTopics, hexToBigInt, parseAbi, type Hex } from "viem";
import { z } from "zod";
import { DISPUTE_CREATION_TOPIC, GNOSIS_ARBITRATOR, caseDetailsAnswers, creationLog, disputeStruct, isDisputesCall, logFilterFor } from "../support/arbitrator";
import { disputeCard } from "../support/header";
import { appOriginOf, fakeNetwork, loadRecording, type HttpAnswer, type HttpRequest, type RpcAnswer, type RpcCall, type Traffic } from "../support/network";

// Gnosis dispute 460's arbitrable recorded "DAI token compliance Review" in its MetaEvidence(84) event while the
// meta-evidence API answered another arbitrable's file on 2026-10-20 (fixtures/gnosis-460-meta-evidence.json).

const FIXTURE_URL = new URL("fixtures/gnosis-460-meta-evidence.json", import.meta.url);
const CORE_FIXTURE_URL = new URL("../../../core/src/evidence/__fixtures__/gnosis-460-863-meta-evidence.json", import.meta.url);
const RECORDING = loadRecording(FIXTURE_URL);

const LogSchema = z.object({ address: z.string(), topics: z.array(z.string()), blockNumber: z.string() }).loose();
const RECORDED = z.object({ arbitrable: z.string(), blockTimestamps: z.record(z.string(), z.string()) }).parse(JSON.parse(readFileSync(FIXTURE_URL, "utf8")) as unknown);
const CORE_DISPUTES = z
  .object({ disputes: z.array(z.object({ disputeId: z.string(), disputeLogs: z.array(LogSchema), metaEvidenceLogs: z.array(LogSchema) }).loose()) })
  .parse(JSON.parse(readFileSync(CORE_FIXTURE_URL, "utf8")) as unknown).disputes;
const DISPUTE_460 = CORE_DISPUTES.find((dispute) => dispute.disputeId === "460");
if (DISPUTE_460 === undefined) throw new Error("The core recording holds no Gnosis dispute 460.");
const ARBITRABLE = RECORDED.arbitrable as Hex;
const LOGS = [...DISPUTE_460.disputeLogs, ...DISPUTE_460.metaEvidenceLogs];

const CASE_PATH = "/100/cases/460";
const EVENT_TITLE = "DAI token compliance Review";
const LOCATOR_TITLE = "¿Debería la empresa pagar la compensación exigida por el usuario?";
const EVENT_PATH = "/ipfs/QmbtSnH8BB3cgDLwtY6aT7fggnzhyEMVHExqsiVPjBxmcz/metaEvidence.json";
const LOCATOR_PATH = "/ipfs/QmPMaPsRbEQ4Z65GqiBnGEqQNnGQBZX2BuMW9AEXqtit9f/metaEvidence.json";
const NOT_CONTENT_ADDRESSED = "/ipns/k51qzi5uqu5dlvj2baxnqndepeb86cbk3ng7n3i46uzyxzyqj2xjonzllnv0v8";
const WARNING_TITLE = /^The meta-evidence API pointed to/;
const BANNER_TITLE = "View mode only for this dispute";
const UNAVAILABLE_SECTIONS = ["Dispute details unavailable", "Timeline unavailable", "Decision unavailable"];

const ERC1497_ABI = parseAbi(["event MetaEvidence(uint256 indexed _metaEvidenceID, string _evidence)"]);
const [META_EVIDENCE_TOPIC] = encodeEventTopics({ abi: ERC1497_ABI, eventName: "MetaEvidence" });

interface LogFilter {
  readonly address?: string;
  readonly topics?: readonly (string | null)[];
  readonly fromBlock?: Hex;
  readonly toBlock?: Hex;
}

function filterOf(call: RpcCall): LogFilter {
  return call.params[0] ?? {};
}

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

const detailsRpc = caseDetailsAnswers(GNOSIS_ARBITRATOR, 460n);

/** The appeal period: in execution the decision also needs the family, which the harness never detects. */
function caseRpc(call: RpcCall): RpcAnswer | undefined {
  if (isDisputesCall(call, GNOSIS_ARBITRATOR, 460n)) return disputeStruct({ arbitrated: ARBITRABLE, period: 3, lastPeriodChange: 1_747_840_645n });
  const details = detailsRpc(call);
  if (details !== undefined) return details;
  if (call.method === "eth_getLogs") return recordedLogs(filterOf(call));
  if (call.method === "eth_getBlockByNumber") {
    const [number] = call.params as [Hex];
    const timestamp = RECORDED.blockTimestamps[number];
    return timestamp === undefined ? undefined : { result: { number, timestamp, hash: `0x${"cd".repeat(32)}`, transactions: [] } };
  }
  return undefined;
}

async function openCase(
  context: BrowserContext,
  page: Page,
  baseURL: string | undefined,
  rpc: (call: RpcCall) => RpcAnswer | undefined,
  http?: (request: HttpRequest) => HttpAnswer | undefined,
): Promise<Traffic> {
  const traffic = await fakeNetwork(context, { appOrigin: appOriginOf(baseURL), recordings: [RECORDING], rpc, http });
  await page.goto(CASE_PATH);
  return traffic;
}

function gatewayPaths(traffic: Traffic): string[] {
  return traffic.http.flatMap((request) => (request.kind === "gateway" ? [request.path] : []));
}

function sourceWarning(page: Page) {
  return page.getByRole("status").filter({ hasText: WARNING_TITLE });
}

async function boxOf(locator: Locator): Promise<{ readonly top: number; readonly bottom: number }> {
  const box = await locator.boundingBox();
  if (box === null) throw new Error("The element has no box.");
  return { top: box.y, bottom: box.y + box.height };
}

test("Gnosis 460 renders the on-chain meta-evidence while the meta-evidence API points elsewhere, with the warning under the record band, above the view-only banner and the decision, and on screen", async ({
  context,
  page,
  baseURL,
}) => {
  const traffic = await openCase(context, page, baseURL, caseRpc);

  await expect(page.getByRole("heading", { name: EVENT_TITLE, exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(LOCATOR_TITLE)).toHaveCount(0);
  const warning = sourceWarning(page);
  await expect(warning).toBeVisible();
  await expect(warning).toContainText("Ongoing Disputes list");
  await expect(warning).not.toContainText("/ipfs/");

  // The harness answers no eth_getCode, so the family is unavailable after one retry and the dispute is view-only. The
  // banner comes in between the warning and the decision about a second later, the last section to settle: measure once
  // it shows.
  const banner = page.getByText(BANNER_TITLE);
  await expect(banner).toBeVisible({ timeout: 30_000 });
  const band = page.getByRole("region", { name: "Dispute #460" });
  await expect(band.locator('[aria-busy="true"]')).toHaveCount(0);
  for (const unavailable of UNAVAILABLE_SECTIONS) await expect(page.getByText(unavailable, { exact: true })).toHaveCount(0);
  const bandBox = await boxOf(band);
  const decision = await boxOf(page.getByRole("heading", { level: 2, name: "Jury decision", exact: true }));
  const bannerBox = await boxOf(banner);
  // The region is `display: contents` and has no box of its own: measure the Notice it holds.
  const warningBox = await boxOf(warning.locator(":scope > *"));
  const title = await boxOf(page.getByRole("heading", { level: 2, name: EVENT_TITLE, exact: true }));
  expect(warningBox.top).toBeGreaterThanOrEqual(bandBox.bottom);
  expect(warningBox.bottom).toBeLessThanOrEqual(bannerBox.top);
  expect(bannerBox.bottom).toBeLessThanOrEqual(decision.top);
  expect(warningBox.bottom).toBeLessThan(title.top);
  expect(warningBox.bottom).toBeLessThanOrEqual(page.viewportSize()?.height ?? 0);

  expect(traffic.http).toContainEqual({ kind: "locator", chainId: "100", disputeId: "460" });
  expect(gatewayPaths(traffic)).toContain(EVENT_PATH);
  expect(gatewayPaths(traffic)).not.toContain(LOCATOR_PATH);
  const metaEvidenceScans = traffic.rpc.filter((call) => call.method === "eth_getLogs" && filterOf(call).topics?.[0] === META_EVIDENCE_TOPIC);
  expect(metaEvidenceScans.map((call) => filterOf(call).address?.toLowerCase())).toEqual([ARBITRABLE]);
});

test("names an API answer that is not content-addressed as unverifiable next to the on-chain meta-evidence", async ({ context, page, baseURL }) => {
  // Pathnames only: frame and RPC URLs carry keys in their parameters. The harness aborts /ipns/ requests uncounted.
  const requested: string[] = [];
  context.on("request", (request) => requested.push(new URL(request.url()).pathname));
  const traffic = await openCase(context, page, baseURL, caseRpc, (request) => (request.kind === "locator" ? { json: { metaEvidenceUri: NOT_CONTENT_ADDRESSED } } : undefined));

  await expect(page.getByRole("heading", { name: EVENT_TITLE, exact: true })).toBeVisible({ timeout: 30_000 });
  const warning = sourceWarning(page);
  await expect(warning).toBeVisible();
  await expect(warning).toContainText("cannot be verified");
  expect(gatewayPaths(traffic)).toContain(EVENT_PATH);
  expect(gatewayPaths(traffic)).not.toContain(LOCATOR_PATH);
  expect(requested.filter((path) => path.startsWith("/ipns/"))).toEqual([]);
});

function ongoingRpc(call: RpcCall): RpcAnswer | undefined {
  if (isDisputesCall(call, GNOSIS_ARBITRATOR, 460n)) return disputeStruct({ arbitrated: ARBITRABLE, period: 0, lastPeriodChange: BigInt(Math.floor(Date.now() / 1000)) });
  if (call.method !== "eth_getLogs") return undefined;
  const filter = logFilterFor(call, DISPUTE_CREATION_TOPIC);
  if (filter?.address !== GNOSIS_ARBITRATOR) return { result: [] };
  const blockNumber = BigInt(RECORDING.readAtBlock) - 10n;
  const creation = creationLog({ arbitrator: GNOSIS_ARBITRATOR, id: 460n, arbitrable: ARBITRABLE, blockNumber, transactionHash: `0x${"46".repeat(32)}` });
  return { result: blockNumber >= filter.fromBlock && blockNumber <= filter.toBlock ? [creation] : [] };
}

test("reads no logs of the arbitrables on the Ongoing page", async ({ context, page, baseURL }) => {
  const traffic = await fakeNetwork(context, { appOrigin: appOriginOf(baseURL), recordings: [RECORDING], rpc: ongoingRpc });
  const card = disputeCard(page, 460n);

  await page.goto("/100/ongoing");

  await expect(card.getByRole("heading", { level: 2 })).toHaveText(LOCATOR_TITLE, { timeout: 30_000 });
  const logAddresses = traffic.rpc.filter((call) => call.method === "eth_getLogs").map((call) => filterOf(call).address?.toLowerCase());
  expect(logAddresses.length).toBeGreaterThan(0);
  expect(logAddresses.filter((address) => address !== GNOSIS_ARBITRATOR)).toEqual([]);
  expect(gatewayPaths(traffic)).toContain(LOCATOR_PATH);
  expect(gatewayPaths(traffic)).not.toContain(EVENT_PATH);
});
