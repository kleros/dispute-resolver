import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TEST_MINED, TEST_SENT, fakeWriteController, testReceipt, testWriteBuild } from "../test/wallet";
import type { WriteStatus } from "./types";

describe("fakeWriteController", () => {
  it("plays its script, runs onMined before mined, and records the call", async () => {
    const fake = fakeWriteController(TEST_SENT);
    const { result } = renderHook(() => fake.useWrite());
    const onMined = vi.fn();
    let outcome: WriteStatus | undefined;
    await act(async () => {
      outcome = await result.current.execute(testWriteBuild(1), { pageChainId: 1, onMined });
    });
    expect(outcome).toEqual(TEST_MINED);
    expect(result.current.status).toEqual(TEST_MINED);
    expect(onMined).toHaveBeenCalledWith(testReceipt());
    expect(fake.executions).toHaveLength(1);
  });

  it("a script must end with an outcome", async () => {
    const fake = fakeWriteController([{ phase: "pending" }]);
    const { result } = renderHook(() => fake.useWrite());
    await act(async () => {
      await expect(result.current.execute(testWriteBuild(1), { pageChainId: 1 })).rejects.toThrow('A fake write script must end with an outcome, not "pending".');
    });
  });

  it("the sequence fake plays the script per build and refreshes once", async () => {
    const fake = fakeWriteController([{ phase: "pending" }, TEST_MINED]);
    const { result } = renderHook(() => fake.useWriteSequence());
    const onMined = vi.fn();
    await act(async () => {
      await result.current.execute([testWriteBuild(1, 1n), testWriteBuild(1, 2n)], { pageChainId: 1, onMined });
    });
    expect(result.current.status).toEqual({ index: 1, total: 2, current: TEST_MINED });
    expect(onMined).toHaveBeenCalledTimes(1);
  });
});
