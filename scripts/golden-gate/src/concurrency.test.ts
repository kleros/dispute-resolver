import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "./concurrency";

describe("mapWithConcurrency", () => {
  it("keeps the input order whatever order the tasks settle in", async () => {
    const result = await mapWithConcurrency([30, 10, 20], 3, async (value) => {
      await new Promise((resolve) => setTimeout(resolve, value));
      return value * 2;
    });
    expect(result).toEqual([60, 20, 40]);
  });

  it("never runs more than the limit at once", async () => {
    let running = 0;
    let peak = 0;
    await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 2, async () => {
      running += 1;
      peak = Math.max(peak, running);
      await Promise.resolve();
      running -= 1;
    });
    expect(peak).toBe(2);
  });

  it("refuses a limit below one", async () => {
    await expect(mapWithConcurrency([1], 0, async (value) => Promise.resolve(value))).rejects.toThrow(RangeError);
  });
});
