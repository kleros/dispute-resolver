import { describe, expect, it } from "vitest";
import { JSON_DUPLICATE_KEY_GUARD, isRealityScript } from "./guard";

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

describe("JSON_DUPLICATE_KEY_GUARD", () => {
  it("matches the reviewed bootstrap text byte for byte", async () => {
    // The guard runs next to untrusted scripts: update this hash only after reviewing the new text.
    expect(JSON_DUPLICATE_KEY_GUARD).toHaveLength(1271);
    expect(await sha256(JSON_DUPLICATE_KEY_GUARD)).toBe("f749e16bce8831194dbdf07c3d147afd622cdc75b729b0fb4bb0164d36c6d7dd");
  });

  it("records the rejection in the global the host reads", () => {
    expect(JSON_DUPLICATE_KEY_GUARD).toContain("window.__klerosJsonDuplicateKeys = true");
    expect(JSON_DUPLICATE_KEY_GUARD).toContain('throw new SyntaxError("Duplicate keys in JSON document")');
  });
});

describe("isRealityScript", () => {
  it("detects a script that uses reality-eth-lib's template population", () => {
    expect(isRealityScript("const json = populatedJSONForTemplate(template, question);")).toBe(true);
  });

  it("does not flag any other script", () => {
    expect(isRealityScript("resolveScript({ title: 'x' })")).toBe(false);
    expect(isRealityScript("")).toBe(false);
    expect(isRealityScript("populatedJSONFor")).toBe(false);
  });
});
