import { maxUint256 } from "viem";
import { describe, expect, it } from "vitest";
import { reservedWithinChoices } from "./index";
import type { RulingOptions } from "./types";

const ANSWERED_TOO_SOON = `0x${"F".repeat(64)}`;
const WITHOUT_RESERVED: RulingOptions = { type: "single-select", titles: ["Yes", "No"], descriptions: { "0x3": "The party withdrew." } };
const OPTIONS: RulingOptions = { ...WITHOUT_RESERVED, reserved: { "0x3": "Withdrawn", "0x04": "Postponed", [ANSWERED_TOO_SOON]: "Answered Too Soon" } };

describe("reservedWithinChoices", () => {
  it("leaves out the reserved answers coded above the dispute's number of choices and counts them", () => {
    expect(reservedWithinChoices(OPTIONS, 3n)).toEqual({ rulingOptions: { ...OPTIONS, reserved: { "0x3": "Withdrawn" } }, hiddenReserved: 2 });
  });

  it("keeps a reserved answer coded exactly at the number of choices, however its code is written", () => {
    expect(reservedWithinChoices(OPTIONS, 4n).rulingOptions.reserved).toEqual({ "0x3": "Withdrawn", "0x04": "Postponed" });
  });

  it("drops the reserved field when no reserved answer fits, keeping the rest of the options", () => {
    expect(reservedWithinChoices(OPTIONS, 2n)).toStrictEqual({ rulingOptions: WITHOUT_RESERVED, hiddenReserved: 3 });
  });

  it("keeps Answered Too Soon when the choices span the whole uint256 range, as a Reality proxy's disputes do", () => {
    expect(reservedWithinChoices(OPTIONS, maxUint256)).toEqual({ rulingOptions: OPTIONS, hiddenReserved: 0 });
  });

  it("shows what the meta-evidence lists when the number of choices is unknown", () => {
    expect(reservedWithinChoices(OPTIONS, null)).toEqual({ rulingOptions: OPTIONS, hiddenReserved: 0 });
  });

  it("returns options without reserved answers as they are", () => {
    const plain: RulingOptions = { type: "multiple-select", titles: ["A", "B"] };
    expect(reservedWithinChoices(plain, 1n)).toEqual({ rulingOptions: plain, hiddenReserved: 0 });
  });
});
