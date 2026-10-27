import { hashKey } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { testBinding } from "../test/data";
import { IDLE_KEY, queryKeys } from "./queryKeys";

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
  queryKeys.chainTime(100),
  IDLE_KEY,
];

describe("query keys", () => {
  it("holds strings and numbers only in every key, starts each with dr, and hashes them", () => {
    for (const key of everyKey) {
      expect(key[0]).toBe("dr");
      for (const part of key) expect(["string", "number"]).toContain(typeof part);
      expect(() => hashKey(key)).not.toThrow();
    }
  });
});
