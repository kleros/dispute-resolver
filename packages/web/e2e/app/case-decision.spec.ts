import { expect, test, type Locator, type Page } from "@playwright/test";
import type { Hex } from "viem";
import { MAINNET_ARBITRATOR, RULING_TOPIC, caseDetailsAnswers, disputeStruct, isDisputesCall, logFilterFor, rulingLog } from "../support/arbitrator";
import { appOriginOf, fakeNetwork, type HttpAnswer, type RpcAnswer, type RpcCall } from "../support/network";
import { pageScroll } from "../support/pageScroll";
import { switchScheme, tokenColor } from "../support/theme";

// The arbitrable has no code, so it is view-only and keeps no funding record that proves a ruling; the API knows no file,
// so rulings read by number.

const ARBITRABLE: Hex = "0x00000000000000000000000000000000000c0939";
const HEAD = 20_000_000n;
const REFUSED = "Invalid / Refused to Arbitrate / Tied";

const EMPTY_CHAIN: Readonly<Record<string, RpcAnswer>> = { eth_blockNumber: { result: `0x${HEAD.toString(16)}` }, eth_getLogs: { result: [] }, eth_getCode: { result: "0x" } };
const NO_META_EVIDENCE: HttpAnswer = { json: {} };

interface Scenario {
  readonly disputeId: bigint;
  readonly period: number;
  readonly ruled: boolean;
  readonly ruling: bigint;
  /** The ruling the arbitrable's Ruling event reports; no event without it. */
  readonly executed?: bigint;
}

function scenarioRpc(scenario: Scenario): (call: RpcCall) => RpcAnswer | undefined {
  const details = caseDetailsAnswers(MAINNET_ARBITRATOR, scenario.disputeId, { ruling: scenario.ruling });
  const lastPeriodChange = BigInt(Math.floor(Date.now() / 1_000)) - 3_600n;
  const executedAt = HEAD - 1_000n;
  return (call) => {
    if (isDisputesCall(call, MAINNET_ARBITRATOR, scenario.disputeId)) {
      return disputeStruct({ arbitrated: ARBITRABLE, period: scenario.period, lastPeriodChange, ruled: scenario.ruled });
    }
    const scan = logFilterFor(call, RULING_TOPIC);
    if (scan !== undefined) {
      const inRange = scan.address === ARBITRABLE && scan.fromBlock <= executedAt && executedAt <= scan.toBlock;
      if (scenario.executed === undefined || !inRange) return { result: [] };
      return { result: [rulingLog({ arbitrable: ARBITRABLE, arbitrator: MAINNET_ARBITRATOR, disputeId: scenario.disputeId, ruling: scenario.executed, blockNumber: executedAt })] };
    }
    return details(call) ?? EMPTY_CHAIN[call.method];
  };
}

async function openCase(page: Page, baseURL: string | undefined, scenario: Scenario): Promise<void> {
  await fakeNetwork(page.context(), {
    appOrigin: appOriginOf(baseURL),
    rpc: scenarioRpc(scenario),
    http: (request) => (request.kind === "locator" ? NO_META_EVIDENCE : undefined),
  });
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/1/cases/${scenario.disputeId.toString()}`);
}

async function expectLaidOut(page: Page, panel: Locator): Promise<void> {
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const scheme of ["light", "dark"] as const) {
      await switchScheme(page, scheme);
      const where = `${String(width)} px, ${scheme}`;
      const lines = panel.locator("p.col-start-2");
      const secondary = await tokenColor(page, "--klerosUIComponentsSecondaryText");
      for (const line of await lines.all()) expect.soft(await line.evaluate((element) => getComputedStyle(element).color), `${where}: line colour`).toBe(secondary);
      const border = await panel.evaluate((element) => getComputedStyle(element).borderTopColor);
      expect.soft(border, `${where}: panel border`).toBe(await tokenColor(page, "--klerosUIComponentsPrimaryBlue"));
      const overflow = await panel.evaluate((element) => [...element.querySelectorAll("p")].some((line) => line.scrollWidth > line.clientWidth + 1));
      expect.soft(overflow, `${where}: a line overflows the panel`).toBe(false);
      const { scrollWidth, clientWidth } = await pageScroll(page);
      const documentWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect.soft(Math.max(scrollWidth - clientWidth, documentWidth - width), `${where}: the page scrolls sideways`).toBeLessThanOrEqual(0);
    }
  }
}

test("a view-only dispute whose arbitrable applied another ruling than the court's, with nothing proving why, shows the applied ruling as the winner and both rulings", async ({
  page,
  baseURL,
}) => {
  await openCase(page, baseURL, { disputeId: 9391n, period: 4, ruled: true, ruling: 0n, executed: 2n });
  const panel = page.getByRole("region", { name: "Winner", exact: true });
  await expect(panel, "the decision never rendered (needs the chain-1 read RPC in the build)").toBeVisible({ timeout: 30_000 });
  await expect(panel.getByText("2", { exact: true })).toBeVisible();
  await expect(panel).toContainText(`The court ruled “${REFUSED}”. The arbitrable contract applied “2”.`);
  await expect(panel).not.toContainText("Won by");
  await expect(panel.getByRole("button")).toHaveCount(0);
  await expectLaidOut(page, panel);
});
