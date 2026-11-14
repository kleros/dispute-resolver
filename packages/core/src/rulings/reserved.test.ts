import { maxUint256 } from "viem";
import { describe, expect, it } from "vitest";
import { optionsWithinChoices } from "./index";
import type { RulingOptions } from "./types";

const ANSWERED_TOO_SOON = `0x${"F".repeat(64)}`;
const WITHOUT_RESERVED: RulingOptions = { type: "single-select", titles: ["Yes", "No"], descriptions: { "0x3": "The party withdrew." } };
const OPTIONS: RulingOptions = { ...WITHOUT_RESERVED, reserved: { "0x3": "Withdrawn", "0x04": "Postponed", [ANSWERED_TOO_SOON]: "Answered Too Soon" } };

describe("optionsWithinChoices", () => {
  it("leaves out the reserved answers coded above the dispute's number of choices and counts them", () => {
    expect(optionsWithinChoices(OPTIONS, 3n)).toEqual({ rulingOptions: { ...OPTIONS, reserved: { "0x3": "Withdrawn" } }, hiddenAnswers: 2 });
  });

  it("keeps a reserved answer coded exactly at the number of choices, however its code is written", () => {
    expect(optionsWithinChoices(OPTIONS, 4n).rulingOptions.reserved).toEqual({ "0x3": "Withdrawn", "0x04": "Postponed" });
  });

  it("drops the reserved field when no reserved answer fits, keeping the rest of the options", () => {
    expect(optionsWithinChoices(OPTIONS, 2n)).toStrictEqual({ rulingOptions: WITHOUT_RESERVED, hiddenAnswers: 3 });
  });

  it("keeps Answered Too Soon when the choices span the whole uint256 range, as a Reality proxy's disputes do", () => {
    expect(optionsWithinChoices(OPTIONS, maxUint256)).toEqual({ rulingOptions: OPTIONS, hiddenAnswers: 0 });
  });

  it("shows what the meta-evidence lists when the number of choices is unknown", () => {
    expect(optionsWithinChoices(OPTIONS, null)).toEqual({ rulingOptions: OPTIONS, hiddenAnswers: 0 });
    const many: RulingOptions = { type: "single-select", titles: ["Red", "Green", "Blue"] };
    expect(optionsWithinChoices(many, null)).toEqual({ rulingOptions: many, hiddenAnswers: 0 });
  });

  it("returns options without reserved answers as they are", () => {
    const plain: RulingOptions = { type: "multiple-select", titles: ["A", "B"] };
    expect(optionsWithinChoices(plain, 1n)).toEqual({ rulingOptions: plain, hiddenAnswers: 0 });
  });

  it("leaves out the single-select titles coded past the dispute's number of choices and counts them with the reserved answers past it", () => {
    const options: RulingOptions = { type: "single-select", titles: ["Red", "Green", "Blue", "Black"], descriptions: ["Warm"], reserved: { "0x3": "Withdrawn", "0x9": "Spam" } };
    expect(optionsWithinChoices(options, 3n)).toStrictEqual({
      rulingOptions: { type: "single-select", titles: ["Red", "Green", "Blue"], descriptions: ["Warm"], reserved: { "0x3": "Withdrawn" } },
      hiddenAnswers: 2,
    });
    expect(optionsWithinChoices(options, 0n)).toStrictEqual({ rulingOptions: { type: "single-select", titles: [], descriptions: ["Warm"] }, hiddenAnswers: 6 });
    expect(optionsWithinChoices(options, 9n)).toEqual({ rulingOptions: options, hiddenAnswers: 0 });
  });

  it("hides only the reserved answers past the number of choices of a single select without titles", () => {
    const options: RulingOptions = { type: "single-select", reserved: { "0x2": "Withdrawn", "0x5": "Spam" } };
    expect(optionsWithinChoices(options, 2n)).toStrictEqual({ rulingOptions: { type: "single-select", reserved: { "0x2": "Withdrawn" } }, hiddenAnswers: 1 });
  });

  it("hands back the same options object when every answer fits", () => {
    expect(optionsWithinChoices(OPTIONS, maxUint256).rulingOptions).toBe(OPTIONS);
  });

  it("keeps every multiple-select title, whose combinations the cards and the composer bound instead", () => {
    const options: RulingOptions = { type: "multiple-select", titles: ["Red", "Green", "Blue", "Black"], reserved: { "0x1f": "Spam" } };
    expect(optionsWithinChoices(options, 2n)).toStrictEqual({ rulingOptions: { type: "multiple-select", titles: ["Red", "Green", "Blue", "Black"] }, hiddenAnswers: 1 });
  });
});
