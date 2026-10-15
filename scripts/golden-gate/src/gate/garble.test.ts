import { describe, expect, it } from "vitest";
import { hasGarbledText, hasNonAsciiLiteral, keepsRealityDelimiter, looksGarbled } from "./garble";

/** UTF-8 bytes of `text` decoded as windows-1252, as an opaque frame without a charset decodes a script. */
function misdecode(text: string): string {
  return new TextDecoder("windows-1252").decode(new TextEncoder().encode(text));
}

describe("charset-garbled output (04 §5, ADR 0004)", () => {
  it("C6: recognises UTF-8 text read as windows-1252", () => {
    expect(looksGarbled(misdecode("Harris␟Trump"))).toBe(true);
    expect(looksGarbled(misdecode("Sí"))).toBe(true);
    expect(looksGarbled(misdecode("Respondió demasiado pronto"))).toBe(true);
    expect(looksGarbled(misdecode("“quoted”"))).toBe(true);
  });

  it("C6: correctly decoded text is not garbled", () => {
    for (const text of ["Harris", "Sí", "Respondió demasiado pronto", "Answered Too Soon", "€ 5", "naïve café", "List 7", "Harris␟Trump"]) expect(looksGarbled(text)).toBe(false);
  });

  it("C6: a replacement character is garbled", () => {
    expect(looksGarbled("Harris�Trump")).toBe(true);
  });

  it("C6: finds garbled text anywhere in a structured output, keys included", () => {
    expect(hasGarbledText({ rulingOptions: { titles: ["Yes", misdecode("Sí")] } })).toBe(true);
    expect(hasGarbledText({ [misdecode("clé")]: 1 })).toBe(true);
    expect(hasGarbledText({ rulingOptions: { titles: ["Yes", "Sí"] } })).toBe(false);
  });

  it("D-29: an output that still holds the reality-eth-lib delimiter was not split on it", () => {
    expect(keepsRealityDelimiter({ question: "test5555␟misc␟", rulingOptions: { titles: ["No", "Yes"] } })).toBe(true);
    expect(keepsRealityDelimiter({ rulingOptions: { titles: ["No", "Yes␟"] } })).toBe(true);
    expect(keepsRealityDelimiter({ question: "test5555", rulingOptions: { titles: ["No", "Yes"] } })).toBe(false);
  });

  it("ADR 0004: a script with a literal non-ASCII character is charset-sensitive", () => {
    expect(hasNonAsciiLiteral('split("␟")')).toBe(true);
    expect(hasNonAsciiLiteral(String.raw`split("\u241f")`)).toBe(false);
  });
});
