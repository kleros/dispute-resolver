import { describe, expect, it } from "vitest";
import { klerosLiquidAbi } from "../abi";
import type { Address } from "../types";
import { lookupDispute, parseDisputeId } from ".";
import { answer, fakeClient, failure, GNOSIS, MAINNET, recordedNode, SEPOLIA } from "../test/disputes/testHelpers";
import type { Recording } from "../test/disputes/testHelpers";

const MAINNET_ARBITRATOR = MAINNET.arbitrator;
const NONEXISTENT = 1_000_000_000n;
const UINT256_MAX = 2n ** 256n - 1n;

describe("parseDisputeId", () => {
  it("accepts ASCII digits, including dispute 0 and leading zeros", () => {
    expect(parseDisputeId("0")).toBe(0n);
    expect(parseDisputeId("1454")).toBe(1454n);
    expect(parseDisputeId(UINT256_MAX.toString())).toBe(UINT256_MAX);
    expect(parseDisputeId("007")).toBe(7n);
    expect(parseDisputeId("00" + UINT256_MAX.toString())).toBe(UINT256_MAX);
  });

  it("accepts non-negative safe integers and in-range bigints", () => {
    expect(parseDisputeId(0)).toBe(0n);
    expect(parseDisputeId(121)).toBe(121n);
    expect(parseDisputeId(5n)).toBe(5n);
  });

  it.each<[string, unknown]>([
    ["an empty string", ""],
    ["a signed string", "+1"],
    ["a negative string", "-1"],
    ["a string with leading whitespace", " 1"],
    ["a string with trailing whitespace", "1 "],
    ["a decimal string", "1.0"],
    ["an exponent string", "1e3"],
    ["a hex string", "0x10"],
    ["a path injection", "1/../../evil"],
    ["markup", "1</script>"],
    ["non-ASCII digits", "١٢"],
    ["a string above uint256", (UINT256_MAX + 1n).toString()],
    ["a negative number", -1],
    ["a fraction", 1.5],
    ["an unsafe integer", Number.MAX_SAFE_INTEGER + 1],
    ["NaN", Number.NaN],
    ["a negative bigint", -1n],
    ["a bigint above uint256", UINT256_MAX + 1n],
    ["null", null],
    ["undefined", undefined],
    ["an object", { toString: () => "1" }],
  ])("rejects %s", (_, input) => {
    expect(parseDisputeId(input)).toBeNull();
  });
});

describe("lookupDispute", () => {
  it("reads disputes(id) and returns the struct with the arbitrated contract lowercased", async () => {
    const { client } = fakeClient(recordedNode(MAINNET));
    const lookup = await lookupDispute({ chainId: 1, client }, 1454n);
    expect(lookup).toMatchObject({
      status: "found",
      dispute: {
        id: 1454n,
        subcourtId: 8n,
        arbitrated: "0x99489d7bb33539f3d1a401741e56e8f02b9ae0cf",
        numberOfChoices: 2n,
        period: 4,
        lastPeriodChange: 1673835923,
        ruled: true,
      },
    });
  });

  it("the binding's arbitrable comes from the arbitrator's disputes(id).arbitrated", async () => {
    const { client, requests } = fakeClient(recordedNode(MAINNET));
    const lookup = await lookupDispute({ chainId: 1, client }, 328n);
    if (lookup.status !== "found") throw new Error("expected a found dispute");
    expect(lookup.binding).toEqual({ chainId: 1, disputeId: 328n, arbitrator: MAINNET_ARBITRATOR, arbitrated: "0x135c573503f70dc290b1d60fe2e7f7eb114febd6" });
    expect(lookup.binding.arbitrated).toBe(lookup.dispute.arbitrated);
    expect(requests.calls.every((key) => key.startsWith(MAINNET_ARBITRATOR))).toBe(true);
  });

  it("keeps a bad dispute's struct as read, 2^128 - 1 choices (mainnet 150)", async () => {
    const { client } = fakeClient(recordedNode(MAINNET));
    const lookup = await lookupDispute({ chainId: 1, client }, 150n);
    expect(lookup).toMatchObject({ status: "found", dispute: { numberOfChoices: 2n ** 128n - 1n, arbitrated: "0x594ec762b59978c97c82bc36ab493ed8b1f1f368" } });
  });

  it.each<[string, Recording, number]>([
    ["an out-of-range ID that the node reports as -32003 InvalidFEOpcode is not-found (mainnet)", MAINNET, 1],
    ["an out-of-range ID that the node reports as -32000 invalid opcode is not-found (Sepolia)", SEPOLIA, 11155111],
    ["a zeroed struct with no arbitrated contract is not-found (Gnosis keeps disputes in a mapping)", GNOSIS, 100],
  ])("%s", async (_, recording, chainId) => {
    const { client } = fakeClient(recordedNode(recording));
    expect(await lookupDispute({ chainId, client }, NONEXISTENT)).toEqual({ status: "not-found" });
  });

  it("a transport error (-32000 header not found) is unavailable, never not-found", async () => {
    const node = recordedNode(MAINNET, {
      extraCalls: [failure({ to: MAINNET_ARBITRATOR, abi: klerosLiquidAbi, functionName: "disputes", args: [7n], error: { code: -32000, message: "header not found" } })],
    });
    const { client } = fakeClient(node);
    const lookup = await lookupDispute({ chainId: 1, client }, 7n);
    expect(lookup).toMatchObject({ status: "unavailable", error: { code: "rpc-error" } });
  });

  it("a failed fetch (no JSON-RPC answer) is unavailable", async () => {
    const { client } = fakeClient(recordedNode(MAINNET, { failing: { eth_call: new Error("fetch failed") } }));
    const lookup = await lookupDispute({ chainId: 1, client }, 1454n);
    expect(lookup).toMatchObject({ status: "unavailable", error: { code: "rpc-error" } });
  });

  it("a chain without an arbitrator is no-arbitrator, without any read", async () => {
    const { client, requests } = fakeClient(recordedNode(MAINNET));
    expect(await lookupDispute({ chainId: 137, client }, 1n)).toEqual({ status: "no-arbitrator" });
    expect(requests.methods).toEqual([]);
  });

  it("a chain without a read RPC is unavailable with no-rpc", async () => {
    const lookup = await lookupDispute({ chainId: 1, client: undefined }, 1n);
    expect(lookup).toMatchObject({ status: "unavailable", error: { code: "no-rpc", message: "This network's data is unavailable." } });
  });

  it("a period outside 0–4 is invalid data, not a dispute", async () => {
    const arbitrated: Address = "0x99489d7bb33539f3d1a401741e56e8f02b9ae0cf";
    const node = recordedNode(MAINNET, {
      extraCalls: [answer({ to: MAINNET_ARBITRATOR, abi: klerosLiquidAbi, functionName: "disputes", args: [9n], result: [1n, arbitrated, 2n, 5, 1n, 0n, 0n, false] })],
    });
    const { client } = fakeClient(node);
    expect(await lookupDispute({ chainId: 1, client }, 9n)).toMatchObject({ status: "unavailable", error: { code: "invalid-data" } });
  });

  it("an aborted lookup is unavailable, never not-found", async () => {
    const { client } = fakeClient(recordedNode(MAINNET));
    const controller = new AbortController();
    controller.abort();
    expect(await lookupDispute({ chainId: 1, client, signal: controller.signal }, 1454n)).toMatchObject({ status: "unavailable", error: { code: "rpc-error" } });
  });
});
