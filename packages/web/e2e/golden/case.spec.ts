import { test, type Browser, type BrowserContext } from "@playwright/test";
import { accountFor } from "./accounts";
import { checkAccountContext, checkDegradation, checkHighlights, checkSettled, evaluateCase } from "./compare/engine";
import { NEW_URL, newAppWalletUnavailableReason } from "./config";
import { extractNewCase } from "./extract/newCase";
import { extractProductionCase } from "./extract/productionCase";
import { injectHarnessAccount } from "./provider";
import { recordOutcome } from "./outcome";
import { caseKey, selectedCases, type StableCase } from "./stableTier";

// The stable tier of 04 §2: each case page is extracted from production and from the new app in the same run, minutes
// apart, and compared field by field under 04 §1 with the ledger applied. `GOLDEN_CASES=1:1454,100:0` narrows the run.

test.describe.configure({ mode: "parallel" });

async function contextFor(browser: Browser, account: string | null, chainId: number): Promise<BrowserContext> {
  const context = await browser.newContext();
  if (account !== null) await injectHarnessAccount(context, { account, chainId });
  return context;
}

async function runCase(browser: Browser, testCase: StableCase): Promise<void> {
  const { chainId, disputeId } = testCase;
  const { account, reason } = accountFor(chainId, disputeId);
  const walletUnavailable = account === null ? null : newAppWalletUnavailableReason();

  const productionContext = await contextFor(browser, account, chainId);
  const newContext = await contextFor(browser, walletUnavailable === null ? account : null, chainId);
  try {
    const production = await extractProductionCase(await productionContext.newPage(), chainId, disputeId, account);
    const next = await extractNewCase(await newContext.newPage(), chainId, disputeId, account, walletUnavailable);
    recordOutcome({
      id: `case ${caseKey(chainId, disputeId)}`,
      screen: "case",
      chainId,
      disputeId,
      description: testCase.exercises,
      account,
      accountNote: account === null ? reason : (production.unobservable["appealPanel.withdrawableWei"] ?? next.unobservable["appealPanel.withdrawableWei"] ?? null),
      fields: evaluateCase({ production, next, testCase, newOrigin: new URL(NEW_URL).origin }, reason),
      checks: [
        ...checkSettled(production, next, testCase),
        ...checkHighlights(testCase, next),
        ...checkDegradation(testCase, production, next),
        ...checkAccountContext(testCase, production, next, account),
      ],
      snapshots: { production, next },
    });
  } finally {
    await productionContext.close();
    await newContext.close();
  }
}

for (const testCase of selectedCases(process.env.GOLDEN_CASES)) {
  test(`case ${caseKey(testCase.chainId, testCase.disputeId)}: ${testCase.exercises}`, async ({ browser }) => {
    await runCase(browser, testCase);
  });
}
