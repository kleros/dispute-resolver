import { describe, expect, it } from "vitest";
import { lookupDispute, resolveLocalId } from ".";
import type { ArbitratedBinding, LocalIdResolution } from "./types";
import { fakeClient, GNOSIS, MAINNET, recordedDetection, recordedNode, rpcError } from "../test/disputes/testHelpers";
import type { Recording } from "../test/disputes/testHelpers";

async function bindingOf(recording: Recording, chainId: number, disputeId: bigint): Promise<ArbitratedBinding> {
  const { client } = fakeClient(recordedNode(recording));
  const lookup = await lookupDispute({ chainId, client }, disputeId);
  if (lookup.status !== "found") throw new Error(`dispute ${String(disputeId)} not found`);
  return lookup.binding;
}

describe("resolveLocalId", () => {
  it.each<[string, Recording, number, bigint, LocalIdResolution]>([
    ["an idr-v2 arbitrable resolves externalIDtoLocalID (mainnet 1454 → local 0)", MAINNET, 1, 1454n, { kind: "local-id", value: 0n }],
    ["the idr-legacy proxy resolves externalIDtoLocalID (mainnet 328 → local 51)", MAINNET, 1, 328n, { kind: "local-id", value: 51n }],
    ["an idr-v1 arbitrable resolves externalIDtoLocalID (Gnosis 0 → local 0)", GNOSIS, 100, 0n, { kind: "local-id", value: 0n }],
    ["an Escrow V1 arbitrable resolves disputeIDtoTransactionID (mainnet 878 → transaction 16)", MAINNET, 1, 878n, { kind: "transaction-id", value: 16n }],
  ])("%s, in one call to the arbitrator's arbitrated contract", async (_, recording, chainId, disputeId, expected) => {
    const binding = await bindingOf(recording, chainId, disputeId);
    const family = await recordedDetection(chainId, binding.arbitrated);
    const { client, requests } = fakeClient(recordedNode(recording));
    expect(await resolveLocalId(client, binding, family)).toEqual(expected);
    expect(requests.calls).toHaveLength(1);
    expect(requests.calls[0]?.startsWith(binding.arbitrated)).toBe(true);
  });

  it("a family without a local ID is not-applicable and reads nothing (Proof of Humanity v2, mainnet 1674)", async () => {
    const binding = await bindingOf(MAINNET, 1, 1674n);
    const family = await recordedDetection(1, binding.arbitrated);
    expect(family.capabilities.localId).toBe("none");
    const { client, requests } = fakeClient(recordedNode(MAINNET));
    expect(await resolveLocalId(client, binding, family)).toEqual({ kind: "not-applicable" });
    expect(requests.methods).toEqual([]);
  });

  it("a revert of the local-ID read is unresolved / reverted, with no DisputeCreation re-resolution after it (recorded externalIDtoLocalID(1674) on PoH v2)", async () => {
    const binding = await bindingOf(MAINNET, 1, 1674n);
    const idrFamily = { ...(await recordedDetection(1, "0x99489d7bb33539f3d1a401741e56e8f02b9ae0cf")), arbitrable: binding.arbitrated };
    const { client, requests } = fakeClient(recordedNode(MAINNET));
    expect(await resolveLocalId(client, binding, idrFamily)).toEqual({ kind: "unresolved", reason: "reverted" });
    expect(requests.methods).toEqual(["eth_call"]);
  });

  it("a transport failure of the local-ID read is unresolved / rpc-error, never reverted", async () => {
    const binding = await bindingOf(MAINNET, 1, 1454n);
    const family = await recordedDetection(1, binding.arbitrated);
    const { client } = fakeClient(recordedNode(MAINNET, { failing: { eth_call: rpcError(-32000, "header not found") } }));
    expect(await resolveLocalId(client, binding, family)).toEqual({ kind: "unresolved", reason: "rpc-error" });
  });
});
