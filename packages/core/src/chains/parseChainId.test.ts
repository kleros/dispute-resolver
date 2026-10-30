import { describe, expect, it } from "vitest";
import { CHAINS, parseChainId, parseChainNumber } from "./index";

const CONFIGURED = Object.keys(CHAINS).map(Number);

describe("parseChainId", () => {
  it("accepts the decimal string or the safe-integer number of every configured chain", () => {
    for (const id of CONFIGURED) {
      expect(parseChainId(String(id))).toBe(id);
      expect(parseChainId(id)).toBe(id);
    }
  });

  it.each([
    ["script-closing payload", "1</script>"],
    ["script payload after digits", "1</script><script>alert(1)</script>"],
    ["decimal point", "1.0"],
    ["leading zero", "01"],
    ["double zero", "00"],
    ["leading space", " 1"],
    ["trailing space", "1 "],
    ["trailing newline", "1\n"],
    ["tab", "\t1"],
    ["plus sign", "+1"],
    ["minus sign", "-1"],
    ["hex", "0x1"],
    ["exponent", "1e0"],
    ["empty", ""],
    ["whitespace only", "  "],
    ["unicode digits", "١"],
    ["fullwidth digits", "１"],
    ["legacy path segment", "ongoing"],
    ["legacy path segment", "create"],
    ["legacy path segment", "cases"],
    ["path traversal", "../1"],
    ["Infinity", "Infinity"],
    ["NaN", "NaN"],
    ["prototype key", "constructor"],
    ["prototype key", "__proto__"],
    ["leading zero on a configured id", "0100"],
    ["unsafe integer", "9007199254740993"],
    ["very long digit string", `1${"0".repeat(400)}`],
  ])("rejects a string with %s (%j)", (_label, input) => {
    expect(parseChainId(input)).toBeUndefined();
  });

  it("rejects a string of 100,000 digits", () => {
    expect(parseChainId("9".repeat(100_000))).toBeUndefined();
  });

  it("rejects numbers that are not safe integers", () => {
    for (const input of [1.5, 0.1, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 2 ** 53, 2 ** 53 + 2, -0.5]) {
      expect(parseChainId(input)).toBeUndefined();
    }
  });

  it("rejects values that are neither a number nor a string", () => {
    const hostile: unknown[] = [undefined, null, true, false, 1n, {}, [], ["1"], [1], { toString: () => "1" }, { valueOf: () => 1 }, Symbol("1"), () => 1];
    for (const input of hostile) {
      expect(parseChainId(input)).toBeUndefined();
    }
  });

  it("rejects a well-formed chain ID that is not configured", () => {
    for (const input of [10, "10", 0, "0", 3, 4, 5, "5", 42, 80001, "80001", 999999, "999999"]) {
      expect(parseChainId(input)).toBeUndefined();
    }
  });
});

describe("parseChainNumber", () => {
  it("keeps a positive integer whether or not the chain table has it", () => {
    for (const id of [...CONFIGURED, 10, 690, 5, 80001]) {
      expect(parseChainNumber(id)).toBe(id);
      expect(parseChainNumber(String(id))).toBe(id);
    }
  });

  it("rejects what parseChainId rejects before looking at the chain table", () => {
    const rejected: unknown[] = [
      0,
      "0",
      -1,
      "-1",
      1.5,
      "1.0",
      "01",
      " 1",
      "0x1",
      "1e0",
      2 ** 53,
      "9007199254740993",
      Number.NaN,
      Number.POSITIVE_INFINITY,
      "",
      null,
      true,
      1n,
      {},
      [1],
    ];
    for (const input of rejected) {
      expect(parseChainNumber(input), String(input)).toBeUndefined();
    }
  });
});
