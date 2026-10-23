import { expect, test } from "@playwright/test";
import { GNOSIS_ARBITRATOR, isDisputesCall, MAINNET_ARBITRATOR, NEVER_CREATED_ON_GNOSIS, OUT_OF_RANGE_ON_MAINNET } from "../support/arbitrator";
import { fakeNetwork, loadRecording, type HttpRequest } from "../support/network";

// Mainnet's arbitrator reverts past its last dispute; Gnosis keeps disputes in a mapping, so an ID never created reads
// as a zeroed struct. The build needs the chain-1 and Gnosis read RPCs and the meta-evidence API configured, as a deploy
// has.

const RECORDING = loadRecording(new URL("fixtures/mainnet-1621-appeal.json", import.meta.url));
const CASE_TITLE = "Proof of Humanity Governance Dispute";

function notFound(id: string): string {
  return `Dispute with ID ${id} does not exist on this network.`;
}

function locatorRequests(requests: readonly HttpRequest[], disputeId: string): number {
  return requests.filter((request) => request.kind === "locator" && request.disputeId === disputeId).length;
}

test("clears the shown dispute at once and shows the not-found state when searching a nonexistent ID", async ({ context, page, baseURL }) => {
  const missing = "99999999";
  const traffic = await fakeNetwork(context, {
    appOrigin: new URL(baseURL ?? "http://localhost").origin,
    recordings: [RECORDING],
    rpc: (call) => (isDisputesCall(call, MAINNET_ARBITRATOR, BigInt(missing)) ? OUT_OF_RANGE_ON_MAINNET : undefined),
  });
  await page.goto("/1/cases/1621");
  await expect(page.getByRole("heading", { name: CASE_TITLE, exact: true })).toBeVisible();

  await page.getByRole("searchbox", { name: "Dispute ID" }).fill(missing);

  // The shown dispute goes as soon as the field changes, before the debounced search loads the new ID.
  await expect(page.getByRole("heading", { name: CASE_TITLE, exact: true, includeHidden: true })).toHaveCount(0, { timeout: 500 });
  await expect(page).toHaveURL(`/1/cases/${missing}`);
  await expect
    .poll(() => traffic.rpc.some((call) => isDisputesCall(call, MAINNET_ARBITRATOR, BigInt(missing))), {
      message: "disputes(id) never read (needs the chain-1 read RPC in the build)",
    })
    .toBe(true);
  await expect(page.getByText(notFound(missing))).toBeVisible();
  await expect(page.getByText(CASE_TITLE)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Appeal", exact: true })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Appeal", exact: true, includeHidden: true })).toHaveCount(0);
  expect(locatorRequests(traffic.http, missing)).toBe(0);
});

test("shows the not-found state for an unused Gnosis ID that reads as a zeroed struct", async ({ context, page, baseURL }) => {
  const unused = "5000000";
  const traffic = await fakeNetwork(context, {
    appOrigin: new URL(baseURL ?? "http://localhost").origin,
    rpc: (call) => (isDisputesCall(call, GNOSIS_ARBITRATOR, BigInt(unused)) ? NEVER_CREATED_ON_GNOSIS : undefined),
  });
  await page.goto("/100/cases");

  await page.getByRole("searchbox", { name: "Dispute ID" }).fill(unused);

  await expect(page).toHaveURL(`/100/cases/${unused}`);
  await expect
    .poll(() => traffic.rpc.some((call) => isDisputesCall(call, GNOSIS_ARBITRATOR, BigInt(unused))), {
      message: "disputes(id) never read (needs the Gnosis read RPC in the build)",
    })
    .toBe(true);
  await expect(page.getByText(notFound(unused))).toBeVisible();
  expect(locatorRequests(traffic.http, unused)).toBe(0);
});
