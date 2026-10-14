import { REFUSED_RULING_TEXT, encodeAnswer, type AnswerEncodingError } from "@dispute-resolver/core";
import { CalendarDate, CalendarDateTime, ZonedDateTime } from "@internationalized/date";
import { describe, expect, it } from "vitest";
import { ANSWER_ERROR_MESSAGES, fundedIntAnswer, pickedTimestamp } from "./answer";

function intCode(value: string): bigint {
  const encoding = encodeAnswer({ type: "int", value }, { type: "int" });
  if (!encoding.ok) throw new Error(`"${value}" did not encode: ${encoding.error}`);
  return encoding.code;
}

describe("free-input answers (spec §5.12)", () => {
  it("WN-3: every answer-encoding error has its own message", () => {
    const codes: readonly AnswerEncodingError[] = ["empty", "not-a-number", "negative-uint", "out-of-range", "not-hex", "too-long", "malformed"];
    const messages = codes.map((code) => ANSWER_ERROR_MESSAGES[code]);
    expect(messages.every((message) => message.trim().length > 0)).toBe(true);
    expect(new Set(messages).size).toBe(codes.length);
  });

  it("WN-4: an int answer of -1 funds ruling 0, the refuse-to-arbitrate ruling", () => {
    expect(intCode("-1")).toBe(0n);
    expect(fundedIntAnswer(intCode("-1"))).toBe(REFUSED_RULING_TEXT);
  });

  it("WN-4: an int answer of -2 funds 2^256 - 1, Reality's answered-too-soon answer", () => {
    expect(intCode("-2")).toBe((1n << 256n) - 1n);
    expect(fundedIntAnswer(intCode("-2"))).toBe("Answered too soon");
  });

  it("WN-4: other int answers fund themselves, negative ones included", () => {
    expect(fundedIntAnswer(intCode("41"))).toBe("41");
    expect(fundedIntAnswer(intCode("0"))).toBe("0");
    expect(fundedIntAnswer(intCode("-3"))).toBe("-3");
  });

  it("D-17: a picked date keeps its time of day", () => {
    const picked = new ZonedDateTime(2026, 10, 14, "UTC", 0, 15, 45);
    expect(pickedTimestamp(picked)).toBe(Date.UTC(2026, 9, 14, 15, 45) / 1000);
  });

  it("D-17: a picked date in another zone is the same instant", () => {
    const picked = new ZonedDateTime(2026, 10, 14, "Europe/Lisbon", 3_600_000, 16, 45);
    expect(pickedTimestamp(picked)).toBe(Date.UTC(2026, 9, 14, 15, 45) / 1000);
  });

  it("D-17: a date without a zone is read in UTC", () => {
    expect(pickedTimestamp(new CalendarDateTime(2026, 10, 14, 15, 45))).toBe(Date.UTC(2026, 9, 14, 15, 45) / 1000);
    expect(pickedTimestamp(new CalendarDate(2026, 10, 14))).toBe(Date.UTC(2026, 9, 14) / 1000);
  });
});
