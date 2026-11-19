import * as core from "@dispute-resolver/core";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { codeRpc, createTestDeps, createTestQueryClient, dataWrapper, type RpcHandler, type TestDepsOptions } from "../test/data";
import { useArbitrationCost, useCannotReceivePayout, useIsContractAccount } from "./accountHooks";

vi.mock("@dispute-resolver/core", async (importOriginal) => (await import("../test/data/mockCoreReads")).mockCoreReads(importOriginal));

const ACCOUNT = "0x1111111111111111111111111111111111111111";

function wrapperWith(options: TestDepsOptions) {
  return dataWrapper({ deps: createTestDeps(options) });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useIsContractAccount", () => {
  it.each([
    ["0x6080604052", true],
    ["0xEF01001111111111111111111111111111111111111111", false],
    ["0x", false],
    ["0x00", true],
  ] as const)("an account with code %s, read through the page chain's read client, is a smart-contract wallet: %s", async (code, isContract) => {
    const rpc = vi.fn(codeRpc(code));
    const { result } = renderHook(() => useIsContractAccount(100, ACCOUNT), { wrapper: wrapperWith({ rpc }) });
    await waitFor(() => {
      expect(result.current).toEqual({ status: "ready", value: isContract });
    });
    expect(rpc).toHaveBeenCalledWith(expect.objectContaining({ chainId: 100, method: "eth_getCode" }));
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
});

const DELEGATION = "0xef01007702cb554e6bfb442cb743a7df23154544a7176c";

function revert(): Error {
  return Object.assign(new Error("execution reverted"), { code: 3 });
}

/** A node where the account has `code` and the payout probe's eth_call answers with `probe`. */
function payoutRpc(code: string, probe: () => unknown): RpcHandler {
  return ({ method }) => {
    if (method === "eth_getCode") return code;
    if (method === "eth_call") return probe();
    throw new Error(`unexpected ${method}`);
  };
}

function callsOf(rpc: Mock<RpcHandler>, method: string): number {
  return rpc.mock.calls.filter(([request]) => request.method === method).length;
}

describe("useCannotReceivePayout", () => {
  it("an EIP-7702 account whose probe reverts cannot receive, checked through the page chain's read client", async () => {
    const rpc = vi.fn<RpcHandler>(
      payoutRpc(DELEGATION, () => {
        throw revert();
      }),
    );
    const { result } = renderHook(() => useCannotReceivePayout(100, ACCOUNT), { wrapper: wrapperWith({ rpc }) });
    await waitFor(() => {
      expect(result.current).toBe(true);
    });
    expect(rpc).toHaveBeenCalledWith(expect.objectContaining({ chainId: 100, method: "eth_call" }));
  });

  it.each<[string, () => unknown]>([
    ["succeeds", () => "0x"],
    [
      "fails for a reason other than a revert",
      () => {
        throw Object.assign(new Error("invalid argument 2: too many arguments, want at most 2"), { code: -32602 });
      },
    ],
  ])("an EIP-7702 account whose probe %s is not flagged", async (_case, probe) => {
    const rpc = vi.fn<RpcHandler>(payoutRpc(DELEGATION, probe));
    const { result } = renderHook(() => useCannotReceivePayout(1, ACCOUNT), { wrapper: wrapperWith({ rpc }) });
    await waitFor(() => {
      expect(callsOf(rpc, "eth_call")).toBe(1);
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(result.current).toBe(false);
  });

  it.each([
    ["an account without code", "0x"],
    ["a contract account", "0x6080604052"],
  ])("%s is not flagged and never probed", async (_case, code) => {
    const rpc = vi.fn<RpcHandler>(payoutRpc(code, () => "0x"));
    const { result } = renderHook(() => useCannotReceivePayout(1, ACCOUNT), { wrapper: wrapperWith({ rpc }) });
    await waitFor(() => {
      expect(callsOf(rpc, "eth_getCode")).toBe(1);
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(result.current).toBe(false);
    expect(callsOf(rpc, "eth_call")).toBe(0);
  });

  it("is not flagged when the code read fails, without an account or without an RPC", async () => {
    const failing = renderHook(() => useCannotReceivePayout(1, ACCOUNT), { wrapper: wrapperWith({}) });
    const rpc = vi.fn<RpcHandler>(payoutRpc(DELEGATION, revert));
    const noAccount = renderHook(() => useCannotReceivePayout(1, undefined), { wrapper: wrapperWith({ rpc }) });
    const noRpc = renderHook(() => useCannotReceivePayout(1, ACCOUNT), { wrapper: wrapperWith({ rpc, unconfiguredChains: [1] }) });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(failing.result.current).toBe(false);
    expect(noAccount.result.current).toBe(false);
    expect(noRpc.result.current).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("one code read and one probe serve every caller on the page, the contract-wallet check included", async () => {
    const rpc = vi.fn<RpcHandler>(
      payoutRpc(DELEGATION, () => {
        throw revert();
      }),
    );
    const { result } = renderHook(() => ({ first: useCannotReceivePayout(1, ACCOUNT), second: useCannotReceivePayout(1, ACCOUNT), contract: useIsContractAccount(1, ACCOUNT) }), {
      wrapper: wrapperWith({ rpc }),
    });
    await waitFor(() => {
      expect(result.current).toEqual({ first: true, second: true, contract: { status: "ready", value: false } });
    });
    expect(callsOf(rpc, "eth_getCode")).toBe(1);
    expect(callsOf(rpc, "eth_call")).toBe(1);
  });

  it("a probe that could not tell is asked again when a later caller mounts, while a revert is kept", async () => {
    let failure: () => Error = () => Object.assign(new Error("header not found"), { code: -32000 });
    const rpc = vi.fn<RpcHandler>(
      payoutRpc(DELEGATION, () => {
        throw failure();
      }),
    );
    const wrapper = dataWrapper({ deps: createTestDeps({ rpc }), client: createTestQueryClient() });
    const first = renderHook(() => useCannotReceivePayout(1, ACCOUNT), { wrapper });
    await waitFor(() => {
      expect(callsOf(rpc, "eth_call")).toBe(1);
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(first.result.current).toBe(false);
    first.unmount();
    failure = revert;
    const second = renderHook(() => useCannotReceivePayout(1, ACCOUNT), { wrapper });
    await waitFor(() => {
      expect(second.result.current).toBe(true);
    });
    second.unmount();
    const third = renderHook(() => useCannotReceivePayout(1, ACCOUNT), { wrapper });
    expect(third.result.current).toBe(true);
    expect(callsOf(rpc, "eth_call")).toBe(2);
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
