import { describe, expect, it } from "vitest";
import { caseKey, loadStableTier, parseStableTier } from "./cases";

describe("stable-tier transcription of 04 §2", () => {
  it("04 §2: lists the mainnet and Gnosis stable cases and the two pending-execution disputes", () => {
    const cases = loadStableTier();
    const keys = new Set(cases.map((item) => caseKey(item.chainId, item.disputeId)));
    for (const key of ["1:1454", "1:1650", "1:1621", "1:1678", "1:150", "1:560", "100:0", "100:431", "100:132", "100:863", "100:140"]) expect(keys).toContain(key);
    expect(cases.filter((item) => item.tier === "pending").map((item) => caseKey(item.chainId, item.disputeId))).toEqual(["1:1680", "1:1684"]);
    expect(cases.filter((item) => item.chainId === 1 && item.tier === "stable")).toHaveLength(33);
    expect(cases.filter((item) => item.chainId === 100)).toHaveLength(19);
  });

  it("rejects a case listed twice", () => {
    const duplicated = {
      source: "test",
      cases: [
        { chainId: 1, disputeId: 1, tier: "stable" },
        { chainId: 1, disputeId: 1, tier: "pending" },
      ],
    };
    expect(() => parseStableTier(duplicated)).toThrow("1:1 twice");
  });
});
