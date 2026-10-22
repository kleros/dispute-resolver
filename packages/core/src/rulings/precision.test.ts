import { answerToBytes32, getAnswerString, padToBytes32, parseQuestionJSON } from "@reality.eth/reality-eth-lib/formatters/question.js";
import { describe, expect, it } from "vitest";
import { encodeAnswer, formatRuling, parsePrecision, parseRealityDecimals } from "./index";

/** A uint question whose `decimals` is the string "0x12", as reality-eth-lib parses it from the question's JSON. */
const HEX_DECIMALS_QUESTION = parseQuestionJSON('{"title": "How many?", "type": "uint", "decimals": "0x12"}');

describe("parsePrecision", () => {
  it.each([
    [18, 18],
    [0, 0],
    ["6", 6],
    [" 6 ", 6],
    [true, 0],
    ["1e2", 1],
    [2.7, 2],
    [-3, 0],
    [[5], 5],
  ])("reads %j as reality-eth-lib does: %j", (value, expected) => {
    expect(parsePrecision(value)).toBe(expected);
  });

  it.each([undefined, null, false, "", "1_000", "abc", "+0x12", "-0x12", Number.NaN, Number.POSITIVE_INFINITY, {}, Symbol("x")])(
    "drops %s, so the answer is encoded with the default 18 decimals",
    (value) => {
      expect(parsePrecision(value)).toBeUndefined();
    },
  );

  it("the precision a ruling is shown with is the one its answer is encoded with", () => {
    const options = { type: "uint", precision: parsePrecision("1e2") };
    const encoded = encodeAnswer({ type: "uint", value: "2.5" }, options);
    expect(encoded).toEqual({ ok: true, code: 26n });
    expect(formatRuling(26n, options, null)).toBe("2.5");
  });

  it.each([
    ["0x12", 18],
    ["0X12", 18],
    [" 0x12 ", 18],
    ["0x0", 0],
  ])("reads hexadecimal %j as reality-eth-lib's parseInt does: %j", (value, expected) => {
    expect(parsePrecision(value)).toBe(expected);
  });

  it("an answer encodes at a hexadecimal precision as reality-eth-lib encodes it", () => {
    const options = { type: "uint", precision: parsePrecision("0x12") };
    expect(encodeAnswer({ type: "uint", value: "1" }, options)).toEqual({ ok: true, code: 10n ** 18n + 1n });
    for (const value of ["1", "2.5", "0.000000000000000001"]) {
      const libCode = BigInt(answerToBytes32(value, HEX_DECIMALS_QUESTION)) + 1n;
      expect(encodeAnswer({ type: "uint", value }, options)).toEqual({ ok: true, code: libCode });
    }
  });

  it("a ruling displays at a hexadecimal precision as reality-eth-lib displays it", () => {
    const options = { type: "uint", precision: parsePrecision("0x12") };
    expect(formatRuling(10n ** 18n + 1n, options, null)).toBe("1");
    for (const ruling of [10n ** 18n + 1n, 25n * 10n ** 17n + 1n, 2n]) {
      const libLabel: unknown = getAnswerString(HEX_DECIMALS_QUESTION, padToBytes32((ruling - 1n).toString(16)));
      expect(formatRuling(ruling, options, null)).toBe(libLabel);
    }
  });
});

describe("parseRealityDecimals", () => {
  const throwingToString = {
    toString(): string {
      throw new Error("hostile");
    },
  };

  it.each([
    [undefined, 0],
    [null, 0],
    [false, 0],
    ["", 0],
    ["abc", 0],
    [-3, 0],
    ["1_000", 1],
    [18, 18],
    ["0x12", 18],
    [throwingToString, 0],
  ])("reads a Reality.eth question's decimals as reality-eth-lib does, absent as 0: %j is %j", (value, expected) => {
    expect(parseRealityDecimals(value)).toBe(expected);
  });
});
