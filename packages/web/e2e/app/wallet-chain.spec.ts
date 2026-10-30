import { expect, test, type Page } from "@playwright/test";
import { pill } from "../support/header";
import { appOriginOf, fakeNetwork, loadRecording } from "../support/network";
import { expectNoSidewaysScroll } from "../support/pageScroll";
import { changeWalletChain, expectWalletConnected, injectWallet, walletRequests } from "../support/wallet";

// playwright.config.ts gives the e2e build a WalletConnect project ID; every wallet service is aborted, so the injected
// wallet is the only one. Dispute 1621 is recorded in the appeal period, so its cards offer Fund.

const RECORDING = loadRecording(new URL("fixtures/mainnet-1621-appeal.json", import.meta.url));
const ACCOUNT = "0x00000000000000000000000000000000000000e2";
const CASE_PATH = "/1/cases/1621";
const CASE_TITLE = "Proof of Humanity Governance Dispute";

function caseTitle(page: Page) {
  return page.getByRole("heading", { name: CASE_TITLE, exact: true, includeHidden: true });
}

function accountButton(page: Page) {
  return page.getByRole("button", { name: /^Account 0x0000…00E2$/i });
}

function countOf(requests: readonly string[], method: string): number {
  return requests.filter((request) => request === method).length;
}

async function switchRequests(page: Page): Promise<number> {
  return countOf(await walletRequests(page), "wallet_switchEthereumChain");
}

function notifications(page: Page) {
  return page.getByRole("region", { name: "Notifications" });
}

function ongoingHeading(page: Page) {
  return page.getByRole("heading", { name: "Ongoing Disputes", level: 1 });
}

test("refuses Fund visibly and sends nothing while the wallet's switch to the page chain waits", async ({ context, page, baseURL }) => {
  await injectWallet(context, { account: ACCOUNT, chainId: 100, heldSwitches: true });
  const traffic = await fakeNetwork(context, { appOrigin: appOriginOf(baseURL), recordings: [RECORDING] });

  await page.goto(CASE_PATH);
  await expectWalletConnected(accountButton(page));
  // The one switch request at load is never answered: the page stays on the URL's chain meanwhile.
  await expect.poll(() => switchRequests(page)).toBe(1);
  await expect(caseTitle(page)).toBeVisible();
  await expect(page).toHaveURL(CASE_PATH);

  await page.getByRole("button", { name: "Appeal", exact: true }).click();
  const panel = page.getByRole("region", { name: "Appeal", exact: true });
  const fund = panel.getByRole("button", { name: /^Fund / }).first();
  await expect(fund).toBeEnabled({ timeout: 30_000 });
  await fund.click();

  await expect(panel.getByText("Wrong network", { exact: true })).toBeVisible();
  await expect(panel.getByText("Your wallet is on Gnosis Network, but this page is on Ethereum Mainnet. Nothing was sent.")).toBeVisible();
  await expect(panel.getByText("A switch to Ethereum Mainnet is waiting in your wallet.")).toBeVisible();
  await expect(panel.getByRole("button", { name: /Switch/ })).toHaveCount(0);
  const requests = await walletRequests(page);
  expect(countOf(requests, "eth_sendTransaction"), "a transaction was requested from the wallet").toBe(0);
  expect(countOf(requests, "wallet_switchEthereumChain"), "the refusal asked for another switch").toBe(1);
  await expect(page).toHaveURL(CASE_PATH);
  expect(traffic.rpcUnanswered, "case page reads missing from the recording").toEqual([]);
  await page.setViewportSize({ width: 375, height: 900 });
  await expectNoSidewaysScroll(page, 375);
});

test("when the wallet changes chain on its own, a case page opens the new chain's Ongoing Disputes without a reload and asks for no switch", async ({ context, page, baseURL }) => {
  await injectWallet(context, { account: ACCOUNT, chainId: 1 });
  await fakeNetwork(context, { appOrigin: appOriginOf(baseURL), recordings: [RECORDING] });

  await page.goto(`${CASE_PATH}?from=e2e`);
  await expectWalletConnected(accountButton(page));
  await expect(caseTitle(page)).toBeVisible();
  // A full page load would drop this marker.
  await page.evaluate(() => {
    Reflect.set(window, "__e2eSameDocument", true);
  });

  await changeWalletChain(page, 100);

  await expect(page).toHaveURL("/100/ongoing");
  await expect(ongoingHeading(page)).toBeVisible();
  await expect(caseTitle(page)).toHaveCount(0);
  expect(await page.evaluate(() => Reflect.get(window, "__e2eSameDocument") === true), "the page was reloaded").toBe(true);
  expect(await switchRequests(page)).toBe(0);
});

test("a pasted case link on the other chain, declined in the wallet, opens the wallet chain's Ongoing Disputes with one toast", async ({ context, page, baseURL }) => {
  await injectWallet(context, { account: ACCOUNT, chainId: 100, declinedSwitches: 1 });
  await fakeNetwork(context, { appOrigin: appOriginOf(baseURL), recordings: [RECORDING] });

  await page.goto(CASE_PATH);
  await expectWalletConnected(accountButton(page));

  await expect(page).toHaveURL("/100/ongoing");
  const toast = notifications(page).getByRole("status");
  await expect(toast).toHaveCount(1);
  await expect(toast).toContainText("Wallet stayed on Gnosis Network");
  await expect(toast).toContainText("Dispute 1621 is on Ethereum Mainnet, so the app is showing Ongoing Disputes on Gnosis Network.");
  await expect(notifications(page).getByRole("alert")).toHaveCount(0);
  await expect(ongoingHeading(page)).toBeVisible();
  await expect(caseTitle(page)).toHaveCount(0);
  expect(await switchRequests(page), "the app asked again after its move to the wallet's chain").toBe(1);
});

for (const [from, to] of [
  ["/1/ongoing?from=e2e#list", "/100/ongoing?from=e2e#list"],
  [CASE_PATH, "/100/ongoing"],
] as const) {
  test(`picking Gnosis Network from the header pill on ${from} asks the wallet once, and the app follows it to ${to} with no toast`, async ({ context, page, baseURL }) => {
    await injectWallet(context, { account: ACCOUNT, chainId: 1 });
    await fakeNetwork(context, { appOrigin: appOriginOf(baseURL), recordings: [RECORDING] });

    await page.goto(from);
    await expectWalletConnected(accountButton(page));
    await pill(page).click();
    await page.getByRole("menuitem", { name: "Gnosis Network" }).click();

    await expect(page).toHaveURL(to);
    await expect(ongoingHeading(page)).toBeVisible();
    await expect(pill(page)).toHaveAccessibleName("Network: Gnosis Network. Change network");
    // The app asking the wallet back to the chain it just left would be a second request.
    expect(await switchRequests(page), "the app asked the wallet again after it followed the pill's switch").toBe(1);
    await expect(page).toHaveURL(to);
    await expect(notifications(page).getByRole("status")).toHaveCount(0);
    await expect(notifications(page).getByRole("alert")).toHaveCount(0);
  });
}
