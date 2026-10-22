import { expect, test } from "@playwright/test";
import { encodeEventTopics, hexToBigInt, numberToHex, type Hex } from "viem";
import { ARBITRATOR_ABI, MAINNET_ARBITRATOR, disputeStruct, isDisputesCall } from "../support/arbitrator";
import { fakeNetwork, type HttpRequest, type JsonAnswer, type RpcCall, type RpcResult } from "../support/network";
import { CORS_HEADERS } from "./rpcFixture";

// The chain is synthesized: mainnet's arbitrator lists two open disputes whose meta-evidence names the same allowlisted
// script. The script answers for the first dispute well after the second, so both runs are open at once and settle in
// reverse order. The build needs the chain-1 read RPC and the meta-evidence API configured, as a deploy has.

const HEAD = 24_000_000n;
const DISPUTE_IDS = [901n, 902n] as const;

/** The Dispute Resolver default script (`registry/scripts.ts`), on the chain-1 allowlist; the allowlist compares paths, not bytes. */
const SCRIPT_CID = "QmZZHwVaXWtvChdFPG4UeXStKaC9aHamwQkNTEAfRmT2Fj";
const META_EVIDENCE_CID = "QmQ2XoA25HmnPUEWDduxj6LYwMwp6jtXPFRMHcNF2EvJfU";

const SCRIPT_TEXT = `
var getMetaEvidence = function () {
  var disputeId = scriptParameters.disputeID;
  setTimeout(function () {
    resolveScript({ title: "Title of " + disputeId });
  }, disputeId === "901" ? 3000 : 500);
};`;

function arbitrableOf(id: bigint): Hex {
  return `0x${id.toString(16).padStart(40, "0")}`;
}

function metaEvidencePath(id: bigint): string {
  return `/ipfs/${META_EVIDENCE_CID}/dispute-${id.toString()}.json`;
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

function logsAnswer(call: RpcCall): RpcResult {
  const filter = call.params[0] as { fromBlock?: Hex; toBlock?: Hex; topics?: readonly (Hex | null)[] } | undefined;
  if (filter?.topics?.[0] !== DISPUTE_CREATION || filter.fromBlock === undefined || filter.toBlock === undefined) return { result: [] };
  const from = hexToBigInt(filter.fromBlock);
  const to = hexToBigInt(filter.toBlock);
  return { result: DISPUTE_IDS.map(creationLog).filter((log) => hexToBigInt(log.blockNumber) >= from && hexToBigInt(log.blockNumber) <= to) };
}

/** Everything else, the courts among them, is left unanswered so it fails fast. */
function rpcAnswer(call: RpcCall): RpcResult | undefined {
  if (call.method === "eth_blockNumber") return { result: numberToHex(HEAD) };
  if (call.method === "eth_getLogs") return logsAnswer(call);
  const id = DISPUTE_IDS.find((candidate) => isDisputesCall(call, MAINNET_ARBITRATOR, candidate));
  return id === undefined ? undefined : disputeStruct({ arbitrated: arbitrableOf(id), period: 0, lastPeriodChange: BigInt(Math.floor(Date.now() / 1000)) });
}

function httpAnswer(request: HttpRequest): JsonAnswer | undefined {
  if (request.kind === "locator") {
    const id = DISPUTE_IDS.find((candidate) => candidate.toString() === request.disputeId);
    return id === undefined ? undefined : { json: { metaEvidenceUri: metaEvidencePath(id) } };
  }
  if (!DISPUTE_IDS.some((id) => request.path === metaEvidencePath(id))) return undefined;
  return {
    json: {
      title: "Title before the script",
      description: "Served by the Ongoing scripts test.",
      question: "Which option?",
      rulingOptions: { type: "single-select", titles: ["Yes", "No"] },
      dynamicScriptURI: `/ipfs/${SCRIPT_CID}`,
      arbitrableChainID: 1,
    },
  };
}

test("the Ongoing list shows each scripted dispute's own title", async ({ context, page, baseURL }) => {
  await fakeNetwork(context, { appOrigin: new URL(baseURL ?? "http://localhost").origin, rpc: rpcAnswer, http: httpAnswer });
  let scriptRequests = 0;
  // A page route is asked before the context's: the shared helper answers JSON only, and the script is text.
  await page.route(`**/ipfs/${SCRIPT_CID}`, async (route) => {
    scriptRequests += 1;
    await route.fulfill({ headers: CORS_HEADERS, contentType: "application/javascript; charset=utf-8", body: SCRIPT_TEXT });
  });
  const card = (id: bigint) => page.getByRole("link").filter({ has: page.getByText(`#${id.toString()}`, { exact: true }) });
  const title = (id: bigint) => card(id).getByRole("heading", { level: 2 });

  await page.goto("/1/ongoing");

  for (const id of DISPUTE_IDS) await expect(card(id)).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => scriptRequests, { message: `dynamic script never requested (is ${SCRIPT_CID} still on the chain-1 allowlist?)`, timeout: 15_000 }).toBeGreaterThan(0);
  // Both runs are open at once: the second dispute's title lands while the first is still waiting on its script.
  await expect(title(902n)).toHaveText("Title of 902", { timeout: 20_000 });
  await expect(title(901n)).toHaveAttribute("aria-busy", "true");
  for (const id of DISPUTE_IDS) await expect(title(id)).toHaveText(`Title of ${id.toString()}`, { timeout: 20_000 });
});
