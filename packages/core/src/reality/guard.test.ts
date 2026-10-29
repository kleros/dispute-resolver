import { describe, expect, it } from "vitest";
import { JSON_DUPLICATE_KEY_GUARD } from "./guard";

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
});
