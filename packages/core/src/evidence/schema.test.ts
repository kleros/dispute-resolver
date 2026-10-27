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
  it("the heading is title", () => {
    expect(parsed({ title: "Title", name: "Name", description: "d" }).title).toBe("Title");
  });

  it("the heading is name when title is empty or missing", () => {
    expect(parsed({ title: "", name: "Name", description: "d" }).title).toBe("Name");
    expect(parsed({ name: "Name", description: "d" }).title).toBe("Name");
    expect(parsed({ title: null, name: "Name" }).title).toBe("Name");
  });

  it("an entry with neither title nor name still renders, with an empty heading", () => {
    expect(parsed({ description: "only a description" })).toEqual({ title: "", description: "only a description", attachment: null });
  });

  it("description is kept as plain text, never interpreted", () => {
    const description = "**not markdown** <script>alert(1)</script>\n[link](javascript:alert(1))";
    expect(parsed({ name: "n", description }).description).toBe(description);
  });

  it("a missing description is empty", () => {
    expect(parsed({ name: "n" }).description).toBe("");
  });

  it("fileURI is the attachment, through the gateway", () => {
    expect(parsed({ name: "n", fileURI: `/ipfs/${CID}/capture.mp4` }).attachment).toEqual({
      kind: "link",
      href: `${GATEWAY}/ipfs/${CID}/capture.mp4`,
      label: "capture.mp4",
      attachmentKind: "video",
    });
  });

  it("the legacy evidence key is the attachment when fileURI is missing or empty", () => {
    const expected = { kind: "link", href: `${GATEWAY}/ipfs/${CID}/shot.png`, label: "shot.png", attachmentKind: "image" };
    expect(parsed({ name: "n", evidence: `/ipfs/${CID}/shot.png` }).attachment).toEqual(expected);
    expect(parsed({ name: "n", fileURI: "", evidence: `/ipfs/${CID}/shot.png` }).attachment).toEqual(expected);
  });

  it("fileURI wins over the legacy evidence key, which is then not read", () => {
    expect(parsed({ name: "n", fileURI: `/ipfs/${CID}/a.txt`, evidence: { not: "a string" } }).attachment).toMatchObject({ label: "a.txt", attachmentKind: "text" });
  });

  it("without fileURI or evidence there is no attachment", () => {
    expect(parsed({ name: "n", fileURI: "" }).attachment).toBeNull();
  });

  it("an http attachment is shown as text, never as a link", () => {
    expect(parsed({ name: "n", fileURI: "http://example.org/file.pdf" }).attachment).toEqual({ kind: "text", text: "http://example.org/file.pdf" });
  });

  it("an evidence attachment at http://<host>/ipfs/<CID> links through the gateway", () => {
    expect(parsed({ name: "n", fileURI: `http://ipfs.kleros.io/ipfs/${CID}/file.pdf` }).attachment).toMatchObject({ kind: "link", href: `${GATEWAY}/ipfs/${CID}/file.pdf` });
  });

  it("an https attachment stays a link to its own host", () => {
    expect(parsed({ name: "n", fileURI: "https://example.org/file.pdf" }).attachment).toMatchObject({ kind: "link", href: "https://example.org/file.pdf" });
  });

  it("a javascript: attachment is text, never a link", () => {
    expect(parsed({ name: "n", fileURI: "javascript:alert(1)" }).attachment).toEqual({ kind: "text", text: "javascript:alert(1)" });
  });

  it("a JSON value that is not an object fails the schema", () => {
    for (const value of [null, [], [{ title: "t" }], "text", 5, true]) {
      expect(rejected(value)).toBe("invalid-data");
    }
  });

  it("an object or array heading, description or attachment fails the schema instead of breaking the timeline", () => {
    expect(rejected({ title: { nested: true } })).toBe("invalid-data");
    expect(rejected({ title: "", name: ["a"] })).toBe("invalid-data");
    expect(rejected({ name: "n", description: { text: "d" } })).toBe("invalid-data");
    expect(rejected({ name: "n", fileURI: { uri: "x" } })).toBe("invalid-data");
    expect(rejected({ name: "n", fileURI: 5 })).toBe("invalid-data");
    expect(rejected({ name: "n", evidence: ["x"] })).toBe("invalid-data");
  });

  it("a field the heading rule does not read is not validated", () => {
    expect(parsed({ title: "Title", name: { unused: true } }).title).toBe("Title");
  });

  it("numbers render as their text and booleans as nothing", () => {
    expect(parsed({ title: 42, description: 7 })).toMatchObject({ title: "42", description: "7" });
    expect(parsed({ title: true, description: false })).toMatchObject({ title: "", description: "" });
    expect(parsed({ title: 0, name: "Name" }).title).toBe("Name");
  });
});

describe("buildEvidenceDocument", () => {
  it("the document round-trips through the evidence schema", () => {
    const document = buildEvidenceDocument({ name: "Title", description: "Body", fileUri: `/ipfs/${CID}/a.pdf` });
    expect(parsed(JSON.parse(JSON.stringify(document)))).toMatchObject({ title: "Title", description: "Body", attachment: { kind: "link", label: "a.pdf" } });
  });
});
