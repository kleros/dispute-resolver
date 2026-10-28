import { expect, test } from "@playwright/test";
import { appOriginOf, callData, callTarget, fakeNetwork, loadRecording, type RpcAnswer, type RpcCall } from "../support/network";
import { expectWalletConnected, injectUnresponsiveWallet, injectWallet, unresponsiveWalletRequests, walletRequests } from "../support/wallet";

// A returning visitor reloads with two wallets installed: the one connected before, and another that never answers, as
// a browser wallet can take many seconds to. Wagmi's reconnect restores the first, then waits on the second before it
// reports the connection settled. Mainnet dispute 1621 is recorded in the appeal period, so its crowdfunding cards offer
// Fund. Before the wallet opens, the contribution is checked through the read RPC: the spec answers the account's
// balance and a governor that accepts the funding. The build needs the chain-1 read RPC and the meta-evidence API
// configured, as a deploy has.

const RECORDING = loadRecording(new URL("fixtures/mainnet-1621-appeal.json", import.meta.url));
const ACCOUNT = "0x00000000000000000000000000000000000000e2";
const CASE_PATH = "/1/cases/1621";
/** poh.eth's KlerosGovernor, the arbitrable of dispute 1621. */
const GOVERNOR = "0x327a29fce0a6490e4236240be176daa282eccfdf";
/** `fundAppeal(uint256)`. */
const FUND_APPEAL_SELECTOR = "0xa446ff57";

/** The pre-flight check's reads: the account holds 100 ETH, and the governor accepts the funding and returns nothing. */
function acceptingCheck(call: RpcCall): RpcAnswer | undefined {
  if (call.method === "eth_getBalance") return { result: `0x${(100n * 10n ** 18n).toString(16)}` };
  if (callTarget(call) === GOVERNOR && callData(call)?.startsWith(FUND_APPEAL_SELECTOR) === true) return { result: "0x" };
  return undefined;
}

test("a returning wallet shows its account and receives the write request while wagmi still waits on another installed wallet", async ({ context, page, baseURL }) => {
  await injectWallet(context, { account: ACCOUNT, chainId: 1, stored: true });
  await injectUnresponsiveWallet(context);
  const traffic = await fakeNetwork(context, { appOrigin: appOriginOf(baseURL), recordings: [RECORDING], rpc: acceptingCheck });

  await page.goto(CASE_PATH);
  await expectWalletConnected(page.getByRole("button", { name: /^Account 0x0000…00E2$/i }));
  // The unresponsive wallet has been asked for its accounts and never answered: wagmi's reconnect is still waiting on it.
  await expect.poll(() => unresponsiveWalletRequests(page)).toContain("eth_accounts");
  await expect(page).toHaveURL(CASE_PATH);

  await page.getByRole("button", { name: "Appeal", exact: true }).click();
  const panel = page.getByRole("region", { name: "Appeal", exact: true });
  const fund = panel.getByRole("button", { name: /^Fund / }).first();
  await expect(fund).toBeEnabled({ timeout: 30_000 });
  await fund.click();

  // The e2e wallet refuses to send, so the write fails, but only after it reached the wallet.
  await expect.poll(async () => (await walletRequests(page)).filter((method) => method === "eth_sendTransaction")).toHaveLength(1);
  expect(await unresponsiveWalletRequests(page)).not.toContain("eth_sendTransaction");
  const checks = traffic.rpc.filter((call) => callTarget(call) === GOVERNOR && callData(call)?.startsWith(FUND_APPEAL_SELECTOR) === true);
  expect(checks, "the contribution was not checked against the governor before the wallet opened").toHaveLength(1);
  expect((checks[0]?.params[0] as { from?: string } | undefined)?.from?.toLowerCase()).toBe(ACCOUNT);
});
