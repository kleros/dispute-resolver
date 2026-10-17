import { describe, expect, it } from "vitest";
import { encodeExtraData } from "./index";

describe("encodeExtraData", () => {
  it("§4.5: 0x, then the court ID and the vote count as 64 hex digits each", () => {
    expect(encodeExtraData(1n, 3n)).toBe(`0x${"0".repeat(63)}1${"0".repeat(63)}3`);
  });

  it("§4.5: court 0 with 3 votes, the form's initial selection", () => {
    expect(encodeExtraData(0n, 3n)).toBe(`0x${"0".repeat(64)}${"0".repeat(63)}3`);
  });

  it("§4.5: digits are lowercase hex and the result is 64 bytes", () => {
    const extraData = encodeExtraData(26n, 511n);
    expect(extraData).toBe(`0x${"0".repeat(62)}1a${"0".repeat(61)}1ff`);
    expect(extraData).toHaveLength(2 + 128);
  });

  it("§4.5: the full uint256 range is encoded exactly, without the old parseInt precision loss", () => {
    const max = 2n ** 256n - 1n;
    expect(encodeExtraData(max, 2n ** 53n + 1n)).toBe(`0x${"f".repeat(64)}${(2n ** 53n + 1n).toString(16).padStart(64, "0")}`);
  });

  it("§4.5: a value outside uint256 is a programming error, never a silently truncated court", () => {
    expect(() => encodeExtraData(-1n, 3n)).toThrow(RangeError);
    expect(() => encodeExtraData(0n, 2n ** 256n)).toThrow(RangeError);
  });
});
