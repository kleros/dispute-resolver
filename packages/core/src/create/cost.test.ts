import { encodeFunctionData, encodeFunctionResult } from "viem";
import { describe, expect, it } from "vitest";
import { klerosLiquidAbi } from "../abi";
import type { Hex } from "../types";
import { chainOf } from "../test/chains/testHelpers";
import { encodeExtraData, readArbitrationCost } from "./index";
import { type CallAnswer, callKey, fakeClient, rpcError } from "../test/create/testHelpers";

const EXTRA_DATA = encodeExtraData(0n, 3n);

function costCall(arbitrator: string, extraData: Hex, answer: CallAnswer): Map<string, CallAnswer> {
  const data = encodeFunctionData({ abi: klerosLiquidAbi, functionName: "arbitrationCost", args: [extraData] });
  return new Map([[callKey(arbitrator, data), answer]]);
}

function costResult(cost: bigint): CallAnswer {
  return { result: encodeFunctionResult({ abi: klerosLiquidAbi, functionName: "arbitrationCost", result: cost }) };
}

describe("readArbitrationCost", () => {
  it("reads arbitrationCost(extraData) from the chain's KlerosLiquid, in wei", async () => {
    const mainnet = chainOf(1);
    const arbitrator = mainnet.klerosLiquid ?? "";
    const { client, requested } = fakeClient(costCall(arbitrator, EXTRA_DATA, costResult(97_500_000_000_000_000n)));
    await expect(readArbitrationCost(client, mainnet, EXTRA_DATA)).resolves.toEqual({ ok: true, value: 97_500_000_000_000_000n });
    expect(requested).toHaveLength(1);
  });

  it("the extraData given is the one sent, so a court and vote change reads a new cost", async () => {
    const gnosis = chainOf(100);
    const extraData = encodeExtraData(12n, 5n);
    const { client } = fakeClient(costCall(gnosis.klerosLiquid ?? "", extraData, costResult(42n)));
    await expect(readArbitrationCost(client, gnosis, extraData)).resolves.toEqual({ ok: true, value: 42n });
  });

  it("a chain without an arbitrator is unsupported and reads nothing", async () => {
    const polygon = chainOf(137);
    const { client, requested } = fakeClient(new Map());
    const outcome = await readArbitrationCost(client, polygon, EXTRA_DATA);
    expect(outcome.ok).toBe(false);
    expect(!outcome.ok && outcome.error.code).toBe("unsupported");
    expect(requested).toHaveLength(0);
  });

  it.each<[string, number, CallAnswer, string]>([
    ["a revert (an unknown court) is a `reverted` outcome, never a thrown error", 1, { error: rpcError(3, "execution reverted") }, "reverted"],
    [
      "a transport failure is an `rpc-error` outcome whose message never carries the RPC URL",
      11155111,
      { error: new Error("request to https://rpc.example/v3/secret-key failed: socket hang up") },
      "rpc-error",
    ],
  ])("%s", async (_name, chainId, answer, code) => {
    const chain = chainOf(chainId);
    const { client } = fakeClient(costCall(chain.klerosLiquid ?? "", EXTRA_DATA, answer));
    const outcome = await readArbitrationCost(client, chain, EXTRA_DATA);
    expect(outcome).toMatchObject({ ok: false, error: { code } });
    expect(!outcome.ok && outcome.error.message).not.toContain("secret-key");
  });
});
