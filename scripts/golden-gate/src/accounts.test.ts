import { describe, expect, it } from "vitest";
import { mergeCases, parseLiveCases } from "./accounts";

const LIVE = {
  generatedAt: "2026-10-14T00:00:00.000Z",
  source: "docs/parity/04-golden-cases.md §3",
  chains: [
    {
      status: "ok",
      chainId: 1,
      blockNumber: 100,
      scanFromBlock: 1,
      openDisputes: 3,
      unreadableDisputes: [],
      periods: { "0": { disputeId: 1690 }, "1": null, "2": { disputeId: 1684 }, "3": { disputeId: 1680 } },
    },
    { status: "failed", chainId: 10200, message: "no RPC" },
  ],
};

describe("account context cases (04 §1)", () => {
  it("04 §1: takes every live-tier pick of the chains that succeeded", () => {
    const { cases } = parseLiveCases(LIVE);
    expect(cases.map((item) => [item.chainId, Number(item.disputeId), item.livePeriod])).toEqual([
      [1, 1690, 0],
      [1, 1684, 2],
      [1, 1680, 3],
    ]);
  });

  it("04 §1: a live pick that is also a stable case keeps its stable tier and records its live period", () => {
    const merged = mergeCases(
      [
        { chainId: 1, disputeId: 1680n, tier: "pending" },
        { chainId: 100, disputeId: 0n, tier: "stable" },
      ],
      parseLiveCases(LIVE).cases,
    );
    expect(merged.map(({ item, livePeriods }) => [item.chainId, Number(item.disputeId), item.tier, livePeriods])).toEqual([
      [1, 1680, "pending", [3]],
      [1, 1684, "live", [2]],
      [1, 1690, "live", [0]],
      [100, 0, "stable", []],
    ]);
  });
});
