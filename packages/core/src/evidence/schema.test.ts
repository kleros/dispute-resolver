import { describe, expect, it } from "vitest";
import type { GatewayOrigin } from "../uri/types";
import { buildEvidenceDocument, parseEvidenceDocument } from "./index";

const GATEWAY: GatewayOrigin = "https://cdn.kleros.link";
const CID = "QmPiLHsHHhzfWDaSYWXjaANAJyY2hU9VBPt7Txc94SCTsA";

function parsed(value: unknown) {
  const outcome = parseEvidenceDocument(value, GATEWAY);
  if (!outcome.ok) throw new Error(`expected a valid document, got ${outcome.error.message}`);
  return outcome.value;
}

function rejected(value: unknown) {
  const outcome = parseEvidenceDocument(value, GATEWAY);
  return !outcome.ok && outcome.error.code;
}

describe("parseEvidenceDocument", () => {
  it("§9.3: the heading is title", () => {
    expect(parsed({ title: "Title", name: "Name", description: "d" }).title).toBe("Title");
  });

  it("§9.3: the heading is name when title is empty or missing", () => {
    expect(parsed({ title: "", name: "Name", description: "d" }).title).toBe("Name");
    expect(parsed({ name: "Name", description: "d" }).title).toBe("Name");
    expect(parsed({ title: null, name: "Name" }).title).toBe("Name");
  });

  it("§9.3: an entry with neither title nor name still renders, with an empty heading (parity)", () => {
    expect(parsed({ description: "only a description" })).toEqual({ title: "", description: "only a description", attachment: null });
  });

  it("§9.3: description is kept as plain text, never interpreted", () => {
    const description = "**not markdown** <script>alert(1)</script>\n[link](javascript:alert(1))";
    expect(parsed({ name: "n", description }).description).toBe(description);
  });

  it("§9.3: a missing description is empty", () => {
    expect(parsed({ name: "n" }).description).toBe("");
  });

  it("§9.3: fileURI is the attachment, through the gateway", () => {
    expect(parsed({ name: "n", fileURI: `/ipfs/${CID}/capture.mp4` }).attachment).toEqual({
      kind: "link",
      href: `${GATEWAY}/ipfs/${CID}/capture.mp4`,
      label: "capture.mp4",
      attachmentKind: "video",
    });
  });

  it("§9.3: the legacy evidence key is the attachment when fileURI is missing or empty", () => {
    const expected = { kind: "link", href: `${GATEWAY}/ipfs/${CID}/shot.png`, label: "shot.png", attachmentKind: "image" };
    expect(parsed({ name: "n", evidence: `/ipfs/${CID}/shot.png` }).attachment).toEqual(expected);
    expect(parsed({ name: "n", fileURI: "", evidence: `/ipfs/${CID}/shot.png` }).attachment).toEqual(expected);
  });

  it("§9.3: fileURI wins over the legacy evidence key, which is then not read", () => {
    expect(parsed({ name: "n", fileURI: `/ipfs/${CID}/a.txt`, evidence: { not: "a string" } }).attachment).toMatchObject({ label: "a.txt", attachmentKind: "text" });
  });

  it("§9.3: without fileURI or evidence there is no attachment", () => {
    expect(parsed({ name: "n", fileURI: "" }).attachment).toBeNull();
  });

  it("D-32: an http attachment is shown as text, never as a link", () => {
    expect(parsed({ name: "n", fileURI: "http://example.org/file.pdf" }).attachment).toEqual({ kind: "text", text: "http://example.org/file.pdf" });
  });

  it("B7: an https attachment stays a link to its own host (navigations keep today's rule)", () => {
    expect(parsed({ name: "n", fileURI: "https://example.org/file.pdf" }).attachment).toMatchObject({ kind: "link", href: "https://example.org/file.pdf" });
  });

  it("B7: a javascript: attachment is text, never a link", () => {
    expect(parsed({ name: "n", fileURI: "javascript:alert(1)" }).attachment).toEqual({ kind: "text", text: "javascript:alert(1)" });
  });

  it("A17: a JSON value that is not an object fails the schema", () => {
    for (const value of [null, [], [{ title: "t" }], "text", 5, true]) {
      expect(rejected(value)).toBe("invalid-data");
    }
  });

  it("A17: an object or array heading, description or attachment fails the schema instead of breaking the timeline", () => {
    expect(rejected({ title: { nested: true } })).toBe("invalid-data");
    expect(rejected({ title: "", name: ["a"] })).toBe("invalid-data");
    expect(rejected({ name: "n", description: { text: "d" } })).toBe("invalid-data");
    expect(rejected({ name: "n", fileURI: { uri: "x" } })).toBe("invalid-data");
    expect(rejected({ name: "n", fileURI: 5 })).toBe("invalid-data");
    expect(rejected({ name: "n", evidence: ["x"] })).toBe("invalid-data");
  });

  it("A17: a field the heading rule does not read is not validated (parity: today it renders)", () => {
    expect(parsed({ title: "Title", name: { unused: true } }).title).toBe("Title");
  });

  it("A17: numbers render as their text and booleans as nothing, as today", () => {
    expect(parsed({ title: 42, description: 7 })).toMatchObject({ title: "42", description: "7" });
    expect(parsed({ title: true, description: false })).toMatchObject({ title: "", description: "" });
    expect(parsed({ title: 0, name: "Name" }).title).toBe("Name");
  });
});

describe("buildEvidenceDocument", () => {
  it("§5.14: builds {name, description, fileURI, evidenceSide: 0} with the attachment path", () => {
    expect(buildEvidenceDocument({ name: "Title", description: "Body", fileUri: `/ipfs/${CID}/a.pdf` })).toEqual({
      name: "Title",
      description: "Body",
      fileURI: `/ipfs/${CID}/a.pdf`,
      evidenceSide: 0,
    });
  });

  it("§5.14: without an attachment fileURI is the empty string", () => {
    expect(buildEvidenceDocument({ name: "Title", description: "Body", fileUri: null })).toEqual({ name: "Title", description: "Body", fileURI: "", evidenceSide: 0 });
  });

  it("§5.14: the document round-trips through the evidence schema", () => {
    const document = buildEvidenceDocument({ name: "Title", description: "Body", fileUri: `/ipfs/${CID}/a.pdf` });
    expect(parsed(JSON.parse(JSON.stringify(document)))).toMatchObject({ title: "Title", description: "Body", attachment: { kind: "link", label: "a.pdf" } });
  });
});
