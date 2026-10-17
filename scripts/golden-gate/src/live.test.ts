import { describe, expect, it } from "vitest";
import type { OngoingDispute } from "../../../packages/core/src/disputes/types";
import type { Address, Family, Period } from "../../../packages/core/src/types";
import { selectGovernorAppeal, selectLiveTier, type LiveReads } from "./live";

const ARBITRABLE: Address = "0xc7add3c961f7935cb4914e37da991d2f1cd7986c";
const GOVERNOR: Address = "0x327a29fce0a6490e4236240be176daa282eccfdf";
/** Kleros Tokens on Curate (Gnosis), a view-only arbitrable. */
const CURATE: Address = "0xee1502e29795ef6c2d60f8d7120596abe3bad990";

function open(id: bigint, period: Period, arbitrated: Address = ARBITRABLE): OngoingDispute {
  return { id, arbitrated, period, subcourtId: 0n, lastPeriodChange: 1_700_000_000, countdownTarget: null };
}

const FAMILIES: ReadonlyMap<Address, Family> = new Map<Address, Family>([
  [ARBITRABLE, "idr-v2"],
  [GOVERNOR, "governor"],
  [CURATE, "view-only"],
]);

function familyOf(dispute: OngoingDispute): Promise<Family> {
  const family = FAMILIES.get(dispute.arbitrated);
  return family === undefined ? Promise.reject(new Error(`no family for ${dispute.arbitrated}`)) : Promise.resolve(family);
}

/** The selection's reads with no contributions anywhere, or the given count per dispute. */
function reads(counts: ReadonlyMap<bigint, number> = new Map()): LiveReads {
  return { countContributions: (dispute) => Promise.resolve(counts.get(dispute.id) ?? 0), familyOf };
}

describe("live tier selection (04 §3)", () => {
  it("04 §3: picks the newest dispute of each period 0 to 2", async () => {
    const selection = await selectLiveTier([open(5n, 0), open(9n, 0), open(7n, 1), open(8n, 2), open(3n, 2)], reads());
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
    const selection = await selectLiveTier([open(10n, 3), open(12n, 3), open(11n, 3)], reads(counts));
    expect(selection["3"]).toMatchObject({ disputeId: 11, contributions: 2, preferredForContributions: true });
  });

  it("04 §3: falls back to the newest appeal-period dispute when none has contributions", async () => {
    const selection = await selectLiveTier([open(10n, 3), open(12n, 3)], reads());
    expect(selection["3"]).toMatchObject({ disputeId: 12, contributions: 0, preferredForContributions: false });
  });

  it("ignores the execution period", async () => {
    const selection = await selectLiveTier([open(20n, 4)], reads());
    expect(Object.values(selection).every((pick) => pick === null)).toBe(true);
  });

  it("a failed contribution read fails the selection instead of changing the pick", async () => {
    await expect(selectLiveTier([open(10n, 3)], { countContributions: () => Promise.reject(new Error("rpc down")), familyOf })).rejects.toThrow("rpc down");
  });

  it("D-47: records the detected family of every pick, so a view-only appeal pick is held to D-47's note", async () => {
    const selection = await selectLiveTier([open(40n, 0, GOVERNOR), open(41n, 1), open(42n, 2, CURATE), open(43n, 3, CURATE)], reads());
    expect([selection["0"]?.family, selection["1"]?.family, selection["2"]?.family, selection["3"]?.family]).toEqual(["governor", "idr-v2", "view-only", "view-only"]);
    expect(selection["3"]).toMatchObject({ disputeId: 43, arbitrable: CURATE, family: "view-only" });
  });

  it("D-47: records the family of the appeal pick preferred for its contributions", async () => {
    const selection = await selectLiveTier([open(44n, 3, CURATE), open(45n, 3)], reads(new Map([[44n, 3]])));
    expect(selection["3"]).toMatchObject({ disputeId: 44, family: "view-only", contributions: 3, preferredForContributions: true });
  });

  it("D-47: a failed family read fails the selection instead of defaulting a family", async () => {
    const familyDown = { countContributions: () => Promise.resolve(0), familyOf: () => Promise.reject(new Error("rpc down")) };
    await expect(selectLiveTier([open(10n, 0)], familyDown)).rejects.toThrow("rpc down");
    await expect(selectLiveTier([open(10n, 3)], familyDown)).rejects.toThrow("rpc down");
  });

  it("P-04, D-47: also picks the newest governor dispute in the appeal period, though newer disputes with contributions are there", async () => {
    const disputes = [open(30n, 3, GOVERNOR), open(31n, 3, GOVERNOR), open(33n, 3), open(34n, 2, GOVERNOR), open(35n, 4, GOVERNOR)];
    const pick = await selectGovernorAppeal(disputes, familyOf);
    expect(pick).toMatchObject({ disputeId: 31, arbitrable: GOVERNOR, family: "governor", period: 3, contributions: null, preferredForContributions: false });
  });

  it("P-04: no governor pick when no governor dispute is in the appeal period", async () => {
    expect(await selectGovernorAppeal([open(33n, 3), open(34n, 2, GOVERNOR)], familyOf)).toBeNull();
  });

  it("P-04: a failed family read fails the governor pick instead of skipping the dispute", async () => {
    await expect(selectGovernorAppeal([open(30n, 3, GOVERNOR)], () => Promise.reject(new Error("rpc down")))).rejects.toThrow("rpc down");
  });
});
