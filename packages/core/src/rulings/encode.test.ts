import { describe, expect, it } from "vitest";
import { decodeRulingCode, encodeAnswer, formatRuling } from "./index";
import type { AnswerEncoding, AnswerInput, RulingOptions } from "./types";

const MAX_UINT256 = 2n ** 256n - 1n;
const MAX_INT = 2n ** 255n - 1n;
const UINT: RulingOptions = { type: "uint" };
const UINT_0: RulingOptions = { type: "uint", precision: 0 };
const UINT_2: RulingOptions = { type: "uint", precision: 2 };
const INT: RulingOptions = { type: "int" };
const STRING: RulingOptions = { type: "string" };
const DATETIME: RulingOptions = { type: "datetime" };
const HASH: RulingOptions = { type: "hash" };

function ok(code: bigint): AnswerEncoding {
  return { ok: true, code };
}

function failed(error: Extract<AnswerEncoding, { ok: false }>["error"]): AnswerEncoding {
  return { ok: false, error };
}

function uint(value: string, options: RulingOptions = UINT): AnswerEncoding {
  return encodeAnswer({ type: "uint", value }, options);
}

function int(value: string): AnswerEncoding {
  return encodeAnswer({ type: "int", value }, INT);
}

function text(value: string): AnswerEncoding {
  return encodeAnswer({ type: "string", value }, STRING);
}

function hash(value: string): AnswerEncoding {
  return encodeAnswer({ type: "hash", value }, HASH);
}

function datetime(timestamp: number): AnswerEncoding {
  return encodeAnswer({ type: "datetime", timestamp }, DATETIME);
}

describe("encodeAnswer: uint", () => {
  it("a uint answer is encoded with the question's decimals, plus 1", () => {
    expect(uint("1.5", UINT_2)).toEqual(ok(151n));
    expect(uint("3", UINT_2)).toEqual(ok(301n));
    expect(uint("0", UINT_2)).toEqual(ok(1n));
  });

  it("a uint answer defaults to 18 decimals when the question has no precision", () => {
    expect(uint("1")).toEqual(ok(10n ** 18n + 1n));
    expect(uint("0.5")).toEqual(ok(5n * 10n ** 17n + 1n));
  });

  it("precision 0 is respected, not replaced by 18", () => {
    expect(uint("5", UINT_0)).toEqual(ok(6n));
    expect(uint("4243172404", UINT_0)).toEqual(ok(4243172405n));
  });

  it("a uint answer encodes to what the ruling formatter reads back", () => {
    const encoded = uint("12.34", UINT_2);
    expect(encoded.ok && formatRuling(encoded.code, UINT_2, null)).toBe("12.34");
  });

  it("a uint answer without a precision reads back as typed", () => {
    for (const value of ["1", "0.5", "12.34"]) {
      const encoded = uint(value);
      expect(encoded.ok && formatRuling(encoded.code, UINT, null)).toBe(value);
    }
  });

  it("a uint answer at precision 0 reads back as typed", () => {
    for (const value of ["5", "4243172404"]) {
      const encoded = uint(value, UINT_0);
      expect(encoded.ok && formatRuling(encoded.code, UINT_0, null)).toBe(value);
    }
  });

  it("more fractional digits than the precision allows is out of range", () => {
    expect(uint("1.555", UINT_2)).toEqual(failed("out-of-range"));
    expect(uint("1.5", UINT_0)).toEqual(failed("out-of-range"));
    expect(uint("1.50", { type: "uint", precision: 1 })).toEqual(ok(16n));
    expect(uint("1.0", UINT_0)).toEqual(ok(2n));
  });

  it("a uint whose code does not fit in uint256 is out of range", () => {
    expect(uint((MAX_UINT256 - 1n).toString(), UINT_0)).toEqual(ok(MAX_UINT256));
    expect(uint(MAX_UINT256.toString(), UINT_0)).toEqual(failed("out-of-range"));
    expect(uint(MAX_UINT256.toString())).toEqual(failed("out-of-range"));
  });

  it("bad uint input returns an error code", () => {
    expect(uint("")).toEqual(failed("empty"));
    expect(uint("-3")).toEqual(failed("negative-uint"));
    expect(uint("-0.5")).toEqual(failed("negative-uint"));
    expect(uint("abc")).toEqual(failed("not-a-number"));
    expect(uint("1e3")).toEqual(failed("not-a-number"));
    expect(uint("0x10")).toEqual(failed("not-a-number"));
    expect(uint(" 5")).toEqual(failed("not-a-number"));
  });
});

describe("encodeAnswer: int", () => {
  it("a non-negative int answer is encoded as value + 1", () => {
    expect(int("0")).toEqual(ok(1n));
    expect(int("41")).toEqual(ok(42n));
  });

  it("an int answer carries no decimals, even when the options have a precision, and reads back as typed", () => {
    expect(encodeAnswer({ type: "int", value: "5" }, { type: "int", precision: 18 })).toEqual(ok(6n));
    expect(formatRuling(6n, { type: "int", precision: 18 }, null)).toBe("5");
  });

  it("a negative int answer is encoded in two's complement, plus 1, modulo 2²⁵⁶", () => {
    expect(int("-3")).toEqual(ok(MAX_UINT256 - 1n));
    expect(int("-2")).toEqual(ok(MAX_UINT256));
    expect(int("-1")).toEqual(ok(0n));
  });

  it("the int range is reality-eth-lib's ±(2²⁵⁶ − 1) / 2", () => {
    expect(int(MAX_INT.toString())).toEqual(ok(MAX_INT + 1n));
    expect(int((-MAX_INT).toString())).toEqual(ok(2n ** 255n + 2n));
    expect(int((MAX_INT + 1n).toString())).toEqual(failed("out-of-range"));
    expect(int((-MAX_INT - 1n).toString())).toEqual(failed("out-of-range"));
  });

  it("a negative int answer encodes to what the ruling formatter reads back", () => {
    const encoded = int("-1234");
    expect(encoded.ok && formatRuling(encoded.code, INT, null)).toBe("-1234");
  });

  it("bad int input returns an error code", () => {
    expect(int("")).toEqual(failed("empty"));
    expect(int("1.5")).toEqual(failed("not-a-number"));
    expect(int("--1")).toEqual(failed("not-a-number"));
    expect(int("ten")).toEqual(failed("not-a-number"));
    for (const value of ["1e20", "1e3", "0x10", " 5", "5 ", "+5"]) expect(int(value)).toEqual(failed("not-a-number"));
  });

  it("leading zeros read as the same integer", () => {
    expect(int("007")).toEqual(ok(8n));
    expect(int("-0")).toEqual(ok(1n));
  });
});

describe("encodeAnswer: string", () => {
  it("a string answer is its UTF-8 bytes as an unsigned integer, with no +1", () => {
    expect(text("abc")).toEqual(ok(0x616263n));
    expect(text("é")).toEqual(ok(0xc3a9n));
  });

  it("a string answer round-trips through the contributed-key title", () => {
    const encoded = text("Paris, France");
    expect(encoded.ok && decodeRulingCode(encoded.code, STRING, null)).toBe("Paris, France");
  });

  it("a string answer longer than 32 UTF-8 bytes is too long", () => {
    expect(text("a".repeat(32))).toEqual(ok(BigInt(`0x${"61".repeat(32)}`)));
    expect(text("a".repeat(33))).toEqual(failed("too-long"));
    expect(text("é".repeat(17))).toEqual(failed("too-long"));
  });

  it("an empty string answer returns an error code", () => {
    expect(text("")).toEqual(failed("empty"));
  });
});

describe("encodeAnswer: datetime", () => {
  it("the chosen timestamp is encoded with its time of day, plus 1", () => {
    expect(datetime(1_700_000_000)).toEqual(ok(1_700_000_001n));
    expect(datetime(0)).toEqual(ok(1n));
  });

  it("a datetime answer reads back as its date whatever the precision", () => {
    for (const options of [DATETIME, { type: "datetime", precision: 2 }, { type: "datetime", precision: 18 }]) {
      const encoded = encodeAnswer({ type: "datetime", timestamp: 1_700_006_400 }, options);
      expect(encoded).toEqual(ok(1_700_006_401n));
      expect(encoded.ok && formatRuling(encoded.code, options, null)).toBe("2023-11-15");
    }
  });

  it("a timestamp that is not a non-negative integer returns an error code", () => {
    expect(datetime(1.5)).toEqual(failed("not-a-number"));
    expect(datetime(Number.NaN)).toEqual(failed("not-a-number"));
    expect(datetime(Number.POSITIVE_INFINITY)).toEqual(failed("not-a-number"));
    expect(datetime(-1)).toEqual(failed("out-of-range"));
  });
});

describe("encodeAnswer: hash", () => {
  it("a hash answer is encoded as its value + 1", () => {
    const value = `0x${"ab".repeat(32)}`;
    expect(hash(value)).toEqual(ok(BigInt(value) + 1n));
    expect(hash("0xABC")).toEqual(ok(0xabcn + 1n));
    expect(hash("0x0")).toEqual(ok(1n));
  });

  it("a hash answer that BigInt cannot read returns an error code", () => {
    expect(hash("")).toEqual(failed("empty"));
    expect(hash("abc")).toEqual(failed("not-hex"));
    expect(hash("0x")).toEqual(failed("not-hex"));
    expect(hash("0xzz")).toEqual(failed("not-hex"));
  });

  it("a hash answer whose code does not fit in uint256 is out of range", () => {
    expect(hash(`0x${"1".repeat(65)}`)).toEqual(failed("out-of-range"));
    expect(hash(`0x${"f".repeat(64)}`)).toEqual(failed("out-of-range"));
  });
});

describe("encodeAnswer: robustness", () => {
  it("hostile input never throws", () => {
    const inputs: AnswerInput[] = [
      { type: "uint", value: "9".repeat(5000) },
      { type: "uint", value: "1." + "1".repeat(5000) },
      { type: "int", value: "-" + "9".repeat(5000) },
      { type: "string", value: "\u0000".repeat(64) },
      { type: "hash", value: "0x" + "f".repeat(5000) },
      { type: "datetime", timestamp: Number.MAX_VALUE },
    ];
    for (const input of inputs) {
      expect(() => encodeAnswer(input, { type: input.type, precision: 1e9 })).not.toThrow();
      expect(() => encodeAnswer(input, { type: input.type, precision: -4 })).not.toThrow();
    }
  });

  it("a hostile precision falls back to reality-eth-lib's reading of the decimals", () => {
    expect(uint("5", { type: "uint", precision: -4 })).toEqual(ok(6n));
    expect(uint("5", { type: "uint", precision: 2.7 })).toEqual(ok(501n));
    expect(uint("5", { type: "uint", precision: 81 })).toEqual(failed("out-of-range"));
  });
});

describe("encodeAnswer: edge cases", () => {
  it("a string with an isolated surrogate is malformed, not the replacement character's ruling", () => {
    expect(text(String.fromCharCode(0xd800))).toEqual(failed("malformed"));
    expect(text(`a${String.fromCharCode(0xdc00)}`)).toEqual(failed("malformed"));
    expect(text(`${String.fromCharCode(0xdc00)}${String.fromCharCode(0xd800)}`)).toEqual(failed("malformed"));
    expect(text("�")).toEqual(ok(15712189n));
    expect(text("\u{1F600}")).toEqual(ok(0xf09f9880n));
  });

  it("uint decimals without an integer or fractional part encode as reality-eth-lib does", () => {
    expect(uint(".5", UINT_2)).toEqual(ok(51n));
    expect(uint("1.", UINT_2)).toEqual(ok(101n));
    expect(uint("1.", UINT_0)).toEqual(ok(2n));
    expect(uint(".50", UINT_2)).toEqual(ok(51n));
    expect(uint(".5", UINT_0)).toEqual(failed("out-of-range"));
    expect(uint("-.5", UINT_2)).toEqual(failed("negative-uint"));
    expect(uint("-1.", UINT_2)).toEqual(failed("negative-uint"));
    expect(uint(".0", UINT_2)).toEqual(ok(1n));
    expect(uint(".00", UINT_0)).toEqual(ok(1n));
    expect(uint(".", UINT_2)).toEqual(failed("not-a-number"));
    expect(uint("-.", UINT_2)).toEqual(failed("not-a-number"));
  });

  it("a hash answer is BigInt(value) + 1, so every BigInt form is accepted", () => {
    expect(hash("1234")).toEqual(ok(1235n));
    expect(hash("0o17")).toEqual(ok(16n));
    expect(hash("0b11")).toEqual(ok(4n));
    expect(hash(" 0x10 ")).toEqual(ok(17n));
    expect(hash("   ")).toEqual(ok(1n));
    expect(hash(`0x${"0".repeat(70)}1`)).toEqual(ok(2n));
  });

  it("a hash answer outside uint256 or in a form BigInt rejects returns an error code", () => {
    expect(hash("-5")).toEqual(failed("out-of-range"));
    expect(hash(MAX_UINT256.toString())).toEqual(failed("out-of-range"));
    expect(hash((MAX_UINT256 + 1n).toString())).toEqual(failed("out-of-range"));
    expect(hash("-0x5")).toEqual(failed("not-hex"));
    expect(hash("1.5")).toEqual(failed("not-hex"));
  });
});
