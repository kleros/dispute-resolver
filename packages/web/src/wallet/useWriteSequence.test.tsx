import type { Hex, SimulationResult } from "@dispute-resolver/core";
import { act, renderHook } from "@testing-library/react";
import { writeContract } from "@wagmi/core";
import { UserRejectedRequestError } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CoreDeps, WriteReceipt } from "../data";
import { createTestDeps } from "../test/data";
import { createConnectedTestWallet, testReceipt, testWriteBuild, walletWrapper } from "../test/wallet";
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

const minedReceipt = (_chainId: number, hash: Hex): Promise<WriteReceipt> => Promise.resolve(testReceipt(hash));

/** Connects a chain-1 wallet and renders the sequence over it. */
async function renderSequence(waitForReceipt: (chainId: number, hash: Hex) => Promise<WriteReceipt> = minedReceipt, simulate?: CoreDeps["simulate"]) {
  const wallet = await createConnectedTestWallet();
  const deps = createTestDeps({ waitForReceipt, ...(simulate === undefined ? {} : { simulate }) });
  return { ...renderHook(() => useWriteSequence(), { wrapper: walletWrapper(wallet, deps) }), wallet };
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
  it("checks each withdrawal against the contract after the previous one is mined, and stops at the first the contract would reject", async () => {
    const events: string[] = [];
    writeContractMock.mockImplementation((_config, parameters) => {
      events.push(`sign ${String(parameters.args?.[1])}`);
      return Promise.resolve(hashAt(events.filter((event) => event.startsWith("sign")).length - 1));
    });
    const simulate = vi.fn<CoreDeps["simulate"]>((call) => {
      events.push(`check ${String(call.args[1])}`);
      const result: SimulationResult = call.args[1] === 2n ? { status: "reverted", reason: null } : { status: "ok" };
      return Promise.resolve(result);
    });
    const onMined = vi.fn();
    const { result } = await renderSequence(minedReceipt, simulate);
    let outcome: WriteOutcome | undefined;
    await act(async () => {
      outcome = await result.current.execute(BUILDS, { pageChainId: 1, onMined });
    });
    expect(events).toEqual(["check 1", "sign 1", "check 2"]);
    expect(outcome).toEqual({ phase: "refused-by-contract", reason: null });
    expect(result.current.status).toMatchObject({ index: 1, total: 3, current: { phase: "refused-by-contract" } });
    expect(onMined).toHaveBeenCalledTimes(1);
  });

  it("withdraws in sequence, signing the next only after the previous receipt is mined, and refreshes once after the last", async () => {
    const events: string[] = [];
    const onMined = vi.fn();
    let signatures = 0;
    writeContractMock.mockImplementation((_config, parameters) => {
      events.push(`sign ${String(parameters.args?.[1])}`);
      signatures += 1;
      return Promise.resolve(hashAt(signatures - 1));
    });
    const { result } = await renderSequence((_chainId, hash) => {
      events.push(`receipt ${hash.slice(-1)}`);
      return Promise.resolve(testReceipt(hash));
    });
    let outcome: WriteOutcome | undefined;
    await act(async () => {
      outcome = await result.current.execute(BUILDS, { pageChainId: 1, onMined });
    });
    expect(events).toEqual(["sign 1", "receipt 1", "sign 2", "receipt 2", "sign 3", "receipt 3"]);
    expect(outcome?.phase).toBe("mined");
    expect(result.current.status).toMatchObject({ index: 2, total: 3, current: { phase: "mined", hash: hashAt(2) } });
    expect(onMined).toHaveBeenCalledTimes(1);
    expect(onMined).toHaveBeenCalledWith(testReceipt(hashAt(2)));
  });

  it("stops at the first rejected signature and still refreshes what was withdrawn", async () => {
    writeContractMock.mockResolvedValueOnce(hashAt(0)).mockRejectedValueOnce(new UserRejectedRequestError(new Error("denied")));
    const onMined = vi.fn();
    const { result } = await renderSequence();
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

  it("stops at the first failed transaction", async () => {
    const onMined = vi.fn();
    const { result } = await renderSequence((_chainId, hash) => Promise.resolve(testReceipt(hash, "reverted")));
    await act(async () => {
      await result.current.execute(BUILDS, { pageChainId: 1, onMined });
    });
    expect(result.current.status).toMatchObject({ index: 0, current: { phase: "failed", hash: hashAt(0) } });
    expect(writeContractMock).toHaveBeenCalledTimes(1);
    expect(onMined).not.toHaveBeenCalled();
  });

  it("checks the chain before every signature in the sequence", async () => {
    const { result, wallet } = await renderSequence(async (_chainId, hash) => {
      await wallet.changeChain(100);
      return testReceipt(hash);
    });
    await act(async () => {
      await result.current.execute(BUILDS, { pageChainId: 1 });
    });
    expect(result.current.status).toEqual({ index: 1, total: 3, current: { phase: "wrong-chain", walletChainId: 100, pageChainId: 1 } });
    expect(writeContractMock).toHaveBeenCalledTimes(1);
  });

  it("a refused item refuses the sequence before anything is signed", async () => {
    const { result } = await renderSequence();
    await act(async () => {
      await result.current.execute([testWriteBuild(1), { ok: false, refusal: "withdraw-unsupported" }], { pageChainId: 1 });
    });
    expect(result.current.status).toEqual({ index: 1, total: 2, current: { phase: "refused", refusal: "withdraw-unsupported" } });
    expect(writeContractMock).not.toHaveBeenCalled();
  });

  it("an empty list withdraws nothing", async () => {
    const { result } = await renderSequence();
    await act(async () => {
      await result.current.execute([], { pageChainId: 1 });
    });
    expect(result.current.status).toEqual({ index: 0, total: 0, current: { phase: "refused", refusal: "withdraw-unsupported" } });
    expect(writeContractMock).not.toHaveBeenCalled();
  });

  it("reset clears the status", async () => {
    const { result } = await renderSequence();
    await act(async () => {
      await result.current.execute(BUILDS.slice(0, 1), { pageChainId: 1 });
    });
    act(() => {
      result.current.reset();
    });
    expect(result.current.status).toBeNull();
  });
});
