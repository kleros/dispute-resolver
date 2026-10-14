import { describe, expect, it } from "vitest";
import { combinationCode, combinationTitle, reservedCode } from "./index";

const ABC = ["A", "B", "C"];
const NINE = ["o0", "o1", "o2", "o3", "o4", "o5", "o6", "o7", "o8"];

describe("combinationTitle", () => {
  it("§5.12: combination 0 reads None", () => {
    expect(combinationTitle(0n, ABC)).toBe("None");
  });

  it("§5.12: a combination reads the titles of its set bits, lowest bit first, joined by a space", () => {
    expect(combinationTitle(1n, ABC)).toBe("A");
    expect(combinationTitle(2n, ABC)).toBe("B");
    expect(combinationTitle(5n, ABC)).toBe("A C");
    expect(combinationTitle(7n, ABC)).toBe("A B C");
  });

  it("§5.12: every combination of three titles has a distinct title", () => {
    const titles = Array.from({ length: 8 }, (_, combination) => combinationTitle(BigInt(combination), ABC));
    expect(titles).toEqual(["None", "A", "B", "A B", "C", "A C", "B C", "A B C"]);
  });

  it("D-33: a combination above four options reads the titles of its set bits", () => {
    expect(combinationTitle(0b100010001n, NINE)).toBe("o0 o4 o8");
  });

  it("§5.12: bits beyond the titles are ignored", () => {
    expect(combinationTitle(0b1001n, ABC)).toBe("A");
  });
});

describe("combinationCode", () => {
  it("§5.12: the code of a combination is its bitmask + 1", () => {
    expect(combinationCode([])).toBe(1n);
    expect(combinationCode([0])).toBe(2n);
    expect(combinationCode([0, 2])).toBe(6n);
    expect(combinationCode([2, 0])).toBe(6n);
  });

  it("D-33: the composer's code for options above four round-trips through the title", () => {
    const code = combinationCode([0, 4, 8]);
    expect(code).toBe(0b100010001n + 1n);
    expect(combinationTitle(code - 1n, NINE)).toBe("o0 o4 o8");
  });

  it("D-33: a repeated index is counted once", () => {
    expect(combinationCode([1, 1])).toBe(3n);
  });

  it("D-33: an index that is not a non-negative integer is rejected", () => {
    expect(() => combinationCode([-1])).toThrow(RangeError);
    expect(() => combinationCode([1.5])).toThrow(RangeError);
    expect(() => combinationCode([Number.NaN])).toThrow(RangeError);
  });
});

describe("reservedCode", () => {
  it("§5.12: a reserved key is its hex value", () => {
    expect(reservedCode(`0x${"F".repeat(64)}`)).toBe(2n ** 256n - 1n);
    expect(reservedCode(`0x${"f".repeat(63)}e`)).toBe(2n ** 256n - 2n);
    expect(reservedCode("0x0a")).toBe(10n);
  });

  it("§5.12: a reserved key that is not hex has no code", () => {
    expect(reservedCode("")).toBeNull();
    expect(reservedCode("0x")).toBeNull();
    expect(reservedCode("12")).toBeNull();
    expect(reservedCode("0xfg")).toBeNull();
    expect(reservedCode(" 0x1")).toBeNull();
    expect(reservedCode("__proto__")).toBeNull();
  });
});
