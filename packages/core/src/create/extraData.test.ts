import { describe, expect, it } from "vitest";
import { encodeExtraData } from "./index";

describe("encodeExtraData", () => {
  it.each([
    [1n, 3n, `0x${"0".repeat(63)}1${"0".repeat(63)}3`],
    [26n, 511n, `0x${"0".repeat(62)}1a${"0".repeat(61)}1ff`],
  ])("is 0x, then the court ID %s and the vote count %s as 64 lowercase hex digits each", (court, votes, expected) => {
    expect(encodeExtraData(court, votes)).toBe(expected);
  });

  it("encodes the full uint256 range exactly, beyond the safe-integer range", () => {
    const max = 2n ** 256n - 1n;
    expect(encodeExtraData(max, 2n ** 53n + 1n)).toBe(`0x${"f".repeat(64)}${(2n ** 53n + 1n).toString(16).padStart(64, "0")}`);
  });

  it("throws for a value outside uint256 rather than truncating it", () => {
    expect(() => encodeExtraData(-1n, 3n)).toThrow(RangeError);
    expect(() => encodeExtraData(0n, 2n ** 256n)).toThrow(RangeError);
  });
});
