import { describe, expect, it } from "vitest";
import { JSON_DUPLICATE_KEY_GUARD, isRealityScript } from "./guard";

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

describe("JSON_DUPLICATE_KEY_GUARD", () => {
  it("A4: is the text of today's runner bootstrap, byte for byte", async () => {
    // SHA-256 of `JSON_DUPLICATE_KEY_GUARD` in src/ethereum/json-duplicate-key-guard.js at the freeze of the parity documents.
    expect(JSON_DUPLICATE_KEY_GUARD).toHaveLength(1271);
    expect(await sha256(JSON_DUPLICATE_KEY_GUARD)).toBe("f749e16bce8831194dbdf07c3d147afd622cdc75b729b0fb4bb0164d36c6d7dd");
  });

  it("A4: records the rejection where the host reads it", () => {
    expect(JSON_DUPLICATE_KEY_GUARD).toContain("window.__klerosJsonDuplicateKeys = true");
    expect(JSON_DUPLICATE_KEY_GUARD).toContain('throw new SyntaxError("Duplicate keys in JSON document")');
  });
});

describe("isRealityScript", () => {
  it("A4: is true for a script that renders with reality-eth-lib's template population", () => {
    expect(isRealityScript("const json = populatedJSONForTemplate(template, question);")).toBe(true);
  });

  it("A4: is false for any other script", () => {
    expect(isRealityScript("resolveScript({ title: 'x' })")).toBe(false);
    expect(isRealityScript("")).toBe(false);
    expect(isRealityScript("populatedJSONFor")).toBe(false);
  });
});
