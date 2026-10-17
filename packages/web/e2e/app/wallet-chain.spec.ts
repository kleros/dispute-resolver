import { expect, test, type Page } from "@playwright/test";
import { GNOSIS_ARBITRATOR, isDisputesCall, NEVER_CREATED_ON_GNOSIS } from "../support/arbitrator";
import { fakeNetwork, loadRecording } from "../support/network";
import { changeWalletChain, injectWallet, walletRequests } from "../support/wallet";

// The write guard and chain following with a real browser wallet (checklist B3, ledger D-48 and D-55), on the built app
// with a wallet configured (playwright.config.ts gives the e2e build a WalletConnect project ID; every wallet service is
// aborted, so the injected wallet is the only one). The case page is mainnet dispute 1621 from its recording, where the
// arbitrator reports the appeal period, so its crowdfunding cards offer Fund. The build needs the chain-1 and Gnosis read
// RPCs and the meta-evidence API configured, as a deploy has.

const RECORDING = loadRecording(new URL("fixtures/mainnet-1621-appeal.json", import.meta.url));
const ACCOUNT = "0x00000000000000000000000000000000000000e2";
const CASE_PATH = "/1/cases/1621";
const CASE_TITLE = "Proof of Humanity Governance Dispute";

/** Fails early, and says why, when the build connects no wallet (K-02: no WalletConnect project ID). */
async function expectWalletConnected(page: Page): Promise<void> {
  await expect(
    page.getByRole("button", { name: /^Account 0x0000…00E2$/i }),
    "the injected wallet never connected (the build needs REACT_APP_WALLETCONNECT_PROJECT_ID)",
  ).toBeVisible({
    timeout: 30_000,
  });
}

function countOf(requests: readonly string[], method: string): number {
  return requests.filter((request) => request === method).length;
}

test("B3, D-48: with the wallet on Gnosis and the page on mainnet, Fund refuses visibly, sends nothing and offers the switch", async ({ context, page, baseURL }) => {
  await injectWallet(context, { account: ACCOUNT, chainId: 100, declinedSwitches: 1 });
  const traffic = await fakeNetwork(context, { appOrigin: new URL(baseURL ?? "http://localhost").origin, recordings: [RECORDING] });

  await page.goto(CASE_PATH);
  await expectWalletConnected(page);
  // D-55's one request at load is declined: the page stays on the URL's chain and is not asked again (D-48).
  await expect.poll(async () => countOf(await walletRequests(page), "wallet_switchEthereumChain")).toBe(1);
  await expect(page.getByTestId("case-title")).toHaveText(CASE_TITLE);
  await expect(page).toHaveURL(CASE_PATH);

  await page.getByRole("button", { name: "Appeal", exact: true }).click();
  const panel = page.getByTestId("appeal-panel");
  const fund = panel.getByRole("button", { name: /^Fund / }).first();
  await expect(fund).toBeEnabled({ timeout: 30_000 });
  await fund.click();

  await expect(panel.getByText("Wrong network", { exact: true })).toBeVisible();
  await expect(
    panel.getByText("Your wallet is on Gnosis Network, but this page is on Ethereum Mainnet. Switch your wallet to Ethereum Mainnet to continue. Nothing was sent."),
  ).toBeVisible();
  const requests = await walletRequests(page);
  expect(countOf(requests, "eth_sendTransaction"), "a transaction was requested from the wallet").toBe(0);
  expect(countOf(requests, "wallet_switchEthereumChain"), "the refusal asked for a switch on its own").toBe(1);

  // The refusal offers the switch again; this time the user accepts, and the refusal says the wallet is now on the page's chain.
  await panel.getByRole("button", { name: "Switch to Ethereum Mainnet" }).click();
  await expect(panel.getByText("Your wallet is now on Ethereum Mainnet. Try again.")).toBeVisible();
  expect(countOf(await walletRequests(page), "eth_sendTransaction")).toBe(0);
  await expect(page).toHaveURL(CASE_PATH);
  expect(traffic.rpcUnanswered, "case page reads missing from the recording").toEqual([]);
});

test("D-55: a wallet chain change on a case page moves it to the same ID on the new chain, without a reload", async ({ context, page, baseURL }) => {
  await injectWallet(context, { account: ACCOUNT, chainId: 1 });
  await fakeNetwork(context, {
    appOrigin: new URL(baseURL ?? "http://localhost").origin,
    recordings: [RECORDING],
    rpc: (call) => (isDisputesCall(call, GNOSIS_ARBITRATOR, 1621n) ? NEVER_CREATED_ON_GNOSIS : undefined),
  });

  await page.goto(`${CASE_PATH}?from=e2e`);
  await expectWalletConnected(page);
  await expect(page.getByTestId("case-title")).toHaveText(CASE_TITLE);
  // A full page load would drop this marker.
  await page.evaluate(() => {
    Reflect.set(window, "__e2eSameDocument", true);
  });

  await changeWalletChain(page, 100);

  await expect(page).toHaveURL("/100/cases/1621?from=e2e");
  await expect(page.getByText("Dispute with ID 1621 does not exist on this network.")).toBeVisible();
  await expect(page.getByTestId("case-title")).toHaveCount(0);
  expect(await page.evaluate(() => Reflect.get(window, "__e2eSameDocument") === true), "the page was reloaded").toBe(true);
  // The wallet moved on its own: the app follows it and asks for no switch back.
  expect(countOf(await walletRequests(page), "wallet_switchEthereumChain")).toBe(0);
});
