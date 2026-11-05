import { expect, test } from "@playwright/test";
import { openDisputesRpc } from "../support/arbitrator";
import { disputeCard } from "../support/header";
import { appOriginOf, fakeNetwork, type HttpRequest, type JsonAnswer } from "../support/network";

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
  await fakeNetwork(context, { appOrigin: appOriginOf(baseURL), rpc: openDisputesRpc(OPEN_IDS, HEAD), http: httpAnswer, hold: isStalled });
  const title = (id: bigint) => disputeCard(page, id).getByRole("heading", { level: 2 });

  const started = Date.now();
  await page.goto("/1/ongoing");

  for (const id of OPEN_IDS) await expect(disputeCard(page, id)).toBeVisible({ timeout: 15_000 });
  for (const { id, title: text } of ANSWERED) await expect(title(id)).toHaveText(text, { timeout: 15_000 });
  await expect(title(STALLED)).toHaveAttribute("aria-busy", "true");
  expect(Date.now() - started).toBeLessThan(ONGOING_BUDGET_MS);

  await expect(title(STALLED)).toHaveText(`Dispute ${STALLED.toString()}: title unavailable`, { timeout: SETTLE_LIMIT_MS });
  const settledMs = Date.now() - started;
  test.info().annotations.push({ type: "stalled-title-settled-ms", description: String(settledMs) });
  expect(settledMs).toBeLessThan(SETTLE_LIMIT_MS);
  for (const { id, title: text } of ANSWERED) await expect(title(id)).toHaveText(text);
});
