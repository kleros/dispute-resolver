import { encodeFunctionData, encodeFunctionResult } from "viem";
import { describe, expect, it } from "vitest";
import { klerosLiquidAbi } from "../abi";
import { getChain } from "../chains";
import type { ChainConfig } from "../chains/types";
import type { Hex } from "../types";
import { encodeExtraData, readArbitrationCost } from "./index";
import { type CallAnswer, callKey, fakeClient, rpcError } from "../test/create/testHelpers";

function chain(chainId: number): ChainConfig {
  const config = getChain(chainId);
  if (config === undefined) throw new Error(`chain ${String(chainId)} is not configured`);
  return config;
}

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
    const mainnet = chain(1);
    const arbitrator = mainnet.klerosLiquid ?? "";
    const { client, requested } = fakeClient(costCall(arbitrator, EXTRA_DATA, costResult(97_500_000_000_000_000n)));
    await expect(readArbitrationCost(client, mainnet, EXTRA_DATA)).resolves.toEqual({ ok: true, value: 97_500_000_000_000_000n });
    expect(requested).toHaveLength(1);
  });

  it("the extraData given is the one sent, so a court and vote change reads a new cost", async () => {
    const gnosis = chain(100);
    const extraData = encodeExtraData(12n, 5n);
    const { client } = fakeClient(costCall(gnosis.klerosLiquid ?? "", extraData, costResult(42n)));
    await expect(readArbitrationCost(client, gnosis, extraData)).resolves.toEqual({ ok: true, value: 42n });
  });

  it("a chain without an arbitrator is unsupported and reads nothing", async () => {
    const polygon = chain(137);
    const { client, requested } = fakeClient(new Map());
    const outcome = await readArbitrationCost(client, polygon, EXTRA_DATA);
    expect(outcome.ok).toBe(false);
    expect(!outcome.ok && outcome.error.code).toBe("unsupported");
    expect(requested).toHaveLength(0);
  });

  it("a revert (an unknown court) is a `reverted` outcome, never a thrown error", async () => {
    const mainnet = chain(1);
    const { client } = fakeClient(costCall(mainnet.klerosLiquid ?? "", EXTRA_DATA, { error: rpcError(3, "execution reverted") }));
    const outcome = await readArbitrationCost(client, mainnet, EXTRA_DATA);
    expect(outcome.ok).toBe(false);
    expect(!outcome.ok && outcome.error.code).toBe("reverted");
  });

  it("a transport failure is an `rpc-error` outcome whose message never carries the RPC URL", async () => {
    const sepolia = chain(11155111);
    const url = "https://rpc.example/v3/secret-key";
    const { client } = fakeClient(costCall(sepolia.klerosLiquid ?? "", EXTRA_DATA, { error: new Error(`request to ${url} failed: socket hang up`) }));
    const outcome = await readArbitrationCost(client, sepolia, EXTRA_DATA);
    expect(outcome.ok).toBe(false);
    expect(!outcome.ok && outcome.error.code).toBe("rpc-error");
    expect(!outcome.ok && outcome.error.message).not.toContain("secret-key");
  });
});
