import { afterEach, describe, expect, it } from "vitest";
import { gregorianLocale } from "./calendar";

describe("gregorianLocale", () => {
  it.each([
    ["fa-IR", "fa-IR-u-ca-gregory"],
    ["fa", "fa-u-ca-gregory"],
    ["th-TH", "th-TH-u-ca-gregory"],
    ["th-TH-u-ca-buddhist", "th-TH-u-ca-gregory"],
    ["ar-SA-u-ca-islamic-umalqura-nu-latn", "ar-SA-u-ca-gregory-nu-latn"],
    ["en-US-u-ca-ethiopic", "en-US-u-ca-gregory"],
  ])("keeps the language of %s and sets its calendar to the Gregorian one", (language, expected) => {
    expect(gregorianLocale(language)).toBe(expected);
  });

  it.each(["en-US", "zh-TW", "pt-PT", "en-US-u-ca-gregory"])("leaves %s alone, as its calendar is already the Gregorian one", (language) => {
    expect(gregorianLocale(language)).toBeUndefined();
  });

  it.each(["", "not a language", "en_US", "-u-ca-persian"])("leaves the malformed tag %j to react-aria's own fallback", (language) => {
    expect(gregorianLocale(language)).toBeUndefined();
  });
});

describe("the locale react-aria reads", () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, "language");
  });

  it("follows the browser language, with the Gregorian calendar", () => {
    const readLocale = (): unknown => Reflect.get(window, Symbol.for("react-aria.i18n.locale"));
    expect(readLocale()).toBe(gregorianLocale(navigator.language));
    Object.defineProperty(navigator, "language", { value: "fa-IR", configurable: true });
    expect(readLocale()).toBe("fa-IR-u-ca-gregory");
    Object.defineProperty(navigator, "language", { value: "zh-TW", configurable: true });
    expect(readLocale()).toBeUndefined();
  });
});
