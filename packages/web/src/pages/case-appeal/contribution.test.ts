import { describe, expect, it } from "vitest";
import { parseContribution } from "./contribution";

const ETH = 10n ** 18n;
const NOT_A_NUMBER = { ok: false, message: "Enter the amount as a number, such as 0.5." };
const USE_A_POINT = { ok: false, message: "Use a point (.) for decimals." };
const NOT_ABOVE_ZERO = { ok: false, message: "Enter an amount greater than 0." };
const TOO_MANY_DECIMALS = { ok: false, message: "Amounts have at most 18 decimals." };

describe("parseContribution", () => {
  it("reads the amount in the chain's currency as wei", () => {
    expect(parseContribution("1")).toEqual({ ok: true, wei: ETH });
    expect(parseContribution("0.25")).toEqual({ ok: true, wei: ETH / 4n });
    expect(parseContribution("0.000000000000000001")).toEqual({ ok: true, wei: 1n });
    expect(parseContribution("1000")).toEqual({ ok: true, wei: 1000n * ETH });
  });

  it.each([
    ["0,5", ETH / 2n],
    ["0,125", ETH / 8n],
    ["12,25", 12n * ETH + ETH / 4n],
    ["1,5", (3n * ETH) / 2n],
    ["1,0000", ETH],
    ["0,000000000000000001", 1n],
  ])("a single comma is read as the decimal point: %s", (text, wei) => {
    expect(parseContribution(text)).toEqual({ ok: true, wei });
  });

  it.each(["1,000", "2,500", "12,345", "1.000,5", "1,000.5", "1,2,3", "1,000,000", "1.2.3", "1..5"])(
    "an amount with more than one separator, or a comma that could group thousands, is refused and asks for a point: %s",
    (text) => {
      expect(parseContribution(text)).toEqual(USE_A_POINT);
    },
  );

  it.each(["05", "01", "025", "00", "007.5", "05,5"])("a whole number with a leading zero is refused: %s", (text) => {
    expect(parseContribution(text)).toEqual(NOT_A_NUMBER);
  });

  it("an amount of zero is refused with a message, never sent", () => {
    expect(parseContribution("0")).toEqual(NOT_ABOVE_ZERO);
    expect(parseContribution("0.000")).toEqual(NOT_ABOVE_ZERO);
    expect(parseContribution("0,000")).toEqual(NOT_ABOVE_ZERO);
  });

  it("more than 18 decimals is refused instead of being rounded", () => {
    expect(parseContribution("0.0000000000000000001")).toEqual(TOO_MANY_DECIMALS);
    expect(parseContribution("0,0000000000000000001")).toEqual(TOO_MANY_DECIMALS);
  });

  it("anything that is not a plain decimal is refused", () => {
    for (const text of ["", "-1", "-1,5", "1e3", "abc", " 1", "1 ", ".5", "5.", ",5", "5,", "-"]) {
      expect(parseContribution(text)).toEqual(NOT_A_NUMBER);
    }
  });
});
