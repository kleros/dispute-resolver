import { hashKey } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { testBinding } from "../test/data";
import { IDLE_KEY, disputeKeyPrefix, queryKeys } from "./queryKeys";

const ARBITRABLE = testBinding().arbitrated;

const everyKey = [
  queryKeys.courts(1),
  queryKeys.ongoing(1, "ok"),
  queryKeys.lookup(1, 2n ** 255n),
  queryKeys.family(1, ARBITRABLE),
  queryKeys.metaEvidence(1, 5n, ARBITRABLE),
  queryKeys.disputeEvent(1, 5n, ARBITRABLE),
  queryKeys.evidence(1, 5n, ARBITRABLE, 9n),
  queryKeys.details(100, 5n, "idr-v2", 123n),
  queryKeys.details(100, 5n, "unknown", null),
  queryKeys.multipliers(1, ARBITRABLE),
  queryKeys.funding(1, 5n, 2n, 1_000n, 3n),
  queryKeys.funding(1, 5n, 2n, 1_000n, undefined),
  queryKeys.withdrawable(1, 5n, ARBITRABLE, [0n, 1n], 3n),
  queryKeys.withdrawable(1, 5n, undefined, [], undefined),
  queryKeys.cost(1, "0x00"),
  queryKeys.accountCode(1, ARBITRABLE),
  IDLE_KEY,
];

describe("query keys (ARCHITECTURE.md §5.2)", () => {
  it("§5.2: every key holds strings and numbers only, starts with dr, and hashes", () => {
    for (const key of everyKey) {
      expect(key[0]).toBe("dr");
      for (const part of key) expect(["string", "number"]).toContain(typeof part);
      expect(() => hashKey(key)).not.toThrow();
    }
  });

  it("§5.2: dispute IDs, rounds and blocks are decimal strings", () => {
    expect(queryKeys.lookup(1, 2n ** 255n)).toEqual(["dr", "lookup", 1, (2n ** 255n).toString()]);
    expect(queryKeys.funding(1, 5n, 2n, 1_000n, undefined)).toEqual(["dr", "funding", 1, "5", "2", "1000", "none"]);
    expect(queryKeys.withdrawable(1, 5n, ARBITRABLE, [0n, 1n], undefined)).toEqual(["dr", "withdrawable", 1, "5", ARBITRABLE, "0,1", "none"]);
  });

  it("R4 / D-47: funding and withdraw keys differ by the governor session, so a recovered session is read again", () => {
    expect(queryKeys.funding(1, 5n, 2n, 1_000n, 3n)).toEqual(["dr", "funding", 1, "5", "2", "1000", "3"]);
    expect(queryKeys.withdrawable(1, 5n, ARBITRABLE, [0n, 1n], 3n)).toEqual(["dr", "withdrawable", 1, "5", ARBITRABLE, "0,1", "3"]);
  });

  it("§5.6: a dispute prefix matches every key of that dispute and kind", () => {
    expect(queryKeys.funding(1, 5n, 2n, 1_000n, 3n).slice(0, 4)).toEqual([...disputeKeyPrefix("funding", 1, 5n)]);
    expect(queryKeys.evidence(1, 5n, ARBITRABLE, 9n).slice(0, 4)).toEqual([...disputeKeyPrefix("evidence", 1, 5n)]);
  });
});
