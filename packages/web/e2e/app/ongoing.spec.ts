import { expect, test } from "@playwright/test";
import { encodeEventTopics, hexToBigInt, numberToHex, type Hex } from "viem";
import { ARBITRATOR_ABI, MAINNET_ARBITRATOR, disputeStruct, isDisputesCall } from "../support/arbitrator";
import { fakeNetwork, type HttpRequest, type JsonAnswer, type RpcCall, type RpcResult } from "../support/network";

// The chain is synthesized: mainnet's arbitrator lists three open disputes; the meta-evidence API answers two of them at
// once and never answers the third. The build needs the chain-1 read RPC and the meta-evidence API configured, as a
// deploy has.

/** Mirrors `ONGOING_BUDGET_MS` in packages/core/src/metaEvidence/load.ts. */
const ONGOING_BUDGET_MS = 40_000;
const SETTLE_LIMIT_MS = 60_000;

const HEAD = 24_000_000n;
const ANSWERED = [
  { id: 901n, title: "First fixture dispute", cid: "QmTimingFixtureMetaEvidenceAForTestsXXXXXXXXXX" },
  { id: 902n, title: "Second fixture dispute", cid: "QmTimingFixtureMetaEvidenceBForTestsXXXXXXXXXX" },
] as const;
const STALLED = 903n;
const OPEN_IDS = [...ANSWERED.map(({ id }) => id), STALLED];

function arbitrableOf(id: bigint): Hex {
  return `0x${id.toString(16).padStart(40, "0")}`;
}

function creationLog(id: bigint) {
  const blockNumber = HEAD - 100n + (id % 100n);
  return {
    address: MAINNET_ARBITRATOR,
    topics: encodeEventTopics({ abi: ARBITRATOR_ABI, eventName: "DisputeCreation", args: { _disputeID: id, _arbitrable: arbitrableOf(id) } }),
    data: "0x",
    blockNumber: numberToHex(blockNumber),
    blockHash: `0x${blockNumber.toString(16).padStart(64, "0")}`,
    transactionHash: `0x${id.toString(16).padStart(64, "0")}`,
    transactionIndex: "0x0",
    logIndex: "0x0",
    removed: false,
  };
}

const [DISPUTE_CREATION] = encodeEventTopics({ abi: ARBITRATOR_ABI, eventName: "DisputeCreation" });

/** No `NewPeriod` logs: none of the disputes reached execution. */
function logsAnswer(call: RpcCall): RpcResult {
  const filter = call.params[0] as { fromBlock?: Hex; toBlock?: Hex; topics?: readonly (Hex | null)[] } | undefined;
  if (filter?.topics?.[0] !== DISPUTE_CREATION || filter.fromBlock === undefined || filter.toBlock === undefined) return { result: [] };
  const from = hexToBigInt(filter.fromBlock);
  const to = hexToBigInt(filter.toBlock);
  return { result: OPEN_IDS.map(creationLog).filter((log) => hexToBigInt(log.blockNumber) >= from && hexToBigInt(log.blockNumber) <= to) };
}

/** Everything else, the courts among them, is left unanswered so it fails fast. */
function rpcAnswer(call: RpcCall): RpcResult | undefined {
  if (call.method === "eth_blockNumber") return { result: numberToHex(HEAD) };
  if (call.method === "eth_getLogs") return logsAnswer(call);
  const id = OPEN_IDS.find((candidate) => isDisputesCall(call, MAINNET_ARBITRATOR, candidate));
  return id === undefined ? undefined : disputeStruct({ arbitrated: arbitrableOf(id), period: 0, lastPeriodChange: BigInt(Math.floor(Date.now() / 1000)) });
}

function isStalled(request: HttpRequest): boolean {
  return request.kind === "locator" && request.disputeId === STALLED.toString();
}

function httpAnswer(request: HttpRequest): JsonAnswer | undefined {
  if (request.kind === "locator") {
    const answered = ANSWERED.find(({ id }) => id.toString() === request.disputeId);
    return answered === undefined ? undefined : { json: { metaEvidenceUri: `/ipfs/${answered.cid}/metaEvidence.json` } };
  }
  const file = ANSWERED.find(({ cid }) => request.path === `/ipfs/${cid}/metaEvidence.json`);
  return file === undefined ? undefined : { json: { title: file.title, description: "Served by the Ongoing timing test.", question: "Which option?" } };
}

test("renders cards as each dispute resolves and settles a stalled title on 'title unavailable' well under a minute", async ({ context, page, baseURL }) => {
  test.setTimeout(SETTLE_LIMIT_MS + 30_000);
  await fakeNetwork(context, { appOrigin: new URL(baseURL ?? "http://localhost").origin, rpc: rpcAnswer, http: httpAnswer, hold: isStalled });
  const card = (id: bigint) => page.getByRole("link").filter({ has: page.getByText(`#${id.toString()}`, { exact: true }) });
  const title = (id: bigint) => card(id).getByRole("heading", { level: 2 });

  const started = Date.now();
  await page.goto("/1/ongoing");

  for (const id of OPEN_IDS) await expect(card(id)).toBeVisible({ timeout: 15_000 });
  for (const { id, title: text } of ANSWERED) await expect(title(id)).toHaveText(text, { timeout: 15_000 });
  // Nothing waits for the slowest dispute.
  await expect(title(STALLED)).toHaveAttribute("aria-busy", "true");
  expect(Date.now() - started).toBeLessThan(ONGOING_BUDGET_MS);

  await expect(title(STALLED)).toHaveText(`Dispute ${STALLED.toString()}: title unavailable`, { timeout: SETTLE_LIMIT_MS });
  const settledMs = Date.now() - started;
  test.info().annotations.push({ type: "stalled-title-settled-ms", description: String(settledMs) });
  expect(settledMs).toBeLessThan(SETTLE_LIMIT_MS);
  for (const { id, title: text } of ANSWERED) await expect(title(id)).toHaveText(text);
});
