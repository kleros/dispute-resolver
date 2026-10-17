import { expect, test } from "@playwright/test";
import { LIVE_FILE } from "./config";
import { submitControlOf } from "./extract/newCase";
import { checkLivePeriod } from "./liveChecks";
import { loadLiveTier } from "./liveTier";
import { runCase } from "./runCase";
import { caseKey } from "./stableTier";

// The live tier of 04 §3: the picks of `golden/live.json` (`yarn golden-gate live`), one per chain and period 0 to 3,
// each compared with production like a stable case and checked for its period (liveChecks.ts). `GOLDEN_LIVE=0` leaves
// the tier out; `GOLDEN_LIVE=100:1` runs the Gnosis commit-period pick alone.

test.describe.configure({ mode: "parallel" });

const requested = process.env.GOLDEN_LIVE?.trim() ?? "";
const entries = loadLiveTier(LIVE_FILE, requested);

if (entries.length > 0) {
  test("live tier: the picks of golden/live.json", () => {
    const skipped = entries.flatMap((entry) => (entry.kind === "skipped" ? [`${entry.key}: ${entry.reason}`] : []));
    for (const description of skipped) test.info().annotations.push({ type: "live tier, not run", description });
    // A pick named in GOLDEN_LIVE must run; in a full run, a period without an open dispute is only a note.
    expect(requested === "" ? [] : skipped, "picks GOLDEN_LIVE names that cannot run").toEqual([]);
  });
}

for (const entry of entries) {
  if (entry.kind === "skipped") continue;
  const { testCase, period, block } = entry;
  test(`live ${entry.key}: dispute ${testCase.disputeId.toString()}, ${testCase.exercises}`, async ({ browser }) => {
    await runCase(browser, `live ${entry.key} (case ${caseKey(testCase.chainId, testCase.disputeId)})`, testCase, async (page, next) =>
      checkLivePeriod(period, block, next, await submitControlOf(page)),
    );
  });
}
