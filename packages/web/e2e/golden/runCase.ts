import type { Browser, BrowserContext, Page } from "@playwright/test";
import { injectWallet } from "../support/wallet";
import { accountFor } from "./accounts";
import { checkAccountContext, checkDegradation, checkHighlights, checkSettled, evaluateCase, type CheckResult } from "./compare/engine";
import { NEW_URL, newAppWalletUnavailableReason } from "./config";
import { captureCspViolations } from "./csp";
import { extractNewCase } from "./extract/newCase";
import { extractProductionCase } from "./extract/productionCase";
import { recordOutcome } from "./outcome";
import type { StableCase } from "./stableTier";
import type { CaseSnapshot } from "./types";

// One golden case page: extracted from production and from the new app in the same run, minutes apart, and compared
// field by field under 04 §1 with the ledger applied. The stable tier (case.spec.ts) and the live tier (live.spec.ts)
// both run through it; the live tier adds the period-dependent checks of 04 §3 on the new app's page.

/** Checks a tier adds on the new app's settled page and snapshot. */
export type ExtraChecks = (newPage: Page, next: CaseSnapshot) => Promise<CheckResult[]>;

async function contextFor(browser: Browser, account: string | null, chainId: number): Promise<BrowserContext> {
  const context = await browser.newContext();
  if (account !== null) await injectWallet(context, { account, chainId });
  return context;
}

/** Runs one case and records its outcome as screen `id`. */
export async function runCase(browser: Browser, id: string, testCase: StableCase, extraChecks?: ExtraChecks): Promise<void> {
  const { chainId, disputeId } = testCase;
  const { account, reason } = accountFor(chainId, disputeId);
  const walletUnavailable = account === null ? null : newAppWalletUnavailableReason();

  const productionContext = await contextFor(browser, account, chainId);
  const newContext = await contextFor(browser, walletUnavailable === null ? account : null, chainId);
  try {
    const csp = await captureCspViolations(newContext, new URL(NEW_URL).origin);
    const production = await extractProductionCase(await productionContext.newPage(), chainId, disputeId, account);
    const newPage = await newContext.newPage();
    const next = await extractNewCase(newPage, chainId, disputeId, account, walletUnavailable);
    const tierChecks = extraChecks === undefined ? [] : await extraChecks(newPage, next);
    recordOutcome({
      id,
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
        ...tierChecks,
      ],
      snapshots: { production, next },
      cspViolations: csp.violations(),
    });
  } finally {
    await productionContext.close();
    await newContext.close();
  }
}
