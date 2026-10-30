import { getAnswerString, padToBytes32 } from "@reality.eth/reality-eth-lib/formatters/question.js";
import { describe, expect, it } from "vitest";
import recorded from "./__fixtures__/recorded-rulings.json";
import { REFUSED_RULING_TEXT, decodeRulingCode, encodeAnswer, formatRuling } from "./index";
import type { RulingOptions } from "./types";

const MAX_UINT256 = 2n ** 256n - 1n;
const SELECT_YES_NO: RulingOptions = { type: "single-select", titles: ["Yes", "No"] };
const SELECT_ABC: RulingOptions = { type: "multiple-select", titles: ["A", "B", "C"] };
const OUTCOMES = ["Kept", "Removed"];

interface RecordedDispute {
  readonly chainId: number;
  readonly disputeId: string;
  readonly currentRuling: string;
  readonly rulingOptions?: RulingOptions;
}

function recordedDispute(chainId: number, disputeId: string): RecordedDispute {
  const found = (recorded.disputes as readonly RecordedDispute[]).find((d) => d.chainId === chainId && d.disputeId === disputeId);
  if (found === undefined) throw new Error(`fixture has no dispute ${String(chainId)}/${disputeId}`);
  return found;
}

describe("formatRuling", () => {
  it("ruling 0 reads the refused text, whatever the options", () => {
    expect(REFUSED_RULING_TEXT).toBe("Invalid / Refused to Arbitrate / Tied");
    expect(formatRuling(0n, SELECT_YES_NO, null)).toBe(REFUSED_RULING_TEXT);
    expect(formatRuling(0n, { type: "hash" }, null)).toBe(REFUSED_RULING_TEXT);
    expect(formatRuling(0n, null, OUTCOMES)).toBe(REFUSED_RULING_TEXT);
    expect(formatRuling(0n, { type: "single-select" }, null)).toBe(REFUSED_RULING_TEXT);
  });

  it("a single-select ruling reads its title (ruling − 1 into the titles)", () => {
    expect(formatRuling(1n, SELECT_YES_NO, null)).toBe("Yes");
    expect(formatRuling(2n, SELECT_YES_NO, null)).toBe("No");
  });

  it("Gnosis 0's multiple-select ruling 5 decodes the bitmask 4 to C", () => {
    const dispute = recordedDispute(100, "0");
    expect(formatRuling(BigInt(dispute.currentRuling), dispute.rulingOptions ?? null, null)).toBe("C");
  });

  it("a multiple-select ruling joins its titles as reality-eth-lib does", () => {
    expect(formatRuling(4n, SELECT_ABC, null)).toBe("A / B");
    expect(formatRuling(8n, SELECT_ABC, null)).toBe("A / B / C");
  });

  it("mainnet 1657's max-uint ruling reads reality-eth-lib's answered-too-soon text", () => {
    const dispute = recordedDispute(1, "1657");
    expect(BigInt(dispute.currentRuling)).toBe(MAX_UINT256);
    expect(formatRuling(MAX_UINT256, SELECT_YES_NO, null)).toBe("Answered too soon");
    expect(formatRuling(MAX_UINT256, { type: "uint", precision: 18 }, null)).toBe("Answered too soon");
  });

  it("mainnet 1658's uint ruling is decoded as a number with the question's decimals", () => {
    const dispute = recordedDispute(1, "1658");
    expect(formatRuling(BigInt(dispute.currentRuling), dispute.rulingOptions ?? null, null)).toBe("0.000000004243172404");
  });

  it("a uint ruling without a precision reads with 18 decimals, the precision its answer is encoded with", () => {
    expect(formatRuling(4243172405n, { type: "uint" }, null)).toBe("0.000000004243172404");
    expect(formatRuling(4243172405n, { type: "uint", precision: 0 }, null)).toBe("4243172404");
    expect(formatRuling(151n, { type: "uint", precision: 2 }, null)).toBe("1.5");
  });

  it("int rulings decode reality-eth-lib's two's complement", () => {
    expect(formatRuling(43n, { type: "int" }, null)).toBe("42");
    expect(formatRuling(MAX_UINT256 - 1n, { type: "int" }, null)).toBe("-3");
  });

  it("datetime rulings read as a UTC date", () => {
    expect(formatRuling(1_700_006_400n + 1n, { type: "datetime" }, null)).toBe("2023-11-15");
  });

  it("a hash ruling reads 0x and ruling − 1 as 64 hex digits, as every other type reads ruling − 1", () => {
    expect(formatRuling(0xabcn, { type: "hash" }, null)).toBe(`0x${"0".repeat(61)}abb`);
    expect(formatRuling(1n, { type: "hash" }, null)).toBe(`0x${"0".repeat(64)}`);
  });

  it("the hash ruling 2²⁵⁶ − 1 reads reality-eth-lib's Answered too soon, as for every other type", () => {
    expect(formatRuling(MAX_UINT256, { type: "hash" }, null)).toBe("Answered too soon");
  });

  it("a hash answer reads back as typed: encodeAnswer, then formatRuling and decodeRulingCode", () => {
    for (const value of ["0x0", "0xabc", `0x${"ab".repeat(32)}`, "1234", `0x${"f".repeat(63)}d`]) {
      const encoded = encodeAnswer({ type: "hash", value }, { type: "hash" });
      const typed = `0x${BigInt(value).toString(16).padStart(64, "0")}`;
      expect(encoded.ok && formatRuling(encoded.code, { type: "hash" }, null)).toBe(typed);
      expect(encoded.ok && decodeRulingCode(encoded.code, { type: "hash" }, null)).toBe(typed);
    }
  });

  it("without rulingOptions the fallback outcomes are indexed by ruling − 1", () => {
    expect(formatRuling(1n, null, OUTCOMES)).toBe("Kept");
    expect(formatRuling(2n, null, OUTCOMES)).toBe("Removed");
  });

  it("without rulingOptions a ruling outside the fallback outcomes reads its decimal value", () => {
    expect(formatRuling(3n, null, OUTCOMES)).toBe("3");
    expect(formatRuling(7n, null, null)).toBe("7");
    expect(formatRuling(1n, null, [])).toBe("1");
  });

  it("fallback outcomes are consulted only without rulingOptions", () => {
    expect(formatRuling(1n, { type: "uint", precision: 0 }, OUTCOMES)).toBe("0");
  });

  it("a formatter failure reads the decimal value and never throws", () => {
    expect(formatRuling(3n, SELECT_YES_NO, null)).toBe("3");
    expect(formatRuling(2n ** 256n, { type: "uint" }, null)).toBe((2n ** 256n).toString());
  });

  it("a uint ruling keeps reality-eth-lib's result up to the display cap of 1000 decimals and reads the decimal value beyond it", () => {
    expect(formatRuling(5n, { type: "uint", precision: 80 }, null)).toBe(`0.${"0".repeat(79)}4`);
    expect(formatRuling(5n, { type: "uint", precision: 81 }, null)).toBe(`0.${"0".repeat(80)}4`);
    expect(formatRuling(5n, { type: "uint", precision: 1000 }, null)).toBe(`0.${"0".repeat(999)}4`);
    expect(formatRuling(5n, { type: "uint", precision: 1001 }, null)).toBe("5");
    expect(formatRuling(MAX_UINT256, { type: "uint", precision: 1001 }, null)).toBe("Answered too soon");
    expect(formatRuling(5n, { type: "uint", precision: 1e9 }, null)).toBe("5");
  });

  it("an int or datetime ruling ignores the precision, since its answer is encoded without decimals", () => {
    expect(formatRuling(5n, { type: "int", precision: 1001 }, null)).toBe("4");
    expect(formatRuling(5n, { type: "int", precision: 81 }, null)).toBe("4");
    const timestamp4: unknown = getAnswerString({ type: "datetime" }, padToBytes32("4"));
    expect(formatRuling(5n, { type: "datetime", precision: 1e9 }, null)).toBe(timestamp4);
    expect(formatRuling(5n, { type: "datetime", precision: 2 }, null)).toBe(timestamp4);
  });

  // The poh.eth governor's meta-evidence has `rulingOptions: {}` whenever its dynamic script does not run.
  it("a title-less single-select ruling reads as its decimal value, titles absent or empty, fallback outcomes or not", () => {
    expect(formatRuling(2n, { type: "single-select" }, null)).toBe("2");
    expect(formatRuling(2n, { type: "single-select", titles: [] }, ["Red", "Blue"])).toBe("2");
    expect(formatRuling(1n, { type: "single-select" }, null)).toBe("1");
  });

  it("the reserved answers keep their labels on a title-less single-select", () => {
    expect(formatRuling(MAX_UINT256, { type: "single-select" }, null)).toBe("Answered too soon");
    expect(formatRuling(MAX_UINT256, { type: "single-select", titles: [] }, null)).toBe("Answered too soon");
  });

  it("the library's empty label for the invalid answer on a title-less select reads as the decimal", () => {
    expect(formatRuling(MAX_UINT256 - 1n, { type: "single-select" }, null)).toBe((MAX_UINT256 - 1n).toString());
    expect(formatRuling(MAX_UINT256 - 1n, { type: "single-select", titles: ["A"] }, null)).toBe((MAX_UINT256 - 1n).toString());
  });
});

describe("decodeRulingCode", () => {
  it("a contributed string key reads as its UTF-8 text", () => {
    const code = new TextEncoder().encode("héllo").reduce((value, byte) => (value << 8n) | BigInt(byte), 0n);
    expect(decodeRulingCode(code, { type: "string" }, null)).toBe("héllo");
  });

  it("a contributed string key that is not valid UTF-8 reads with replacement characters", () => {
    expect(decodeRulingCode(0x41ffn, { type: "string" }, null)).toBe("A�");
  });

  it("a contributed hash code reads code − 1 as 64 hex digits, and code 0 the refused text", () => {
    expect(decodeRulingCode(0x1234n, { type: "hash" }, null)).toBe(`0x${"0".repeat(60)}1233`);
    expect(decodeRulingCode(0n, { type: "hash" }, null)).toBe(REFUSED_RULING_TEXT);
  });

  it("other contributed keys read through the ruling formatter", () => {
    expect(decodeRulingCode(43n, { type: "int" }, null)).toBe("42");
    expect(decodeRulingCode(1_700_006_401n, { type: "datetime" }, null)).toBe("2023-11-15");
    expect(decodeRulingCode(0n, { type: "uint" }, null)).toBe(REFUSED_RULING_TEXT);
  });
});

describe("extreme precisions, empty labels and byte-order marks", () => {
  it("a precision beyond the encoder's 80 decimals still formats select labels", () => {
    expect(formatRuling(1n, { type: "single-select", titles: ["A"], precision: 81 }, null)).toBe("A");
    expect(formatRuling(4n, { type: "multiple-select", titles: ["A", "B"], precision: 1e9 }, null)).toBe("A / B");
  });

  it("reserved answers read their text whatever the precision", () => {
    expect(formatRuling(MAX_UINT256, { type: "uint", precision: 81 }, null)).toBe("Answered too soon");
    expect(formatRuling(MAX_UINT256, { type: "int", precision: 1e9 }, null)).toBe("Answered too soon");
    expect(formatRuling(MAX_UINT256, { type: "datetime", precision: 1e9 }, null)).toBe("Answered too soon");
  });

  it("an empty reality-eth-lib label is the ruling text, not a formatter failure", () => {
    expect(formatRuling(1n, { type: "multiple-select", titles: ["A", "B"] }, null)).toBe("");
    expect(formatRuling(1n, { type: "single-select", titles: [""] }, null)).toBe("");
    expect(formatRuling(1n, { type: "multiple-select" }, null)).toBe("");
    expect(formatRuling(5n, { type: "string" }, null)).toBe("");
    expect(formatRuling(5n, { type: "not-a-reality-type" }, null)).toBe("");
  });

  it("a contributed string key keeps a leading U+FEFF", () => {
    const encoded = encodeAnswer({ type: "string", value: "﻿A" }, { type: "string" });
    expect(encoded).toEqual({ ok: true, code: 0xefbbbf41n });
    expect(encoded.ok && decodeRulingCode(encoded.code, { type: "string" }, null)).toBe("﻿A");
    expect(decodeRulingCode(0x41n, { type: "string" }, null)).toBe("A");
  });
});
