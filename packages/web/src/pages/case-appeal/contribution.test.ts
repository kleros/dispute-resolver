import { describe, expect, it } from "vitest";
import { parseContribution } from "./contribution";

const ETH = 10n ** 18n;

describe("parseContribution (spec §5.12 fund action)", () => {
  it("§5.12: reads the amount in the chain's currency as wei", () => {
    expect(parseContribution("1")).toEqual({ ok: true, wei: ETH });
    expect(parseContribution("0.25")).toEqual({ ok: true, wei: ETH / 4n });
    expect(parseContribution("0.000000000000000001")).toEqual({ ok: true, wei: 1n });
  });

  it("D-14: an amount of zero is refused with a message, never sent", () => {
    expect(parseContribution("0")).toEqual({ ok: false, message: "Enter an amount greater than 0." });
    expect(parseContribution("0.000")).toEqual({ ok: false, message: "Enter an amount greater than 0." });
  });

  it("D-14: more than 18 decimals is refused instead of being rounded", () => {
    expect(parseContribution("0.0000000000000000001")).toEqual({ ok: false, message: "Amounts have at most 18 decimals." });
  });

  it("D-14: anything that is not a plain decimal is refused", () => {
    for (const text of ["", "-1", "1e3", "abc", "1,5", " 1"]) {
      expect(parseContribution(text)).toEqual({ ok: false, message: "Enter the amount as a number, such as 0.5." });
    }
  });
});
