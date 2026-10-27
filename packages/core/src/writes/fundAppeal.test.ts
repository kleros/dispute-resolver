import { maxUint256, toFunctionSelector } from "viem";
import { describe, expect, it } from "vitest";
import { SELECTORS } from "../abi";
import type { LocalIdResolution } from "../disputes/types";
import type { FamilyDetection } from "../families/types";
import governor1621 from "./__fixtures__/governor-1621.json";
import { buildEscrowAppealCall, buildFundAppealCall } from "./index";
import { decodedArgs, detectionFor, expectCall, FAMILY_SIGNATURES, selectorOf, testBinding } from "../test/writes/testHelpers";

const ARBITRABLE = "0x135c573503f70dc290b1d60fe2e7f7eb114febd6";
const binding = testBinding({ chainId: 1, disputeId: 505n, arbitrated: ARBITRABLE });
const LOCAL_ID: LocalIdResolution = { kind: "local-id", value: 12n };

function family(signatures: keyof typeof FAMILY_SIGNATURES): FamilyDetection {
  return detectionFor(ARBITRABLE, FAMILY_SIGNATURES[signatures]);
}

describe("buildFundAppealCall", () => {
  it("an IDisputeResolver arbitrable gets fundAppeal(localID, code) paying the contribution", () => {
    const call = expectCall(buildFundAppealCall({ binding, family: family("idr-v2"), localId: LOCAL_ID, ruling: 2n, value: 10n ** 17n }));
    expect(call).toMatchObject({ kind: "fund-appeal", chainId: 1, address: ARBITRABLE, functionName: "fundAppeal", value: 10n ** 17n });
    expect(selectorOf(call)).toBe(SELECTORS["fundAppeal(uint256,uint256)"]);
    expect(decodedArgs(call)).toEqual([12n, 2n]);
  });

  it("a ruling code anywhere in uint256 is sent unchanged (string and hash answers)", () => {
    const call = expectCall(buildFundAppealCall({ binding, family: family("idr-v1"), localId: LOCAL_ID, ruling: maxUint256, value: 1n }));
    expect(decodedArgs(call)).toEqual([12n, maxUint256]);
  });

  it("a ruling code outside uint256 cannot be encoded and is refused", () => {
    for (const ruling of [-1n, maxUint256 + 1n]) {
      expect(buildFundAppealCall({ binding, family: family("idr-v2"), localId: LOCAL_ID, ruling, value: 1n })).toEqual({ ok: false, refusal: "ruling-out-of-range" });
    }
  });

  it("idr-legacy funds through the uint8 fundAppeal the older resolver proxy carries", () => {
    const call = expectCall(buildFundAppealCall({ binding, family: family("idr-legacy-uint8"), localId: LOCAL_ID, ruling: 2n, value: 5n }));
    expect(call).toMatchObject({ kind: "fund-appeal", address: ARBITRABLE, functionName: "fundAppeal", value: 5n });
    expect(selectorOf(call)).toBe(SELECTORS["fundAppeal(uint256,uint8)"]);
    expect(decodedArgs(call)).toEqual([12n, 2]);
  });

  it("the uint8 variant range-checks the ruling (0 to 255)", () => {
    expect(decodedArgs(expectCall(buildFundAppealCall({ binding, family: family("idr-legacy-uint8"), localId: LOCAL_ID, ruling: 255n, value: 1n })))).toEqual([12n, 255]);
    expect(decodedArgs(expectCall(buildFundAppealCall({ binding, family: family("idr-legacy-uint8"), localId: LOCAL_ID, ruling: 0n, value: 1n })))).toEqual([12n, 0]);
    for (const ruling of [256n, -1n, maxUint256]) {
      expect(buildFundAppealCall({ binding, family: family("idr-legacy-uint8"), localId: LOCAL_ID, ruling, value: 1n })).toEqual({ ok: false, refusal: "ruling-out-of-range" });
    }
  });

  it("an idr-legacy contract carrying the IDisputeResolver fundAppeal uses that one", () => {
    const call = expectCall(buildFundAppealCall({ binding, family: family("idr-legacy-uint256"), localId: LOCAL_ID, ruling: 300n, value: 1n }));
    expect(selectorOf(call)).toBe(SELECTORS["fundAppeal(uint256,uint256)"]);
    expect(decodedArgs(call)).toEqual([12n, 300n]);
  });

  it("an idr-legacy contract with no fundAppeal at all is refused", () => {
    const detection = detectionFor(ARBITRABLE, ["externalIDtoLocalID(uint256)", "submitEvidence(uint256,string)"]);
    expect(detection.writeFamily).toBe("idr-legacy");
    expect(buildFundAppealCall({ binding, family: detection, localId: LOCAL_ID, ruling: 1n, value: 1n })).toEqual({ ok: false, refusal: "appeal-unsupported" });
  });

  it("an IDisputeResolver arbitrable without a resolved local ID is refused", () => {
    for (const localId of [{ kind: "unresolved", reason: "reverted" }, { kind: "not-applicable" }, { kind: "transaction-id", value: 1n }] as const) {
      expect(buildFundAppealCall({ binding, family: family("idr-v2"), localId, ruling: 1n, value: 1n })).toEqual({ ok: false, refusal: "local-id-unresolved" });
    }
  });

  it("a governor is funded through fundAppeal(listIndex) with listIndex = ruling − 1 (dispute 1621)", () => {
    const governorBinding = testBinding({ chainId: governor1621.chainId, disputeId: BigInt(governor1621.disputeId), arbitrated: governor1621.arbitrated });
    const governor = detectionFor(governor1621.governor, FAMILY_SIGNATURES.governor, governor1621.chainId);
    const titles = governor1621.submittedLists.map((list) => `List ${list}`);
    expect(titles).toEqual(governor1621.goldenOptions);
    for (const [index, title] of titles.entries()) {
      const ruling = BigInt(index + 1);
      const call = expectCall(buildFundAppealCall({ binding: governorBinding, family: governor, localId: { kind: "not-applicable" }, ruling, value: 3n }));
      expect(call).toMatchObject({ kind: "fund-appeal", chainId: 1, address: governor1621.governor, functionName: "fundAppeal", value: 3n });
      expect(selectorOf(call)).toBe(SELECTORS["fundAppeal(uint256)"]);
      const [listIndex] = decodedArgs(call);
      expect(listIndex).toBe(ruling - 1n);
      expect(`List ${String(governor1621.submittedLists[Number(listIndex)])}`).toBe(title);
    }
  });

  it("a governor ruling of 0 (refuse to arbitrate) names no list and is refused", () => {
    expect(buildFundAppealCall({ binding, family: family("governor"), localId: { kind: "not-applicable" }, ruling: 0n, value: 1n })).toEqual({
      ok: false,
      refusal: "ruling-out-of-range",
    });
    expect(buildFundAppealCall({ binding, family: family("governor"), localId: { kind: "not-applicable" }, ruling: maxUint256 + 2n, value: 1n })).toEqual({
      ok: false,
      refusal: "ruling-out-of-range",
    });
  });

  it("the kleros.eth governor funds through the governor dialect even without evidence support", () => {
    const call = expectCall(buildFundAppealCall({ binding, family: family("governor-no-evidence"), localId: { kind: "not-applicable" }, ruling: 1n, value: 1n }));
    expect(decodedArgs(call)).toEqual([0n]);
  });

  it("families with no funding interface are refused (view-only, escrow pays the cost instead)", () => {
    expect(buildFundAppealCall({ binding, family: family("view-only"), localId: { kind: "not-applicable" }, ruling: 1n, value: 1n })).toEqual({
      ok: false,
      refusal: "appeal-unsupported",
    });
    expect(buildFundAppealCall({ binding, family: family("escrow-v1"), localId: { kind: "transaction-id", value: 1n }, ruling: 1n, value: 1n })).toEqual({
      ok: false,
      refusal: "appeal-unsupported",
    });
  });
});

describe("buildEscrowAppealCall", () => {
  it("an Escrow V1 appeal is appeal(transactionID) paying the appeal cost", () => {
    const call = expectCall(buildEscrowAppealCall({ binding, family: family("escrow-v1"), localId: { kind: "transaction-id", value: 77n }, appealCost: 999n }));
    expect(call).toMatchObject({ kind: "escrow-appeal", chainId: 1, address: ARBITRABLE, functionName: "appeal", value: 999n });
    expect(selectorOf(call)).toBe(toFunctionSelector("appeal(uint256)"));
    expect(decodedArgs(call)).toEqual([77n]);
  });

  it("only Escrow V1 appeals by paying the cost", () => {
    for (const name of ["idr-v2", "governor", "view-only"] as const) {
      expect(buildEscrowAppealCall({ binding, family: family(name), localId: LOCAL_ID, appealCost: 1n })).toEqual({ ok: false, refusal: "appeal-unsupported" });
    }
  });

  it("without its transaction ID an Escrow V1 appeal is refused", () => {
    for (const localId of [
      { kind: "unresolved", reason: "rpc-error" },
      { kind: "local-id", value: 1n },
    ] as const) {
      expect(buildEscrowAppealCall({ binding, family: family("escrow-v1"), localId, appealCost: 1n })).toEqual({ ok: false, refusal: "local-id-unresolved" });
    }
  });
});
