import { describe, expect, it } from "vitest";
import { SELECTORS } from "../abi";
import type { ProbeSignature } from "../abi/types";
import type { Hex } from "../types";
import { classifySelectors } from "./index";
import type { Capabilities } from "./types";

function selectorsOf(...signatures: ProbeSignature[]): ReadonlySet<Hex> {
  return new Set(signatures.map((signature) => SELECTORS[signature]));
}

const ESCROW_CAPABILITIES: Capabilities = {
  localId: "disputeIDtoTransactionID",
  evidence: { kind: "local-id" },
  appeal: { kind: "escrow-pay-cost" },
  withdraw: { kind: "none" },
};

const IDR_V2_CAPABILITIES: Capabilities = {
  localId: "externalIDtoLocalID",
  evidence: { kind: "local-id" },
  appeal: { kind: "idr", fundAppeal: "fundAppeal(uint256,uint256)" },
  withdraw: { kind: "idr-v2" },
};

const VIEW_ONLY_CAPABILITIES: Capabilities = {
  localId: "none",
  evidence: { kind: "none" },
  appeal: { kind: "none" },
  withdraw: { kind: "none" },
};

describe("classifySelectors: 06 §1 rows 2 to 7, first match wins", () => {
  it("06 §1 row 2: disputeIDtoTransactionID without externalIDtoLocalID is escrow-v1", () => {
    const result = classifySelectors(selectorsOf("disputeIDtoTransactionID(uint256)", "submitEvidence(uint256,string)"));
    expect(result).toEqual({ family: "escrow-v1", capabilities: ESCROW_CAPABILITIES });
  });

  it("06 §1 row 2: escrow-v1 needs externalIDtoLocalID absent", () => {
    expect(classifySelectors(selectorsOf("disputeIDtoTransactionID(uint256)", "externalIDtoLocalID(uint256)")).family).toBe("idr-legacy");
  });

  it("06 §1 row 2: escrow-v1 is tested before the governor rules", () => {
    const result = classifySelectors(selectorsOf("disputeIDtoTransactionID(uint256)", "submitEvidence(string)", "fundAppeal(uint256)", "getCurrentSessionNumber()"));
    expect(result.family).toBe("escrow-v1");
  });

  it("06 §1 row 3, first rule: submitEvidence(string) without submitEvidence(uint256,string) is a governor with URI-only evidence", () => {
    const result = classifySelectors(selectorsOf("submitEvidence(string)"));
    expect(result).toEqual({
      family: "governor",
      capabilities: { localId: "none", evidence: { kind: "uri-only" }, appeal: { kind: "governor" }, withdraw: { kind: "governor" } },
    });
  });

  it("06 §1 row 3, first rule: submitEvidence(string) next to submitEvidence(uint256,string) is not a governor", () => {
    expect(classifySelectors(selectorsOf("submitEvidence(string)", "submitEvidence(uint256,string)")).family).toBe("view-only");
  });

  it("06 §1 row 3, second rule: fundAppeal(uint256) with getCurrentSessionNumber() is a governor; without submitEvidence(string) it has no evidence", () => {
    const result = classifySelectors(selectorsOf("fundAppeal(uint256)", "getCurrentSessionNumber()"));
    expect(result).toEqual({
      family: "governor",
      capabilities: { localId: "none", evidence: { kind: "none" }, appeal: { kind: "governor" }, withdraw: { kind: "governor" } },
    });
  });

  it("06 §1 row 3, second rule: needs both selectors", () => {
    expect(classifySelectors(selectorsOf("fundAppeal(uint256)")).family).toBe("view-only");
    expect(classifySelectors(selectorsOf("getCurrentSessionNumber()")).family).toBe("view-only");
  });

  it("06 §1 row 3, second rule: a governor carrying both evidence functions keeps URI-only evidence", () => {
    const result = classifySelectors(selectorsOf("fundAppeal(uint256)", "getCurrentSessionNumber()", "submitEvidence(string)", "submitEvidence(uint256,string)"));
    expect(result.family).toBe("governor");
    expect(result.capabilities.evidence).toEqual({ kind: "uri-only" });
  });

  it("06 §1 row 3: the governor rules are tested before the IDisputeResolver rows", () => {
    expect(classifySelectors(selectorsOf("submitEvidence(string)", "getTotalWithdrawableAmount(uint256,address,uint256)")).family).toBe("governor");
  });

  it("06 §1 row 4: the v2 withdraw selector is idr-v2", () => {
    const result = classifySelectors(selectorsOf("getTotalWithdrawableAmount(uint256,address,uint256)", "externalIDtoLocalID(uint256)", "fundAppeal(uint256,uint256)"));
    expect(result).toEqual({ family: "idr-v2", capabilities: IDR_V2_CAPABILITIES });
  });

  it("06 §1 row 4: idr-v2 wins over idr-v1 when both withdraw selectors are present", () => {
    const result = classifySelectors(selectorsOf("getTotalWithdrawableAmount(uint256,address,uint256)", "getTotalWithdrawableAmount(uint256,address,uint256[])"));
    expect(result.family).toBe("idr-v2");
  });

  it("D-49: the v1 withdraw selector is idr-v1 with the v1 withdraw dialect", () => {
    const result = classifySelectors(selectorsOf("getTotalWithdrawableAmount(uint256,address,uint256[])", "externalIDtoLocalID(uint256)"));
    expect(result).toEqual({ family: "idr-v1", capabilities: { ...IDR_V2_CAPABILITIES, withdraw: { kind: "idr-v1" } } });
  });

  it("D-46: externalIDtoLocalID without either withdraw selector is idr-legacy, withdrawals unsupported", () => {
    const result = classifySelectors(selectorsOf("externalIDtoLocalID(uint256)", "fundAppeal(uint256,uint256)"));
    expect(result).toEqual({
      family: "idr-legacy",
      capabilities: { ...IDR_V2_CAPABILITIES, withdraw: { kind: "unsupported" } },
    });
  });

  it("D-46: idr-legacy funds appeals through fundAppeal(uint256,uint8) when that is the selector it carries", () => {
    const result = classifySelectors(selectorsOf("externalIDtoLocalID(uint256)", "fundAppeal(uint256,uint8)"));
    expect(result.capabilities.appeal).toEqual({ kind: "idr", fundAppeal: "fundAppeal(uint256,uint8)" });
  });

  it("D-46: idr-legacy carrying both fundAppeal selectors uses the IDisputeResolver one, fundAppeal(uint256,uint256)", () => {
    const result = classifySelectors(selectorsOf("externalIDtoLocalID(uint256)", "fundAppeal(uint256,uint8)", "fundAppeal(uint256,uint256)"));
    expect(result.capabilities.appeal).toEqual({ kind: "idr", fundAppeal: "fundAppeal(uint256,uint256)" });
  });

  it("D-46: idr-legacy without any fundAppeal selector has no appeal funding", () => {
    const result = classifySelectors(selectorsOf("externalIDtoLocalID(uint256)"));
    expect(result.family).toBe("idr-legacy");
    expect(result.capabilities.appeal).toEqual({ kind: "none" });
  });

  it("06 §1 row 7: no probe selector is view-only", () => {
    expect(classifySelectors(new Set())).toEqual({ family: "view-only", capabilities: VIEW_ONLY_CAPABILITIES });
    expect(classifySelectors(new Set<Hex>(["0xdeadbeef", "0xffffffff"]))).toEqual({ family: "view-only", capabilities: VIEW_ONLY_CAPABILITIES });
  });

  it("06 §1 row 7: evidence and appeal selectors alone do not make a contract writable", () => {
    expect(classifySelectors(selectorsOf("submitEvidence(uint256,string)", "fundAppeal(uint256,uint256)")).family).toBe("view-only");
  });

  it("D-47: the governor dialect funds and withdraws through the governor interface and has no local dispute ID", () => {
    const { capabilities } = classifySelectors(selectorsOf("submitEvidence(string)", "fundAppeal(uint256)", "getCurrentSessionNumber()"));
    expect(capabilities.appeal).toEqual({ kind: "governor" });
    expect(capabilities.withdraw).toEqual({ kind: "governor" });
    expect(capabilities.localId).toBe("none");
  });

  it("D-47: view-only has no funding interface and no withdraw panel", () => {
    const { capabilities } = classifySelectors(new Set());
    expect(capabilities.appeal).toEqual({ kind: "none" });
    expect(capabilities.withdraw).toEqual({ kind: "none" });
  });
});
