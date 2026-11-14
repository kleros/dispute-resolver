import { createPublicClient, custom, encodeErrorResult, encodeFunctionData, encodeFunctionResult, numberToHex } from "viem";
import { describe, expect, it } from "vitest";
import { idrV2Abi } from "../abi";
import type { Address, Hex, ReadClient, WriteCall } from "../types";
import { simulateWrite } from "./index";
import { rpcError } from "../test/rpc/testHelpers";

const ACCOUNT: Address = "0x00000000000000000000000000000000000000a1";
/** The mainnet ArbitrableProxy: the chain table's own, so its failure text may be shown. */
const KNOWN: Address = "0x99489d7bb33539f3d1a401741e56e8f02b9ae0cf";
const UNKNOWN: Address = "0x00000000000000000000000000000000000000dd";

function fundAppeal(address: Address, chainId = 1, value = 5n): WriteCall {
  return { kind: "fund-appeal", chainId, address, abi: idrV2Abi, functionName: "fundAppeal", args: [12n, 2n], value };
}

const REVERT_DATA = encodeErrorResult({
  abi: [{ type: "error", name: "Error", inputs: [{ name: "message", type: "string" }] }],
  errorName: "Error",
  args: ["Appeal period is over."],
});

function revert(): Error {
  return Object.assign(rpcError(3, "execution reverted: Appeal period is over."), { data: REVERT_DATA });
}

interface Node {
  readonly balance?: bigint | Error;
  readonly call?: Hex | Error;
}

interface Sent {
  readonly methods: string[];
  readonly balanceOf: unknown[];
  readonly calls: { readonly from?: string; readonly to?: string; readonly data?: string; readonly value?: string }[];
}

function node(spec: Node): { readonly client: ReadClient; readonly sent: Sent } {
  const sent: Sent = { methods: [], balanceOf: [], calls: [] };
  const request = ({ method, params }: { method: string; params?: unknown }): Promise<unknown> => {
    sent.methods.push(method);
    if (method === "eth_getBalance") {
      sent.balanceOf.push((params as unknown[])[0]);
      const balance = spec.balance ?? 10n ** 18n;
      return balance instanceof Error ? Promise.reject(balance) : Promise.resolve(numberToHex(balance));
    }
    if (method === "eth_call") {
      const [call] = params as [Sent["calls"][number]];
      sent.calls.push(call);
      const answer = spec.call ?? encodeFunctionResult({ abi: idrV2Abi, functionName: "fundAppeal", result: true });
      return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
    }
    return Promise.reject(rpcError(-32601, `unexpected method ${method}`));
  };
  return { client: createPublicClient({ transport: custom({ request }, { retryCount: 0 }) }), sent };
}

describe("simulateWrite", () => {
  it("a call the contract accepts passes", async () => {
    const { client } = node({});
    expect(await simulateWrite(client, fundAppeal(KNOWN), ACCOUNT)).toEqual({ status: "ok" });
  });

  it("a call the contract accepts without returning anything passes", async () => {
    const { client } = node({ call: "0x" });
    expect(await simulateWrite(client, fundAppeal(UNKNOWN), ACCOUNT)).toEqual({ status: "ok" });
  });

  it("simulates from the connected account with the call's value through the read client", async () => {
    const { client, sent } = node({});
    await simulateWrite(client, fundAppeal(KNOWN, 1, 7n), ACCOUNT);
    expect(sent.balanceOf).toEqual([ACCOUNT]);
    expect(sent.calls).toHaveLength(1);
    expect(sent.calls[0]).toMatchObject({
      from: ACCOUNT,
      to: KNOWN,
      value: numberToHex(7n),
      data: encodeFunctionData({ abi: idrV2Abi, functionName: "fundAppeal", args: [12n, 2n] }),
    });
  });

  it("a revert of the chain's own contract carries the contract's own reason, and nothing of viem's or the node's wording", async () => {
    const { client } = node({ call: revert() });
    expect(await simulateWrite(client, fundAppeal(KNOWN), ACCOUNT)).toEqual({ status: "reverted", reason: "Appeal period is over." });
  });

  it("the chain's own contract's address called on another chain never carries the contract's own text", async () => {
    const { client } = node({ call: revert() });
    expect(await simulateWrite(client, fundAppeal(KNOWN, 100), ACCOUNT)).toEqual({ status: "reverted", reason: null });
  });

  it("a revert without a reason is still a revert, with no reason", async () => {
    const { client } = node({ call: rpcError(3, "execution reverted") });
    expect(await simulateWrite(client, fundAppeal(KNOWN), ACCOUNT)).toEqual({ status: "reverted", reason: null });
  });

  it("a balance below the call's value is reported as such before any simulation", async () => {
    const { client, sent } = node({ balance: 4n });
    expect(await simulateWrite(client, fundAppeal(KNOWN, 1, 5n), ACCOUNT)).toEqual({ status: "insufficient-funds" });
    expect(sent.calls).toEqual([]);
  });

  it("a call without value does not read the balance", async () => {
    const { client, sent } = node({ balance: 0n });
    expect(await simulateWrite(client, fundAppeal(KNOWN, 1, 0n), ACCOUNT)).toEqual({ status: "ok" });
    expect(sent.methods).not.toContain("eth_getBalance");
  });

  it("a node that names the balance as too low is reported as such", async () => {
    const { client } = node({ call: rpcError(-32000, "err: insufficient funds for gas * price + value: address 0x00000000000000000000000000000000000000a1 have 0 want 5") });
    expect(await simulateWrite(client, fundAppeal(KNOWN), ACCOUNT)).toEqual({ status: "insufficient-funds" });
  });

  it.each([
    ["a node's out-of-funds answer", rpcError(-32003, "EVM error: OutOfFunds")],
    ["a transport failure", rpcError(-32000, "header not found")],
  ])("%s never passes", async (_, failure) => {
    const { client } = node({ call: failure });
    expect(await simulateWrite(client, fundAppeal(KNOWN), ACCOUNT)).toMatchObject({ status: "unavailable", error: { code: "rpc-error" } });
  });

  it("a failed balance read never passes", async () => {
    const { client, sent } = node({ balance: rpcError(-32000, "header not found") });
    expect(await simulateWrite(client, fundAppeal(KNOWN), ACCOUNT)).toMatchObject({ status: "unavailable", error: { code: "rpc-error" } });
    expect(sent.calls).toEqual([]);
  });

  it("without a read client nothing is checked and nothing passes", async () => {
    expect(await simulateWrite(undefined, fundAppeal(KNOWN), ACCOUNT)).toEqual({
      status: "unavailable",
      error: { code: "no-rpc", message: "This network's data is unavailable." },
    });
  });
});
