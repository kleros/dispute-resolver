import { test } from "@playwright/test";
import { runCase } from "./runCase";
import { caseKey, selectedCases } from "./stableTier";

// The stable tier of 04 §2, then the executed disputes a ledger Test clause names (stableTier.ts): each case page is
// compared with production through runCase.ts. `GOLDEN_CASES=1:1454,100:0` narrows the run.

test.describe.configure({ mode: "parallel" });

for (const testCase of selectedCases(process.env.GOLDEN_CASES)) {
  const key = caseKey(testCase.chainId, testCase.disputeId);
  test(`case ${key}: ${testCase.exercises}`, async ({ browser }) => {
    await runCase(browser, `case ${key}`, testCase);
  });
}
