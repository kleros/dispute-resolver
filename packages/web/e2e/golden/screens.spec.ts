import { test, type Browser, type Page } from "@playwright/test";
import { checkSettled, evaluateCreate, evaluateOngoing } from "./compare/engine";
import { NEW_URL } from "./config";
import { captureCspViolations, type CspViolation } from "./csp";
import { extractNewCreate, extractNewOngoing, extractProductionCreate, extractProductionOngoing } from "./extract/screens";
import { recordOutcome } from "./outcome";
import { SCREEN_CHAINS } from "./stableTier";

// The Ongoing and Create snapshots of 04 §1 on mainnet and Gnosis. Both run without an account: neither screen has an
// account-dependent field. `GOLDEN_SCREENS=0` leaves them out (a case-only run).

test.describe.configure({ mode: "parallel" });

const SCREEN_CHAINS_TO_RUN = process.env.GOLDEN_SCREENS === "0" ? [] : SCREEN_CHAINS;
const NO_ACCOUNT = { account: null, accountNote: "no account-dependent field", disputeId: null } as const;

async function withPage<T>(browser: Browser, extract: (page: Page) => Promise<T>): Promise<T> {
  const context = await browser.newContext();
  try {
    return await extract(await context.newPage());
  } finally {
    await context.close();
  }
}

/** A new-app page, with the report-only CSP violations it hit (C2). */
async function withNewAppPage<T>(browser: Browser, extract: (page: Page) => Promise<T>): Promise<{ readonly next: T; readonly cspViolations: CspViolation[] }> {
  const context = await browser.newContext();
  try {
    const csp = await captureCspViolations(context, new URL(NEW_URL).origin);
    const next = await extract(await context.newPage());
    return { next, cspViolations: csp.violations() };
  } finally {
    await context.close();
  }
}

for (const chainId of SCREEN_CHAINS_TO_RUN) {
  test(`ongoing ${chainId.toString()}: the open disputes, compared as a set keyed by id`, async ({ browser }) => {
    const production = await withPage(browser, (page) => extractProductionOngoing(page, chainId));
    const { next, cspViolations } = await withNewAppPage(browser, (page) => extractNewOngoing(page, chainId));
    recordOutcome({
      ...NO_ACCOUNT,
      id: `ongoing ${chainId.toString()}`,
      screen: "ongoing",
      chainId,
      description: "Ongoing page: state and the open disputes (period, court, countdown presence)",
      fields: evaluateOngoing({ production, next }),
      checks: checkSettled(production, next),
      snapshots: { production, next },
      cspViolations,
    });
  });

  test(`create ${chainId.toString()}: courts, default cost, question types, option range and required fields`, async ({ browser }) => {
    const production = await withPage(browser, (page) => extractProductionCreate(page, chainId));
    const { next, cspViolations } = await withNewAppPage(browser, (page) => extractNewCreate(page, chainId));
    recordOutcome({
      ...NO_ACCOUNT,
      id: `create ${chainId.toString()}`,
      screen: "create",
      chainId,
      description: "Create page: availability, courts, default cost (court 0, three votes), question types, option range, required fields",
      fields: evaluateCreate({ production, next }),
      checks: checkSettled(production, next),
      snapshots: { production, next },
      cspViolations,
    });
  });
}
