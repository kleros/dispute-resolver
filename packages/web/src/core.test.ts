import { CHAINS, toRegistryAddress } from "@dispute-resolver/core";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { decodeFunctionData, encodeFunctionResult, parseAbi } from "viem";
import { describe, expect, it } from "vitest";
import { useDisputeLookup, useFamily } from "./data";
import { TestDataProvider, createTestDeps, TEST_ARBITRABLE, type RpcHandler } from "./test/data";

const disputesAbi = parseAbi([
  "function disputes(uint256) view returns (uint96 subcourtID, address arbitrated, uint256 numberOfChoices, uint8 period, uint256 lastPeriodChange, uint256 drawsInRound, uint256 commitsInRound, bool ruled)",
]);
const ZERO_WORD = `0x${"0".repeat(64)}`;

/** Mainnet answers: dispute 1650 exists on KlerosLiquid and its arbitrable has no code. */
const mainnet: RpcHandler = ({ method, params }) => {
  if (method === "eth_call") {
    const [call] = params as [{ to: string; data: `0x${string}` }];
    expect(call.to.toLowerCase()).toBe(CHAINS[1]?.klerosLiquid);
    const { args } = decodeFunctionData({ abi: disputesAbi, data: call.data });
    expect(args).toEqual([1650n]);
    return encodeFunctionResult({ abi: disputesAbi, functionName: "disputes", result: [3n, TEST_ARBITRABLE, 2n, 4, 1_700_000_000n, 3n, 0n, true] });
  }
  if (method === "eth_getCode") return "0x";
  if (method === "eth_getStorageAt") return ZERO_WORD;
  throw new Error(`unexpected ${method}`);
};

function Wrapper({ children }: { readonly children?: ReactNode }) {
  return createElement(TestDataProvider, { deps: createTestDeps({ rpc: mainnet }) }, children);
}

describe("workspace wiring", () => {
  it("resolves @dispute-resolver/core from source", () => {
    expect(toRegistryAddress("0x988b3A538b618C7A603e1c11Ab82Cd16dbE28069")).toBe("0x988b3a538b618c7a603e1c11ab82cd16dbe28069");
  });

  it("the data hooks drive core through the test deps' custom-transport client", async () => {
    const { result } = renderHook(
      () => {
        const lookup = useDisputeLookup(1, 1650n);
        const binding = lookup.status === "ready" && lookup.value.status === "found" ? lookup.value.binding : undefined;
        return { lookup, family: useFamily(1, binding?.arbitrated) };
      },
      { wrapper: Wrapper },
    );
    await waitFor(() => {
      expect(result.current.family.status).toBe("ready");
    });
    expect(result.current.lookup).toMatchObject({
      status: "ready",
      value: { status: "found", dispute: { id: 1650n, period: 4, subcourtId: 3n }, binding: { arbitrated: TEST_ARBITRABLE, disputeId: 1650n } },
    });
    expect(result.current.family).toMatchObject({ status: "ready", value: { family: "view-only" } });
  });
});
