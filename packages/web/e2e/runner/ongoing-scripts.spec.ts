import { expect, test } from "@playwright/test";
import { openDisputesRpc } from "../support/arbitrator";
import { appOriginOf, CORS_HEADERS, fakeNetwork, type HttpRequest, type JsonAnswer } from "../support/network";

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

function metaEvidencePath(id: bigint): string {
  return `/ipfs/${META_EVIDENCE_CID}/dispute-${id.toString()}.json`;
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
  await fakeNetwork(context, { appOrigin: appOriginOf(baseURL), rpc: openDisputesRpc(DISPUTE_IDS, HEAD), http: httpAnswer });
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
