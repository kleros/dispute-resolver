import { describe, expect, it } from "vitest";
import { lookupDispute, resolveLocalId } from ".";
import type { ArbitratedBinding } from "./types";
import { fakeClient, GNOSIS, MAINNET, recordedDetection, recordedNode, rpcError } from "../test/disputes/testHelpers";
import type { Recording } from "../test/disputes/testHelpers";

async function bindingOf(recording: Recording, chainId: number, disputeId: bigint): Promise<ArbitratedBinding> {
  const { client } = fakeClient(recordedNode(recording));
  const lookup = await lookupDispute({ chainId, client }, disputeId);
  if (lookup.status !== "found") throw new Error(`dispute ${String(disputeId)} not found`);
  return lookup.binding;
}

describe("resolveLocalId", () => {
  it("§5.3 step 2: an idr-v2 arbitrable resolves externalIDtoLocalID (mainnet 1454 → local 0)", async () => {
    const binding = await bindingOf(MAINNET, 1, 1454n);
    const family = await recordedDetection(1, binding.arbitrated);
    const { client, requests } = fakeClient(recordedNode(MAINNET));
    expect(await resolveLocalId(client, binding, family)).toEqual({ kind: "local-id", value: 0n });
    expect(requests.calls).toHaveLength(1);
    expect(requests.calls[0]?.startsWith(binding.arbitrated)).toBe(true);
  });

  it("§5.3 step 2, D-46: the idr-legacy proxy resolves externalIDtoLocalID (mainnet 328 → local 51)", async () => {
    const binding = await bindingOf(MAINNET, 1, 328n);
    const family = await recordedDetection(1, binding.arbitrated);
    expect(family.family).toBe("idr-legacy");
    const { client } = fakeClient(recordedNode(MAINNET));
    expect(await resolveLocalId(client, binding, family)).toEqual({ kind: "local-id", value: 51n });
  });

  it("§5.3 step 2, D-49: an idr-v1 arbitrable resolves externalIDtoLocalID (Gnosis 0 → local 0)", async () => {
    const binding = await bindingOf(GNOSIS, 100, 0n);
    const family = await recordedDetection(100, binding.arbitrated);
    expect(family.family).toBe("idr-v1");
    const { client } = fakeClient(recordedNode(GNOSIS));
    expect(await resolveLocalId(client, binding, family)).toEqual({ kind: "local-id", value: 0n });
  });

  it("§5.3 step 2, §10.2: an Escrow V1 arbitrable resolves disputeIDtoTransactionID (mainnet 878 → transaction 16)", async () => {
    const binding = await bindingOf(MAINNET, 1, 878n);
    const family = await recordedDetection(1, binding.arbitrated);
    expect(family.family).toBe("escrow-v1");
    const { client } = fakeClient(recordedNode(MAINNET));
    expect(await resolveLocalId(client, binding, family)).toEqual({ kind: "transaction-id", value: 16n });
  });

  it("§5.3 step 2: a family without a local ID is not-applicable and reads nothing (Proof of Humanity v2, mainnet 1674)", async () => {
    const binding = await bindingOf(MAINNET, 1, 1674n);
    const family = await recordedDetection(1, binding.arbitrated);
    expect(family.capabilities.localId).toBe("none");
    const { client, requests } = fakeClient(recordedNode(MAINNET));
    expect(await resolveLocalId(client, binding, family)).toEqual({ kind: "not-applicable" });
    expect(requests.methods).toEqual([]);
  });

  it("§11.1: a revert of the local-ID read is unresolved / reverted (recorded externalIDtoLocalID(1674) on PoH v2)", async () => {
    const binding = await bindingOf(MAINNET, 1, 1674n);
    const idrFamily = { ...(await recordedDetection(1, "0x99489d7bb33539f3d1a401741e56e8f02b9ae0cf")), arbitrable: binding.arbitrated };
    const { client } = fakeClient(recordedNode(MAINNET));
    expect(await resolveLocalId(client, binding, idrFamily)).toEqual({ kind: "unresolved", reason: "reverted" });
  });

  it("D-36: a transport failure of the local-ID read is unresolved / rpc-error, never reverted", async () => {
    const binding = await bindingOf(MAINNET, 1, 1454n);
    const family = await recordedDetection(1, binding.arbitrated);
    const { client } = fakeClient(recordedNode(MAINNET, { failing: { eth_call: rpcError(-32000, "header not found") } }));
    expect(await resolveLocalId(client, binding, family)).toEqual({ kind: "unresolved", reason: "rpc-error" });
  });

  it("D-11: no DisputeCreation re-resolution runs after a failed local-ID read", async () => {
    const binding = await bindingOf(MAINNET, 1, 1674n);
    const idrFamily = { ...(await recordedDetection(1, "0x99489d7bb33539f3d1a401741e56e8f02b9ae0cf")), arbitrable: binding.arbitrated };
    const { client, requests } = fakeClient(recordedNode(MAINNET));
    await resolveLocalId(client, binding, idrFamily);
    expect(requests.methods).toEqual(["eth_call"]);
  });
});
