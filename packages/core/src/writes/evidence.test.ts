import { describe, expect, it } from "vitest";
import { SELECTORS } from "../abi";
import type { FamilyDetection } from "../families/types";
import { buildSubmitEvidenceCall } from "./index";
import { decodedArgs, detectionFor, EVIDENCE_CID, expectCall, FAMILY_SIGNATURES, selectorOf, testBinding } from "../test/writes/testHelpers";

const ARBITRABLE = "0x99489d7bb33539f3d1a401741e56e8f02b9ae0cf";
const EVIDENCE = `/ipfs/${EVIDENCE_CID}/evidence.json`;
const binding = testBinding({ chainId: 1, disputeId: 1454n, arbitrated: ARBITRABLE });

function family(signatures: keyof typeof FAMILY_SIGNATURES): FamilyDetection {
  return detectionFor(ARBITRABLE, FAMILY_SIGNATURES[signatures]);
}

describe("buildSubmitEvidenceCall", () => {
  it("an IDisputeResolver arbitrable gets submitEvidence(localID, evidenceURI) with no value", () => {
    const call = expectCall(buildSubmitEvidenceCall({ binding, family: family("idr-v2"), localId: { kind: "local-id", value: 41n }, evidenceUri: EVIDENCE }));
    expect(call).toMatchObject({ kind: "submit-evidence", chainId: 1, address: ARBITRABLE, functionName: "submitEvidence", value: 0n });
    expect(selectorOf(call)).toBe(SELECTORS["submitEvidence(uint256,string)"]);
    expect(decodedArgs(call)).toEqual([41n, EVIDENCE]);
  });

  it("an Escrow V1 arbitrable gets submitEvidence with its transaction ID", () => {
    const call = expectCall(buildSubmitEvidenceCall({ binding, family: family("escrow-v1"), localId: { kind: "transaction-id", value: 7n }, evidenceUri: EVIDENCE }));
    expect(selectorOf(call)).toBe(SELECTORS["submitEvidence(uint256,string)"]);
    expect(decodedArgs(call)).toEqual([7n, EVIDENCE]);
  });

  it("idr-legacy submits evidence with its local ID", () => {
    const call = expectCall(buildSubmitEvidenceCall({ binding, family: family("idr-legacy-uint8"), localId: { kind: "local-id", value: 3n }, evidenceUri: EVIDENCE }));
    expect(decodedArgs(call)).toEqual([3n, EVIDENCE]);
  });

  it("a governor with evidence support gets submitEvidence(evidenceURI) with no value and no local ID", () => {
    const call = expectCall(buildSubmitEvidenceCall({ binding, family: family("governor"), localId: { kind: "not-applicable" }, evidenceUri: EVIDENCE }));
    expect(call).toMatchObject({ kind: "submit-evidence", address: ARBITRABLE, value: 0n });
    expect(selectorOf(call)).toBe(SELECTORS["submitEvidence(string)"]);
    expect(decodedArgs(call)).toEqual([EVIDENCE]);
  });

  it("the kleros.eth governor has no evidence function, so submission is refused", () => {
    expect(buildSubmitEvidenceCall({ binding, family: family("governor-no-evidence"), localId: { kind: "not-applicable" }, evidenceUri: EVIDENCE })).toEqual({
      ok: false,
      refusal: "evidence-unsupported",
    });
  });

  it("a view-only arbitrable refuses evidence as a value, without throwing", () => {
    expect(buildSubmitEvidenceCall({ binding, family: family("view-only"), localId: { kind: "not-applicable" }, evidenceUri: EVIDENCE })).toEqual({
      ok: false,
      refusal: "evidence-unsupported",
    });
  });

  it("without a resolved local dispute ID the call cannot be encoded and is refused", () => {
    for (const localId of [{ kind: "unresolved", reason: "reverted" }, { kind: "unresolved", reason: "rpc-error" }, { kind: "not-applicable" }] as const) {
      expect(buildSubmitEvidenceCall({ binding, family: family("idr-v2"), localId, evidenceUri: EVIDENCE })).toEqual({ ok: false, refusal: "local-id-unresolved" });
    }
  });

  it("a local ID of the other dialect is not used (a transaction ID is not an IDisputeResolver local ID)", () => {
    expect(buildSubmitEvidenceCall({ binding, family: family("idr-v2"), localId: { kind: "transaction-id", value: 1n }, evidenceUri: EVIDENCE })).toEqual({
      ok: false,
      refusal: "local-id-unresolved",
    });
    expect(buildSubmitEvidenceCall({ binding, family: family("escrow-v1"), localId: { kind: "local-id", value: 1n }, evidenceUri: EVIDENCE })).toEqual({
      ok: false,
      refusal: "local-id-unresolved",
    });
  });

  it("an evidence upload result that is not content-addressed never goes on-chain", () => {
    for (const evidenceUri of ["", "https://evil.example/evidence.json", `/ipfs/${EVIDENCE_CID}/../../ipns/x`, "/ipns/example.eth"]) {
      expect(buildSubmitEvidenceCall({ binding, family: family("idr-v2"), localId: { kind: "local-id", value: 1n }, evidenceUri })).toEqual({
        ok: false,
        refusal: "not-content-addressed",
      });
      expect(buildSubmitEvidenceCall({ binding, family: family("governor"), localId: { kind: "not-applicable" }, evidenceUri })).toEqual({
        ok: false,
        refusal: "not-content-addressed",
      });
    }
  });

  it("the evidence URI is written in its canonical form", () => {
    const call = expectCall(
      buildSubmitEvidenceCall({ binding, family: family("governor"), localId: { kind: "not-applicable" }, evidenceUri: `ipfs/${EVIDENCE_CID}/./evidence.json` }),
    );
    expect(decodedArgs(call)).toEqual([EVIDENCE]);
  });

  it("a registered Reality proxy submits through its write family's dialect", () => {
    const detection: FamilyDetection = { ...family("idr-v2"), family: "reality-proxy" };
    const call = expectCall(buildSubmitEvidenceCall({ binding, family: detection, localId: { kind: "local-id", value: 9n }, evidenceUri: EVIDENCE }));
    expect(decodedArgs(call)).toEqual([9n, EVIDENCE]);
  });
});
