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
/** A card whose funding is still open: its deadline is a second away. */
const OPEN = { deadline: 1_000, nowSeconds: 999 } as const;

function family(signatures: keyof typeof FAMILY_SIGNATURES): FamilyDetection {
  return detectionFor(ARBITRABLE, FAMILY_SIGNATURES[signatures]);
}

describe("buildFundAppealCall", () => {
  it("an IDisputeResolver arbitrable gets fundAppeal(localID, code) paying the contribution", () => {
    const call = expectCall(buildFundAppealCall({ ...OPEN, binding, family: family("idr-v2"), localId: LOCAL_ID, ruling: 2n, value: 10n ** 17n }));
    expect(call).toMatchObject({ kind: "fund-appeal", chainId: 1, address: ARBITRABLE, functionName: "fundAppeal", value: 10n ** 17n });
    expect(selectorOf(call)).toBe(SELECTORS["fundAppeal(uint256,uint256)"]);
    expect(decodedArgs(call)).toEqual([12n, 2n]);
  });

  it("a ruling code anywhere in uint256 is sent unchanged (string and hash answers)", () => {
    const call = expectCall(buildFundAppealCall({ ...OPEN, binding, family: family("idr-v1"), localId: LOCAL_ID, ruling: maxUint256, value: 1n }));
    expect(decodedArgs(call)).toEqual([12n, maxUint256]);
  });

  it("a ruling code outside uint256 cannot be encoded and is refused", () => {
    for (const ruling of [-1n, maxUint256 + 1n]) {
      expect(buildFundAppealCall({ ...OPEN, binding, family: family("idr-v2"), localId: LOCAL_ID, ruling, value: 1n })).toEqual({ ok: false, refusal: "ruling-out-of-range" });
    }
  });

  it("refuses appeal funding on idr-legacy, whichever fundAppeal it carries", () => {
    for (const name of ["idr-legacy-uint8", "idr-legacy-uint256"] as const) {
      expect(family(name).writeFamily).toBe("idr-legacy");
      expect(buildFundAppealCall({ ...OPEN, binding, family: family(name), localId: LOCAL_ID, ruling: 1n, value: 1n })).toEqual({ ok: false, refusal: "appeal-unsupported" });
    }
  });

  it("refuses a contribution at or after the card's deadline, as the contracts check strictly", () => {
    for (const nowSeconds of [1_000, 1_001]) {
      expect(buildFundAppealCall({ binding, family: family("idr-v2"), localId: LOCAL_ID, ruling: 2n, value: 1n, deadline: 1_000, nowSeconds })).toEqual({
        ok: false,
        refusal: "funding-closed",
      });
    }
    expect(buildFundAppealCall({ binding, family: family("governor"), localId: { kind: "not-applicable" }, ruling: 1n, value: 1n, deadline: 1_000, nowSeconds: 1_000 })).toEqual({
      ok: false,
      refusal: "funding-closed",
    });
  });

  it("an IDisputeResolver arbitrable without a resolved local ID is refused", () => {
    for (const localId of [{ kind: "unresolved", reason: "reverted" }, { kind: "not-applicable" }, { kind: "transaction-id", value: 1n }] as const) {
      expect(buildFundAppealCall({ ...OPEN, binding, family: family("idr-v2"), localId, ruling: 1n, value: 1n })).toEqual({ ok: false, refusal: "local-id-unresolved" });
    }
  });

  it("a governor is funded through fundAppeal(listIndex) with listIndex = ruling − 1 (dispute 1621)", () => {
    const governorBinding = testBinding({ chainId: governor1621.chainId, disputeId: BigInt(governor1621.disputeId), arbitrated: governor1621.arbitrated });
    const governor = detectionFor(governor1621.governor, FAMILY_SIGNATURES.governor, governor1621.chainId);
    const titles = governor1621.submittedLists.map((list) => `List ${list}`);
    expect(titles).toEqual(governor1621.goldenOptions);
    for (const [index, title] of titles.entries()) {
      const ruling = BigInt(index + 1);
      const call = expectCall(buildFundAppealCall({ ...OPEN, binding: governorBinding, family: governor, localId: { kind: "not-applicable" }, ruling, value: 3n }));
      expect(call).toMatchObject({ kind: "fund-appeal", chainId: 1, address: governor1621.governor, functionName: "fundAppeal", value: 3n });
      expect(selectorOf(call)).toBe(SELECTORS["fundAppeal(uint256)"]);
      const [listIndex] = decodedArgs(call);
      expect(listIndex).toBe(ruling - 1n);
      expect(`List ${String(governor1621.submittedLists[Number(listIndex)])}`).toBe(title);
    }
  });

  it("a governor ruling of 0 (refuse to arbitrate) names no list and is refused", () => {
    expect(buildFundAppealCall({ ...OPEN, binding, family: family("governor"), localId: { kind: "not-applicable" }, ruling: 0n, value: 1n })).toEqual({
      ok: false,
      refusal: "ruling-out-of-range",
    });
    expect(buildFundAppealCall({ ...OPEN, binding, family: family("governor"), localId: { kind: "not-applicable" }, ruling: maxUint256 + 2n, value: 1n })).toEqual({
      ok: false,
      refusal: "ruling-out-of-range",
    });
  });

  it("the kleros.eth governor funds through the governor dialect even without evidence support", () => {
    const call = expectCall(buildFundAppealCall({ ...OPEN, binding, family: family("governor-no-evidence"), localId: { kind: "not-applicable" }, ruling: 1n, value: 1n }));
    expect(decodedArgs(call)).toEqual([0n]);
  });

  it("families with no funding interface are refused (view-only, escrow pays the cost instead)", () => {
    expect(buildFundAppealCall({ ...OPEN, binding, family: family("view-only"), localId: { kind: "not-applicable" }, ruling: 1n, value: 1n })).toEqual({
      ok: false,
      refusal: "appeal-unsupported",
    });
    expect(buildFundAppealCall({ ...OPEN, binding, family: family("escrow-v1"), localId: { kind: "transaction-id", value: 1n }, ruling: 1n, value: 1n })).toEqual({
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
