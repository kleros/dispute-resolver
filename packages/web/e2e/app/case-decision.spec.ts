import { expect, test, type Locator, type Page } from "@playwright/test";
import type { Hex } from "viem";
import { MAINNET_ARBITRATOR, RULING_TOPIC, caseDetailsAnswers, disputeStruct, isDisputesCall, logFilterFor, rulingLog, type VoteCounter } from "../support/arbitrator";
import { appOriginOf, fakeNetwork, type HttpAnswer, type RpcAnswer, type RpcCall } from "../support/network";
import { pageScroll } from "../support/pageScroll";
import { tokenColor } from "../support/theme";

// The decision panel of a view-only dispute, measured in the browser. The spec builds every chain answer itself: the
// dispute's period and whether the arbitrator executed its ruling, the court's ruling and the last round's vote counter,
// and the Ruling event of the arbitrable, which is the arbitrable's own report of what it executed. The arbitrable has
// no code, so it is view-only, and the meta-evidence API knows no file, so rulings read by number. Everything else is
// empty or aborted. The build needs the chain-1 read RPC configured, as a deploy has; requests are recognized by their
// shape, never by host.

const ARBITRABLE: Hex = "0x00000000000000000000000000000000000c0939";
const HEAD = 20_000_000n;
const REFUSED = "invalid / refused to arbitrate / tied";
const TIED_VOTE: VoteCounter = { winningChoice: 2n, counts: [0n, 3n, 3n], tied: true };

const EMPTY_CHAIN: Readonly<Record<string, RpcAnswer>> = { eth_blockNumber: { result: `0x${HEAD.toString(16)}` }, eth_getLogs: { result: [] }, eth_getCode: { result: "0x" } };
const NO_META_EVIDENCE: HttpAnswer = { json: {} };

interface Scenario {
  readonly disputeId: bigint;
  readonly period: number;
  readonly ruled: boolean;
  readonly ruling: bigint;
  readonly voteCounter?: VoteCounter;
  /** The ruling the arbitrable's Ruling event reports; no event without it. */
  readonly executed?: bigint;
}

function scenarioRpc(scenario: Scenario): (call: RpcCall) => RpcAnswer | undefined {
  const details = caseDetailsAnswers(MAINNET_ARBITRATOR, scenario.disputeId, { ruling: scenario.ruling, voteCounter: scenario.voteCounter });
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

function decision(page: Page, name: "Winner" | "Jury decision"): Locator {
  return page.getByRole("region", { name, exact: true });
}

async function switchScheme(page: Page, colorScheme: "light" | "dark"): Promise<void> {
  await page.emulateMedia({ colorScheme });
  if (colorScheme === "dark") await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  else await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
}

/**
 * At each width and in each theme: the panel's text is in the library's tokens, every line stays inside the panel, and
 * the page does not scroll sideways.
 */
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

test("after a tied vote, a view-only dispute's executed ruling is the winner, reported by the arbitrable, with the jury's ruling and why it was 0", async ({ page, baseURL }) => {
  await openCase(page, baseURL, { disputeId: 9391n, period: 4, ruled: true, ruling: 0n, voteCounter: TIED_VOTE, executed: 2n });
  const panel = decision(page, "Winner");
  await expect(panel, "the decision never rendered (needs the chain-1 read RPC in the build)").toBeVisible({ timeout: 30_000 });
  await expect(panel.getByText("2", { exact: true })).toBeVisible();
  await expect(panel).toContainText(`The arbitrable contract reports that it executed this ruling. The jury ruled “${REFUSED}”.`);
  await expect(panel).toContainText("The jurors' vote was tied, so the court's ruling was Refuse to Arbitrate.");
  await expect(panel).not.toContainText("Won by");
  await expectLaidOut(page, panel);
});

test("in execution before the arbitrator executed the ruling, a view-only dispute shows the jury's ruling and that its own rules decide the outcome", async ({ page, baseURL }) => {
  await openCase(page, baseURL, { disputeId: 9392n, period: 4, ruled: false, ruling: 1n });
  const panel = decision(page, "Jury decision");
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await expect(panel.getByText("1", { exact: true })).toBeVisible();
  await expect(panel).toContainText("The ruling has not been executed yet. When it is, the arbitrable contract's own rules decide the outcome.");
  await expect(page.getByRole("region", { name: "Winner", exact: true })).toHaveCount(0);
  await expectLaidOut(page, panel);
});

test("in the appeal period after a tied vote, the jury decision says the vote was tied and leaves any appeal to the arbitrable", async ({ page, baseURL }) => {
  await openCase(page, baseURL, { disputeId: 9393n, period: 3, ruled: false, ruling: 0n, voteCounter: TIED_VOTE });
  const panel = decision(page, "Jury decision");
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await expect(panel.getByText(REFUSED, { exact: true })).toBeVisible();
  await expect(panel).toContainText("The jurors' vote was tied, so the court's ruling is Refuse to Arbitrate.");
  await expect(panel).toContainText("Whether and how this decision can be appealed depends on the arbitrable contract. If it can, it is done in the arbitrable application.");
  await expectLaidOut(page, panel);
});
