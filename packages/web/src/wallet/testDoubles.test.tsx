import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TEST_TX_HASH, fakeWriteController, testReceipt, testWriteBuild } from "../test/wallet";
import type { WriteStatus } from "./types";

const MINED: WriteStatus = { phase: "mined", hash: TEST_TX_HASH, explorerUrl: null, receipt: testReceipt() };

describe("fakeWriteController (ARCHITECTURE.md §1.5)", () => {
  it("§1.5: plays its script, runs onMined before mined, and records the call", async () => {
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

  it("§1.5: starts from a given status and records switch and connect requests", async () => {
    const fake = fakeWriteController([], { initial: { phase: "wrong-chain", walletChainId: 100, pageChainId: 1 }, switchSucceeds: false });
    const { result } = renderHook(() => fake.useWrite());
    expect(result.current.status.phase).toBe("wrong-chain");
    expect(await result.current.switchChain(1)).toBe(false);
    act(() => {
      result.current.connect();
    });
    expect(fake.switchRequests).toEqual([1]);
    expect(fake.connectCalls.count).toBe(1);
  });

  it("§1.5: a script must end with an outcome", async () => {
    const fake = fakeWriteController([{ phase: "pending" }]);
    const { result } = renderHook(() => fake.useWrite());
    await act(async () => {
      await expect(result.current.execute(testWriteBuild(1), { pageChainId: 1 })).rejects.toThrow('A fake write script must end with an outcome, not "pending".');
    });
  });

  it("D-51: the sequence fake plays the script per build and refreshes once", async () => {
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
