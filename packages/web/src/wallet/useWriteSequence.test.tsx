import type { ChainId, Hex } from "@dispute-resolver/core";
import { act, renderHook } from "@testing-library/react";
import { writeContract } from "@wagmi/core";
import { UserRejectedRequestError } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WriteReceipt } from "../data";
import { createTestDeps } from "../test/data";
import { createTestWallet, testReceipt, testReplacementReceipt, testWriteBuild, walletWrapper, type TestWallet } from "../test/wallet";
import type { WriteOutcome } from "./types";
import { useWriteSequence } from "./useWriteSequence";

vi.mock("@wagmi/core", async (importOriginal) => ({ ...(await importOriginal<typeof import("@wagmi/core")>()), writeContract: vi.fn() }));

const writeContractMock = vi.mocked(writeContract);
const HASHES: readonly Hex[] = [
  "0xaaaa000000000000000000000000000000000000000000000000000000000001",
  "0xaaaa000000000000000000000000000000000000000000000000000000000002",
  "0xaaaa000000000000000000000000000000000000000000000000000000000003",
];

function hashAt(index: number): Hex {
  const hash = HASHES[index];
  if (hash === undefined) throw new Error(`No test hash ${String(index)}.`);
  return hash;
}

function renderSequence(wallet: TestWallet, waitForReceipt: (chainId: ChainId, hash: Hex) => Promise<WriteReceipt>) {
  return renderHook(() => useWriteSequence(), { wrapper: walletWrapper(wallet, createTestDeps({ waitForReceipt })) });
}

const BUILDS = [testWriteBuild(1, 1n), testWriteBuild(1, 2n), testWriteBuild(1, 3n)];

beforeEach(() => {
  writeContractMock.mockReset();
  let signed = 0;
  writeContractMock.mockImplementation(() => {
    signed += 1;
    return Promise.resolve(hashAt(signed - 1));
  });
});

describe("useWriteSequence", () => {
  it("D-51: withdraws in sequence, signing the next only after the previous receipt is mined", async () => {
    const wallet = createTestWallet();
    await wallet.connect();
    const events: string[] = [];
    let signatures = 0;
    writeContractMock.mockImplementation((_config, parameters) => {
      events.push(`sign ${String(parameters.args?.[1])}`);
      signatures += 1;
      return Promise.resolve(hashAt(signatures - 1));
    });
    const { result } = renderSequence(wallet, (_chainId, hash) => {
      events.push(`receipt ${hash.slice(-1)}`);
      return Promise.resolve(testReceipt(hash));
    });
    let outcome: WriteOutcome | undefined;
    await act(async () => {
      outcome = await result.current.execute(BUILDS, { pageChainId: 1 });
    });
    expect(events).toEqual(["sign 1", "receipt 1", "sign 2", "receipt 2", "sign 3", "receipt 3"]);
    expect(outcome?.phase).toBe("mined");
    expect(result.current.status).toMatchObject({ index: 2, total: 3, current: { phase: "mined", hash: hashAt(2) } });
  });

  it("P-02: refreshes once, after the last mined receipt", async () => {
    const wallet = createTestWallet();
    await wallet.connect();
    const onMined = vi.fn();
    const { result } = renderSequence(wallet, (_chainId, hash) => Promise.resolve(testReceipt(hash)));
    await act(async () => {
      await result.current.execute(BUILDS, { pageChainId: 1, onMined });
    });
    expect(onMined).toHaveBeenCalledTimes(1);
    expect(onMined).toHaveBeenCalledWith(testReceipt(hashAt(2)));
  });

  it("D-51: stops at the first rejected signature and still refreshes what was withdrawn", async () => {
    const wallet = createTestWallet();
    await wallet.connect();
    writeContractMock.mockResolvedValueOnce(hashAt(0)).mockRejectedValueOnce(new UserRejectedRequestError(new Error("denied")));
    const onMined = vi.fn();
    const { result } = renderSequence(wallet, (_chainId, hash) => Promise.resolve(testReceipt(hash)));
    let outcome: WriteOutcome | undefined;
    await act(async () => {
      outcome = await result.current.execute(BUILDS, { pageChainId: 1, onMined });
    });
    expect(outcome).toEqual({ phase: "rejected" });
    expect(result.current.status).toEqual({ index: 1, total: 3, current: { phase: "rejected" } });
    expect(writeContractMock).toHaveBeenCalledTimes(2);
    expect(onMined).toHaveBeenCalledTimes(1);
    expect(onMined).toHaveBeenCalledWith(testReceipt(hashAt(0)));
  });

  it("D-51: stops at the first failed transaction", async () => {
    const wallet = createTestWallet();
    await wallet.connect();
    const onMined = vi.fn();
    const { result } = renderSequence(wallet, (_chainId, hash) => Promise.resolve(testReceipt(hash, "reverted")));
    await act(async () => {
      await result.current.execute(BUILDS, { pageChainId: 1, onMined });
    });
    expect(result.current.status).toMatchObject({ index: 0, current: { phase: "failed", hash: hashAt(0) } });
    expect(writeContractMock).toHaveBeenCalledTimes(1);
    expect(onMined).not.toHaveBeenCalled();
  });

  it("R2 / D-51: stops after a cancelled withdrawal and does not sign the next one", async () => {
    const wallet = createTestWallet();
    await wallet.connect();
    const onMined = vi.fn();
    const { result } = renderSequence(wallet, (_chainId, hash) => Promise.resolve(hash === hashAt(1) ? testReplacementReceipt(hash, "cancelled") : testReceipt(hash)));
    let outcome: WriteOutcome | undefined;
    await act(async () => {
      outcome = await result.current.execute(BUILDS, { pageChainId: 1, onMined });
    });
    expect(outcome?.phase).toBe("failed");
    expect(writeContractMock).toHaveBeenCalledTimes(2);
    expect(result.current.status).toMatchObject({ index: 1, total: 3, current: { phase: "failed" } });
    expect(onMined).toHaveBeenCalledTimes(1);
    expect(onMined).toHaveBeenCalledWith(testReceipt(hashAt(0)));
  });

  it("B3: checks the chain before every signature in the sequence", async () => {
    const wallet = createTestWallet();
    await wallet.connect();
    const { result } = renderSequence(wallet, async (_chainId, hash) => {
      await wallet.changeChain(100);
      return testReceipt(hash);
    });
    await act(async () => {
      await result.current.execute(BUILDS, { pageChainId: 1 });
    });
    expect(result.current.status).toEqual({ index: 1, total: 3, current: { phase: "wrong-chain", walletChainId: 100, pageChainId: 1 } });
    expect(writeContractMock).toHaveBeenCalledTimes(1);
  });

  it("D-07: a refused item refuses the sequence before anything is signed", async () => {
    const wallet = createTestWallet();
    await wallet.connect();
    const { result } = renderSequence(wallet, (_chainId, hash) => Promise.resolve(testReceipt(hash)));
    await act(async () => {
      await result.current.execute([testWriteBuild(1), { ok: false, refusal: "withdraw-unsupported" }], { pageChainId: 1 });
    });
    expect(result.current.status).toEqual({ index: 1, total: 2, current: { phase: "refused", refusal: "withdraw-unsupported" } });
    expect(writeContractMock).not.toHaveBeenCalled();
  });

  it("D-51: an empty list withdraws nothing", async () => {
    const wallet = createTestWallet();
    await wallet.connect();
    const { result } = renderSequence(wallet, (_chainId, hash) => Promise.resolve(testReceipt(hash)));
    await act(async () => {
      await result.current.execute([], { pageChainId: 1 });
    });
    expect(result.current.status).toEqual({ index: 0, total: 0, current: { phase: "refused", refusal: "withdraw-unsupported" } });
    expect(writeContractMock).not.toHaveBeenCalled();
  });

  it("D-51: reset clears the status", async () => {
    const wallet = createTestWallet();
    await wallet.connect();
    const { result } = renderSequence(wallet, (_chainId, hash) => Promise.resolve(testReceipt(hash)));
    await act(async () => {
      await result.current.execute(BUILDS.slice(0, 1), { pageChainId: 1 });
    });
    act(() => {
      result.current.reset();
    });
    expect(result.current.status).toBeNull();
  });
});
