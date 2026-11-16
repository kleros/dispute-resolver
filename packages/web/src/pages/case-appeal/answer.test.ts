import { REFUSED_RULING_TEXT, encodeAnswer } from "@dispute-resolver/core";
import { CalendarDate, CalendarDateTime, JapaneseCalendar, ZonedDateTime } from "@internationalized/date";
import { describe, expect, it } from "vitest";
import { fundedIntAnswer, pickedTimestamp } from "./answer";

/** 2026-01-02T00:00:00Z. */
const JANUARY_2_2026 = 1_767_312_000;
const HOUR_MS = 3_600_000;

function intCode(value: string): bigint {
  const encoding = encodeAnswer({ type: "int", value }, { type: "int" });
  if (!encoding.ok) throw new Error(`"${value}" did not encode: ${encoding.error}`);
  return encoding.code;
}

describe("free-input answers", () => {
  it("an int answer of -1 funds ruling 0, the refuse-to-arbitrate ruling", () => {
    expect(intCode("-1")).toBe(0n);
    expect(fundedIntAnswer(intCode("-1"))).toBe(REFUSED_RULING_TEXT);
  });

  it("an int answer of -2 funds 2^256 - 1, Reality's answered-too-soon answer", () => {
    expect(intCode("-2")).toBe((1n << 256n) - 1n);
    expect(fundedIntAnswer(intCode("-2"))).toBe("Answered too soon");
  });

  it("other int answers fund themselves, negative ones included", () => {
    expect(fundedIntAnswer(intCode("41"))).toBe("41");
    expect(fundedIntAnswer(intCode("0"))).toBe("0");
    expect(fundedIntAnswer(intCode("-3"))).toBe("-3");
  });

  it("a picked date is funded as midnight UTC of its calendar date, whatever time of day it carries", () => {
    expect(pickedTimestamp(new ZonedDateTime(2026, 1, 2, "UTC", 0, 15, 45))).toBe(JANUARY_2_2026);
    expect(pickedTimestamp(new CalendarDateTime(2026, 1, 2, 23, 59))).toBe(JANUARY_2_2026);
    expect(pickedTimestamp(new CalendarDate(2026, 1, 2))).toBe(JANUARY_2_2026);
    expect(pickedTimestamp(new CalendarDate(new JapaneseCalendar(), "reiwa", 8, 1, 2))).toBe(JANUARY_2_2026);
  });

  it("a date picked in a zone east or west of UTC is funded as that same calendar date, not the day before or after", () => {
    expect(pickedTimestamp(new ZonedDateTime(2026, 1, 2, "Asia/Tokyo", 9 * HOUR_MS))).toBe(JANUARY_2_2026);
    expect(pickedTimestamp(new ZonedDateTime(2026, 1, 2, "America/Los_Angeles", -8 * HOUR_MS, 23, 30))).toBe(JANUARY_2_2026);
  });

  it("every funded date is a whole number of days after 1970", () => {
    const picked = [
      new ZonedDateTime(2026, 10, 14, "Europe/Lisbon", HOUR_MS, 16, 45),
      new ZonedDateTime(2024, 2, 29, "Pacific/Kiritimati", 14 * HOUR_MS, 0, 30),
      new CalendarDateTime(2030, 6, 30, 12, 0, 1),
    ];
    for (const value of picked) expect(pickedTimestamp(value) % 86_400).toBe(0);
  });
});
