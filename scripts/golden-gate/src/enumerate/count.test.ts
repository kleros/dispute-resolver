import { describe, expect, it } from "vitest";
import { countDisputes } from "./count";

function upTo(count: bigint): (disputeId: bigint) => Promise<boolean> {
  return (disputeId) => Promise.resolve(disputeId < count);
}

describe("dispute count (C6 enumeration of every existing dispute)", () => {
  it("counts the disputes of an arbitrator for many sizes", async () => {
    for (const count of [0n, 1n, 2n, 3n, 452n, 1026n, 1691n]) expect(await countDisputes(upTo(count))).toBe(count);
  });

  it("propagates a failed read instead of shortening the count", async () => {
    await expect(countDisputes((id) => (id < 4n ? Promise.resolve(true) : Promise.reject(new Error("rpc down"))))).rejects.toThrow("rpc down");
  });
});
