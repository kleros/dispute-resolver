import { describe, expect, it } from "vitest";
import type { OngoingDispute } from "../../../packages/core/src/disputes/types";
import type { Address, Period } from "../../../packages/core/src/types";
import { selectLiveTier } from "./live";

const ARBITRABLE: Address = "0xc7add3c961f7935cb4914e37da991d2f1cd7986c";

function open(id: bigint, period: Period): OngoingDispute {
  return { id, arbitrated: ARBITRABLE, period, subcourtId: 0n, lastPeriodChange: 1_700_000_000, countdownTarget: null };
}

describe("live tier selection (04 §3)", () => {
  it("04 §3: picks the newest dispute of each period 0 to 2", async () => {
    const selection = await selectLiveTier([open(5n, 0), open(9n, 0), open(7n, 1), open(8n, 2), open(3n, 2)], () => Promise.resolve(0));
    expect(selection["0"]?.disputeId).toBe(9);
    expect(selection["1"]?.disputeId).toBe(7);
    expect(selection["2"]?.disputeId).toBe(8);
    expect(selection["3"]).toBeNull();
  });

  it("04 §3: prefers an appeal-period dispute with a Contribution event over a newer one without", async () => {
    const counts = new Map([
      [12n, 0],
      [11n, 2],
      [10n, 5],
    ]);
    const selection = await selectLiveTier([open(10n, 3), open(12n, 3), open(11n, 3)], (dispute) => Promise.resolve(counts.get(dispute.id) ?? 0));
    expect(selection["3"]).toMatchObject({ disputeId: 11, contributions: 2, preferredForContributions: true });
  });

  it("04 §3: falls back to the newest appeal-period dispute when none has contributions", async () => {
    const selection = await selectLiveTier([open(10n, 3), open(12n, 3)], () => Promise.resolve(0));
    expect(selection["3"]).toMatchObject({ disputeId: 12, contributions: 0, preferredForContributions: false });
  });

  it("ignores the execution period", async () => {
    const selection = await selectLiveTier([open(20n, 4)], () => Promise.resolve(0));
    expect(Object.values(selection).every((pick) => pick === null)).toBe(true);
  });

  it("a failed contribution read fails the selection instead of changing the pick", async () => {
    await expect(selectLiveTier([open(10n, 3)], () => Promise.reject(new Error("rpc down")))).rejects.toThrow("rpc down");
  });
});
