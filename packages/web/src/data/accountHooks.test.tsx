import * as core from "@dispute-resolver/core";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { codeRpc, createTestDeps, dataWrapper, type TestDepsOptions } from "../test/data";
import { isContractCode, useArbitrationCost, useIsContractAccount } from "./accountHooks";

vi.mock("@dispute-resolver/core", async (importOriginal) => (await import("../test/data/mockCoreReads")).mockCoreReads(importOriginal));

const ACCOUNT = "0x1111111111111111111111111111111111111111";

function wrapperWith(options: TestDepsOptions) {
  return dataWrapper({ deps: createTestDeps(options) });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useIsContractAccount", () => {
  it("treats an account with code as a smart-contract wallet, read through the page chain's read client", async () => {
    const rpc = vi.fn(codeRpc("0x6080604052"));
    const { result } = renderHook(() => useIsContractAccount(100, ACCOUNT), { wrapper: wrapperWith({ rpc }) });
    await waitFor(() => {
      expect(result.current).toEqual({ status: "ready", value: true });
    });
    expect(rpc).toHaveBeenCalledWith(expect.objectContaining({ chainId: 100, method: "eth_getCode" }));
  });

  it("does not treat an EIP-7702 delegated EOA as a smart-contract wallet", async () => {
    const { result } = renderHook(() => useIsContractAccount(1, ACCOUNT), { wrapper: wrapperWith({ rpc: codeRpc("0xEF01001111111111111111111111111111111111111111") }) });
    await waitFor(() => {
      expect(result.current).toEqual({ status: "ready", value: false });
    });
  });

  it("does not treat an account without code as a smart-contract wallet", async () => {
    const { result } = renderHook(() => useIsContractAccount(1, ACCOUNT), { wrapper: wrapperWith({ rpc: codeRpc("0x") }) });
    await waitFor(() => {
      expect(result.current).toEqual({ status: "ready", value: false });
    });
  });

  it("hides the warning when the code read fails", async () => {
    const { result } = renderHook(() => useIsContractAccount(1, ACCOUNT), { wrapper: wrapperWith({}) });
    await waitFor(() => {
      expect(result.current).toEqual({ status: "ready", value: false });
    });
  });

  it("reads nothing without an account or an RPC", () => {
    const rpc = vi.fn(codeRpc("0x60"));
    const noAccount = renderHook(() => useIsContractAccount(1, undefined), { wrapper: wrapperWith({ rpc }) });
    const noRpc = renderHook(() => useIsContractAccount(1, ACCOUNT), { wrapper: wrapperWith({ rpc, unconfiguredChains: [1] }) });
    expect(noAccount.result.current).toEqual({ status: "ready", value: false });
    expect(noRpc.result.current).toEqual({ status: "ready", value: false });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("isContractCode is true only for non-empty code that is not an EIP-7702 delegation", () => {
    expect(isContractCode(undefined)).toBe(false);
    expect(isContractCode("0x")).toBe(false);
    expect(isContractCode("0xef0100aa")).toBe(false);
    expect(isContractCode("0x00")).toBe(true);
  });
});

describe("useArbitrationCost", () => {
  it("reads the cost of the court and vote count on the page chain", async () => {
    vi.mocked(core.readArbitrationCost).mockResolvedValue({ ok: true, value: 123n });
    const { result } = renderHook(() => useArbitrationCost(1, "0x01"), { wrapper: wrapperWith({}) });
    await waitFor(() => {
      expect(result.current).toEqual({ status: "ready", value: 123n });
    });
    expect(core.readArbitrationCost).toHaveBeenCalledWith(expect.anything(), core.getChain(1), "0x01");
  });

  it("reports a failed cost read as unavailable with its reason", async () => {
    vi.mocked(core.readArbitrationCost).mockResolvedValue({ ok: false, error: { code: "reverted", message: "arbitrationCost reverted" } });
    const { result } = renderHook(() => useArbitrationCost(1, "0x01"), { wrapper: wrapperWith({}) });
    await waitFor(() => {
      expect(result.current).toEqual({ status: "unavailable", error: { code: "reverted", message: "arbitrationCost reverted" } });
    });
  });

  it("reports an unconfigured chain as no-rpc without reading", () => {
    const { result } = renderHook(() => useArbitrationCost(1, "0x01"), { wrapper: wrapperWith({ unconfiguredChains: [1] }) });
    expect(result.current).toMatchObject({ status: "unavailable", error: { code: "no-rpc" } });
    expect(core.readArbitrationCost).not.toHaveBeenCalled();
  });
});
