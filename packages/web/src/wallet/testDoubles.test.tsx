import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TEST_TX_HASH, fakeWriteController, testReceipt, testWriteBuild } from "../test/wallet";
import type { WriteStatus } from "./types";

const MINED: WriteStatus = { phase: "mined", hash: TEST_TX_HASH, explorerUrl: null, receipt: testReceipt() };

describe("fakeWriteController", () => {
  it("plays its script, runs onMined before mined, and records the call", async () => {
    const fake = fakeWriteController([{ phase: "pending" }, { phase: "submitted", hash: TEST_TX_HASH, explorerUrl: null }, MINED]);
    const { result } = renderHook(() => fake.useWrite());
    const onMined = vi.fn();
    let outcome: WriteStatus | undefined;
    await act(async () => {
      outcome = await result.current.execute(testWriteBuild(1), { pageChainId: 1, onMined });
    });
    expect(outcome).toEqual(MINED);
    expect(result.current.status).toEqual(MINED);
    expect(onMined).toHaveBeenCalledWith(testReceipt());
    expect(fake.executions).toHaveLength(1);
  });

  it("starts from a given status", () => {
    const fake = fakeWriteController([], { initial: { phase: "wrong-chain", walletChainId: 100, pageChainId: 1 } });
    const { result } = renderHook(() => fake.useWrite());
    expect(result.current.status).toEqual({ phase: "wrong-chain", walletChainId: 100, pageChainId: 1 });
  });

  it("a script must end with an outcome", async () => {
    const fake = fakeWriteController([{ phase: "pending" }]);
    const { result } = renderHook(() => fake.useWrite());
    await act(async () => {
      await expect(result.current.execute(testWriteBuild(1), { pageChainId: 1 })).rejects.toThrow('A fake write script must end with an outcome, not "pending".');
    });
  });

  it("the sequence fake plays the script per build and refreshes once", async () => {
    const fake = fakeWriteController([{ phase: "pending" }, MINED]);
    const { result } = renderHook(() => fake.useWriteSequence());
    const onMined = vi.fn();
    await act(async () => {
      await result.current.execute([testWriteBuild(1, 1n), testWriteBuild(1, 2n)], { pageChainId: 1, onMined });
    });
    expect(result.current.status).toEqual({ index: 1, total: 2, current: MINED });
    expect(onMined).toHaveBeenCalledTimes(1);
  });
});
