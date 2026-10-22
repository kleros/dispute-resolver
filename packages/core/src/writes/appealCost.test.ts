import { encodeFunctionData, encodeFunctionResult } from "viem";
import { describe, expect, it } from "vitest";
import { klerosLiquidAbi } from "../abi";
import { type CallAnswer, callKey, fakeClient, rpcError } from "../test/create/testHelpers";
import { testBinding } from "../test/writes/testHelpers";
import { readAppealCost } from "./index";

const ARBITRATOR = "0x9c1da9a04925bdfdedf0f6421bc7eea8305f9002";
const binding = testBinding({ chainId: 100, disputeId: 2_345n, arbitrated: "0x135c573503f70dc290b1d60fe2e7f7eb114febd6", arbitrator: ARBITRATOR });

function appealCostCall(answer: CallAnswer): Map<string, CallAnswer> {
  const data = encodeFunctionData({ abi: klerosLiquidAbi, functionName: "appealCost", args: [binding.disputeId, "0x"] });
  return new Map([[callKey(ARBITRATOR, data), answer]]);
}

describe("readAppealCost", () => {
  it("reads appealCost(dispute, 0x) from the arbitrator the binding names", async () => {
    const result = encodeFunctionResult({ abi: klerosLiquidAbi, functionName: "appealCost", result: 123_456_789n });
    const { client, requested } = fakeClient(appealCostCall({ result }));
    await expect(readAppealCost({ client }, binding)).resolves.toEqual({ ok: true, value: 123_456_789n });
    expect(requested).toHaveLength(1);
  });

  it("a failed read is a failed Outcome, never a throw", async () => {
    const reverted = fakeClient(appealCostCall({ error: rpcError(3, "execution reverted") }));
    await expect(readAppealCost({ client: reverted.client }, binding)).resolves.toMatchObject({ ok: false, error: { code: "reverted" } });
    const down = fakeClient(appealCostCall({ error: new Error("socket hang up") }));
    await expect(readAppealCost({ client: down.client }, binding)).resolves.toMatchObject({ ok: false, error: { code: "rpc-error" } });
  });

  it("without a read client the cost is unavailable", async () => {
    await expect(readAppealCost({ client: undefined }, binding)).resolves.toEqual({ ok: false, error: { code: "no-rpc", message: "The appeal cost could not be read." } });
  });
});
