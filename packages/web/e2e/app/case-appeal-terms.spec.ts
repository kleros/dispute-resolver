import { expect, test, type Locator, type Page } from "@playwright/test";
import { encodeFunctionResult, parseAbi, toFunctionSelector, type Hex } from "viem";
import { MAINNET_ARBITRATOR, caseDetailsAnswers, disputeStruct, isDisputesCall } from "../support/arbitrator";
import { appOriginOf, callData, callTarget, fakeNetwork, type HttpAnswer, type HttpRequest, type RpcAnswer, type RpcCall } from "../support/network";
import { pageScroll } from "../support/pageScroll";
import { expectWalletConnected, injectWallet } from "../support/wallet";

// The appeal section of disputes in the appeal period whose arbitrables no registry entry names, and of a registered
// Reality proxy without an appeal function. The spec builds every chain answer itself: the arbitrable's code
// carries only the selectors that classify it (packages/core/src/abi/selectors.ts), the arbitrator gives the appeal
// period, and the meta-evidence API names a file the gateway serves. Everything else is empty or aborted. The build
// needs the chain-1 read RPC and the meta-evidence API configured, as a deploy has; requests are recognized by their
// shape, never by host.

const HEAD = 20_000_000n;
const DAY = 86_400n;
const ETH = 10n ** 18n;
const ACCOUNT = "0x00000000000000000000000000000000000000e2";

/** `getTotalWithdrawableAmount(uint256,address,uint256)` behind a PUSH4: an IDisputeResolver v2 contract no entry names. */
const IDR_V2_CODE = "0x63ec85635b00";
/** `disputeIDtoTransactionID(uint256)` behind a PUSH4: an Escrow V1 contract no entry names. */
const ESCROW_CODE = "0x632fbe3b0300";
/** One of the six 0.4.24 Reality proxies, registered with no appeal function. */
const OLD_REALITY_PROXY: Hex = "0x594ec762b59978c97c82bc36ab493ed8b1f1f368";

const ARBITRABLE_ABI = parseAbi([
  "function externalIDtoLocalID(uint256) view returns (uint256)",
  "function disputeIDtoTransactionID(uint256) view returns (uint256)",
  "function getMultipliers() view returns (uint256 winnerStakeMultiplier, uint256 loserStakeMultiplier, uint256 loserAppealPeriodMultiplier, uint256 denominator)",
]);
const LOCAL_ID = toFunctionSelector(ARBITRABLE_ABI[0]);
const TRANSACTION_ID = toFunctionSelector(ARBITRABLE_ABI[1]);
const MULTIPLIERS = toFunctionSelector(ARBITRABLE_ABI[2]);

const META_EVIDENCE_PATH = "/ipfs/QmZ3Cmnip8bmFNruuTuCdxPymEjyK9VcQEyf2beDYcaHaK/metaEvidence.json";
const META_EVIDENCE = {
  title: "Synthetic appeal terms dispute",
  description: "Served by the appeal terms spec.",
  question: "Yes or no?",
  rulingOptions: { type: "single-select", titles: ["Yes", "No"] },
};

interface Scenario {
  readonly disputeId: bigint;
  readonly arbitrable: Hex;
  readonly code: Hex;
  /** Seconds from now to the appeal period's start and end. */
  readonly start: bigint;
  readonly end: bigint;
  readonly metaEvidence: boolean;
}

function utc(seconds: bigint): string {
  return new Date(Number(seconds) * 1000).toUTCString();
}

function scenarioRpc(scenario: Scenario, now: bigint): (call: RpcCall) => RpcAnswer | undefined {
  const appeal = { start: now + scenario.start, end: now + scenario.end, cost: ETH / 10n };
  const details = caseDetailsAnswers(MAINNET_ARBITRATOR, scenario.disputeId, { appeal });
  return (call) => {
    if (isDisputesCall(call, MAINNET_ARBITRATOR, scenario.disputeId)) return disputeStruct({ arbitrated: scenario.arbitrable, period: 3, lastPeriodChange: appeal.start });
    const target = callTarget(call);
    const data = callData(call);
    if (target === scenario.arbitrable && data !== undefined) {
      if (data.startsWith(LOCAL_ID)) return { result: encodeFunctionResult({ abi: ARBITRABLE_ABI, functionName: "externalIDtoLocalID", result: 7n }) };
      if (data.startsWith(TRANSACTION_ID)) return { result: encodeFunctionResult({ abi: ARBITRABLE_ABI, functionName: "disputeIDtoTransactionID", result: 9n }) };
      if (data.startsWith(MULTIPLIERS))
        return { result: encodeFunctionResult({ abi: ARBITRABLE_ABI, functionName: "getMultipliers", result: [10_000n, 20_000n, 5_000n, 10_000n] }) };
    }
    switch (call.method) {
      case "eth_blockNumber":
        return { result: `0x${HEAD.toString(16)}` };
      case "eth_getLogs":
        return { result: [] };
      case "eth_getCode":
        return { result: call.params[0] === scenario.arbitrable ? scenario.code : "0x" };
      case "eth_getStorageAt":
        return { result: `0x${"0".repeat(64)}` };
      default:
        return details(call);
    }
  };
}

function scenarioHttp(scenario: Scenario): (request: HttpRequest) => HttpAnswer | undefined {
  return (request) => {
    if (request.kind === "locator") return { json: scenario.metaEvidence ? { metaEvidenceUri: META_EVIDENCE_PATH } : {} };
    return request.path === META_EVIDENCE_PATH && scenario.metaEvidence ? { json: META_EVIDENCE } : { status: 404 };
  };
}

async function openAppeal(page: Page, baseURL: string | undefined, scenario: Scenario, now: bigint): Promise<Locator> {
  await fakeNetwork(page.context(), { appOrigin: appOriginOf(baseURL), rpc: scenarioRpc(scenario, now), http: scenarioHttp(scenario) });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/1/cases/${scenario.disputeId.toString()}`);
  const header = page.getByRole("button", { name: "Appeal", exact: true });
  await expect(header, "the appeal item never rendered (needs the chain-1 read RPC in the build)").toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("main").getByRole("status"), "case sections still loading").toHaveCount(0, { timeout: 30_000 });
  await header.click();
  await expect(header).toHaveAttribute("aria-expanded", "true");
  return page.getByRole("region", { name: "Appeal", exact: true });
}

function nowSeconds(): bigint {
  return BigInt(Math.floor(Date.now() / 1000));
}

async function expectNoSidewaysScroll(page: Page, width: number): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
  const { scrollWidth, clientWidth } = await pageScroll(page);
  const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(Math.max(scrollWidth - clientWidth, documentWidth - width), `the page scrolls sideways at ${String(width)} px`).toBeLessThanOrEqual(0);
}

test("an IDisputeResolver contract's appeal says once when funding closes for the current ruling and for every other option, and stops funding a card past its deadline", async ({
  context,
  page,
  baseURL,
}) => {
  await injectWallet(context, { account: ACCOUNT, chainId: 1 });
  const now = nowSeconds();
  // Three days of appeal period, a day and a half of it gone: the losing side's half has closed, the winner's has not.
  const scenario: Scenario = { disputeId: 9401n, arbitrable: "0x00000000000000000000000000000000000a9401", code: IDR_V2_CODE, start: -2n * DAY, end: DAY, metaEvidence: true };
  const panel = await openAppeal(page, baseURL, scenario, now);
  await expectWalletConnected(page.getByRole("button", { name: /^Account 0x0000…00E2$/i }));

  const loserDeadline = now - 2n * DAY + (3n * DAY) / 2n;
  await expect(panel).toContainText(`Funding for the current ruling (“Yes”) closes ${utc(now + DAY)}. Funding for every other option closed ${utc(loserDeadline)}.`);
  await expect(panel).toContainText("Rewards only apply if both sides are funded and the option you fund wins.");

  const yes = panel.getByRole("listitem", { name: "Yes" });
  await expect(yes).toContainText("Latest jury decision");
  await expect(yes).toContainText(`Funding closes ${utc(now + DAY)}`);
  await expect(yes.getByRole("button", { name: "Fund Yes" })).toBeEnabled();

  const no = panel.getByRole("listitem", { name: "No" });
  await expect(no.getByText("Closed", { exact: true })).toBeVisible();
  await expect(no).toContainText(`Closed at ${utc(loserDeadline)}`);
  await expect(no).not.toContainText("Time left to fund");
  await expect(no.getByRole("button", { name: "Fund No" })).toBeDisabled();
  await expect(no.getByRole("button", { name: "Fund No" })).toHaveAccessibleDescription(`Closed at ${utc(loserDeadline)}`);
  await expect(no.getByRole("spinbutton", { name: /Contribution/ })).toBeDisabled();

  await expect(page.getByRole("region", { name: "Jury decision", exact: true })).toContainText("This decision can be appealed within the appeal period.");
  await expectNoSidewaysScroll(page, 375);
});

test("an Escrow V1 appeal says when the appeal period ends", async ({ page, baseURL }) => {
  const now = nowSeconds();
  const scenario: Scenario = { disputeId: 9402n, arbitrable: "0x00000000000000000000000000000000000a9402", code: ESCROW_CODE, start: -3_600n, end: 2n * DAY, metaEvidence: false };
  const panel = await openAppeal(page, baseURL, scenario, now);
  await expect(panel).toContainText(`The appeal period ends ${utc(now + 2n * DAY)}.`);
  await expect(panel.getByRole("button", { name: "Appeal - 0.1 ETH" })).toBeVisible();
  await expect(panel).not.toContainText("Time left");
  await expectNoSidewaysScroll(page, 375);
});

test("a registered Reality proxy without an appeal function says the dispute cannot be appealed, in the appeal section and the decision", async ({ page, baseURL }) => {
  const now = nowSeconds();
  const scenario: Scenario = { disputeId: 9403n, arbitrable: OLD_REALITY_PROXY, code: "0x", start: -3_600n, end: DAY, metaEvidence: false };
  const panel = await openAppeal(page, baseURL, scenario, now);
  await expect(panel.getByText("This dispute cannot be appealed", { exact: true })).toBeVisible();
  await expect(panel).toContainText("This arbitrable contract has no way to appeal, so the jury's ruling becomes final when the appeal period ends.");
  await expect(panel).not.toContainText("Appeals happen in the arbitrable application");
  await expect(panel.getByRole("button")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Jury decision", exact: true })).toContainText("This dispute cannot be appealed.");
});
