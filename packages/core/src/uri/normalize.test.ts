import { describe, expect, it } from "vitest";
import { isContentAddressed, normalizeIpfsPath, toCidPath } from "./index";
import { ALLOWLIST_ENTRIES, CIDV1, DEFAULT_SCRIPT_CID, GNOSIS_416_PATH, T2CR_DISPLAY_CID, TRAILING_SLASH_ENTRY } from "./testHelpers";

const CID = T2CR_DISPLAY_CID;
const CANONICAL = `/ipfs/${CID}`;
const CANONICAL_FILE = `/ipfs/${CID}/index.html`;

describe("normalizeIpfsPath", () => {
  it("A3: accepts a CIDv0 in every spelling today's check accepts", () => {
    const spellings = [
      CID,
      `/ipfs/${CID}`,
      `ipfs/${CID}`,
      `ipfs://${CID}`,
      `ipfs:${CID}`,
      `ipfs:///${CID}`,
      `ipfs://ipfs/${CID}`,
      `ipfs:/ipfs/${CID}`,
      `fs:${CID}`,
      `fs:/ipfs/${CID}`,
      `fs://ipfs/${CID}`,
      `/${CID}`,
    ];
    for (const spelling of spellings) expect(normalizeIpfsPath(spelling), spelling).toBe(CANONICAL);
  });

  it("A3: accepts a base32 CIDv1", () => {
    expect(normalizeIpfsPath(CIDV1)).toBe(`/ipfs/${CIDV1}`);
    expect(normalizeIpfsPath(`ipfs://${CIDV1}/metaEvidence.json`)).toBe(`/ipfs/${CIDV1}/metaEvidence.json`);
  });

  it("A3: trims surrounding whitespace, as today", () => {
    expect(normalizeIpfsPath(`  ${CANONICAL_FILE}\n`)).toBe(CANONICAL_FILE);
  });

  it("A3: drops the query and the fragment", () => {
    expect(normalizeIpfsPath(`${CID}?filename=evidence.json`)).toBe(CANONICAL);
    expect(normalizeIpfsPath(`${CANONICAL_FILE}#/route`)).toBe(CANONICAL_FILE);
    expect(normalizeIpfsPath(`${CANONICAL_FILE}?a=1#b`)).toBe(CANONICAL_FILE);
  });

  it("A3: rejects non-strings", () => {
    for (const input of [undefined, null, 42, true, {}, [CANONICAL], new URL(`https://cdn.kleros.link${CANONICAL}`)]) {
      expect(normalizeIpfsPath(input)).toBeNull();
    }
  });

  it("A3: rejects mutable pointers, other hosts and other schemes", () => {
    const inputs = [
      "",
      "   ",
      "/ipns/kleros.io",
      `/ipns/${CID}`,
      "ipns://kleros.io",
      `https://cdn.kleros.link${CANONICAL}`,
      `//cdn.kleros.link${CANONICAL}`,
      `dweb:/ipfs/${CID}`,
      `IPFS://${CID}`,
      `/IPFS/${CID}`,
      `/ipfs//${CID}`,
      `//${CID}`,
      `ipfs/ipfs/${CID}`,
    ];
    for (const input of inputs) expect(normalizeIpfsPath(input), input).toBeNull();
  });

  it("A3: requires the whole first segment to be a CIDv0 or a base32 CIDv1", () => {
    const inputs = [
      CID.slice(0, -1),
      `${CID}x`,
      `${CID}.json`,
      `${CID}x/index.html`,
      `Qm${"0".repeat(44)}`,
      `Qm${"O".repeat(44)}`,
      `Qm${"I".repeat(44)}`,
      `Qm${"l".repeat(44)}`,
      `b${"a".repeat(49)}`,
      CIDV1.toUpperCase(),
      `b${"1".repeat(50)}`,
      "metaEvidence.json",
    ];
    for (const input of inputs) expect(normalizeIpfsPath(input), input).toBeNull();
    expect(normalizeIpfsPath(`b${"a".repeat(50)}`)).toBe(`/ipfs/b${"a".repeat(50)}`);
  });

  it("B2: rejects /ipfs/<cid>/../../ipns/x", () => {
    expect(normalizeIpfsPath(`/ipfs/${CID}/../../ipns/x`)).toBeNull();
    expect(normalizeIpfsPath(`ipfs://${CID}/../../ipns/evil.eth/index.html`)).toBeNull();
  });

  it("B2: rejects the percent-encoded dot-segment variants", () => {
    const inputs = [
      `/ipfs/${CID}/%2e%2e/%2e%2e/ipns/x`,
      `/ipfs/${CID}/%2E%2E/%2E%2E/ipns/x`,
      `/ipfs/${CID}/.%2e/.%2e/ipns/x`,
      `/ipfs/${CID}/%2e./%2e./ipns/x`,
      `/ipfs/${CID}/%2e%2e`,
    ];
    for (const input of inputs) expect(normalizeIpfsPath(input), input).toBeNull();
  });

  it("B2: rejects backslashes, raw or percent-encoded", () => {
    const inputs = [
      `/ipfs/${CID}\\..\\..\\ipns\\x`,
      `/ipfs/${CID}/..\\..\\ipns/x`,
      `/ipfs/${CID}/%5c..%5c..%5cipns%5cx`,
      `/ipfs/${CID}/%5C..%5C..%5Cipns%5Cx`,
      `/ipfs/${CID}/file\\name.json`,
      `/ipfs/${CID}/file%5Cname.json`,
    ];
    for (const input of inputs) expect(normalizeIpfsPath(input), input).toBeNull();
  });

  it("B2: rejects control characters, raw or percent-encoded", () => {
    const inputs = [
      `/ipfs/${CID}/.\t./.\t./ipns/x`,
      `/ipfs/${CID}/a\u0000b`,
      `/ipfs/${CID}/a\nb`,
      `/ipfs/${CID}/a\u007fb`,
      `/ipfs/${CID}/a\u0085b`,
      `/ipfs/${CID}/a%00b`,
      `/ipfs/${CID}/.%09./.%09./ipns/x`,
      `/ipfs/${CID}/a%0Ab`,
      `/ipfs/${CID}/a%7Fb`,
      `/ipfs/${CID}/a%C2%85b`,
    ];
    for (const input of inputs) expect(normalizeIpfsPath(input), JSON.stringify(input)).toBeNull();
  });

  it("B2: rejects a backslash or control character anywhere, even in the query or fragment it drops", () => {
    const inputs = [`${CID}?a\\b`, `${CID}#a\\b`, `${CID}?a\u0000b`, `${CANONICAL_FILE}#\u007f`];
    for (const input of inputs) expect(normalizeIpfsPath(input), JSON.stringify(input)).toBeNull();
  });

  it("B2: rejects malformed escapes, ill-formed Unicode and encoded slashes", () => {
    const inputs = [
      `/ipfs/${CID}/%`,
      `/ipfs/${CID}/%zz`,
      `/ipfs/${CID}/%FF`,
      `/ipfs/${CID}/%C0%AF..%C0%AF..%C0%AFipns`,
      `/ipfs/${CID}/a\uD800b`,
      `/ipfs/${CID}%2F..%2F..%2Fipns%2Fx`,
      `/ipfs/${CID}/a%2fb`,
    ];
    for (const input of inputs) expect(normalizeIpfsPath(input), input).toBeNull();
  });

  it("B2: rejects a .. that climbs to or above the CID", () => {
    const inputs = [`/ipfs/${CID}/..`, `/ipfs/${CID}/a/../..`, `/ipfs/${CID}/../${DEFAULT_SCRIPT_CID}/x`, `../${CID}`, `./../${CID}`, `x/../${CID}`];
    for (const input of inputs) expect(normalizeIpfsPath(input), input).toBeNull();
  });

  it("B2: decodes each segment exactly once, so a double-encoded dot segment stays a file name", () => {
    const doubleEncoded = `/ipfs/${CID}/%252e%252e/%252e%252e/ipns/x`;
    expect(normalizeIpfsPath(doubleEncoded)).toBe(doubleEncoded);
  });

  it("D-24: resolves dot segments that stay inside the CID before checking the first segment", () => {
    expect(normalizeIpfsPath(`/ipfs/${CID}/a/./b/../index.html`)).toBe(`/ipfs/${CID}/a/index.html`);
    expect(normalizeIpfsPath(`/ipfs/${CID}/a/%2e%2e/index.html`)).toBe(CANONICAL_FILE);
    expect(normalizeIpfsPath(`/ipfs/${CID}/a//../index.html`)).toBe(`/ipfs/${CID}/a/index.html`);
    expect(normalizeIpfsPath(`./${CID}/index.html`)).toBe(CANONICAL_FILE);
  });

  it("D-24: the first segment after normalization is the CID", () => {
    expect(normalizeIpfsPath(`/ipfs/${CID}/../ipns/x`)).toBeNull();
    expect(normalizeIpfsPath(`/ipfs/%2e/${CID}/index.html`)).toBe(CANONICAL_FILE);
  });

  it("B18: every accepted spelling of one file has one canonical form", () => {
    const spellings = [
      `ipfs://${CID}/index.html`,
      `fs:/ipfs/${CID}/index.html`,
      `/ipfs/${CID}/index.html`,
      `ipfs/${CID}/index.html`,
      `${CID}/index.html`,
      `/ipfs/${CID}//index.html/`,
      `ipfs/${CID}/./index.html`,
      `/ipfs/${CID}/index%2Ehtml`,
    ];
    for (const spelling of spellings) expect(normalizeIpfsPath(spelling), spelling).toBe(CANONICAL_FILE);
  });

  it("B18: removes the trailing slash", () => {
    expect(normalizeIpfsPath(`${CID}/`)).toBe(CANONICAL);
    expect(normalizeIpfsPath(`/ipfs/${CID}/index.html/`)).toBe(CANONICAL_FILE);
  });

  it("B18: stores each segment percent-encoded once, so a gateway URL never double-encodes", () => {
    expect(normalizeIpfsPath(GNOSIS_416_PATH)).toBe(GNOSIS_416_PATH);
    expect(normalizeIpfsPath(`/ipfs/${CID}/my file.pdf`)).toBe(`/ipfs/${CID}/my%20file.pdf`);
    expect(normalizeIpfsPath(`/ipfs/${CID}/what%3F%23.json`)).toBe(`/ipfs/${CID}/what%3F%23.json`);
    expect(normalizeIpfsPath(`/ipfs/${CID}/100%25.json`)).toBe(`/ipfs/${CID}/100%25.json`);
  });

  it("B18: the canonical form is a fixed point", () => {
    const inputs = [
      GNOSIS_416_PATH,
      `ipfs://${CID}/a b/c.json`,
      `/ipfs/${CID}/what%3F%23.json`,
      `/ipfs/${CID}/100%25.json`,
      `/ipfs/${CID}/%252e%252e/x`,
      `fs:/ipfs/${CIDV1}/./a/../b.js`,
      `/ipfs/${CID}/na%C3%AFve.txt`,
    ];
    for (const input of inputs) {
      const once = normalizeIpfsPath(input);
      expect(once, input).not.toBeNull();
      expect(normalizeIpfsPath(once), input).toBe(once);
    }
  });
});

describe("toCidPath", () => {
  it("B18: gives the allowlist form of every listed script, whatever the spelling", () => {
    for (const entry of ALLOWLIST_ENTRIES) {
      for (const spelling of [entry, `/ipfs/${entry}`, `ipfs://${entry}`, `fs:/ipfs/${entry}`]) {
        const path = normalizeIpfsPath(spelling);
        expect(path, spelling).not.toBeNull();
        if (path !== null) expect(toCidPath(path)).toBe(entry);
      }
    }
  });

  it("B18: removes the trailing slash of the Gnosis allowlist entry", () => {
    const path = normalizeIpfsPath(TRAILING_SLASH_ENTRY);
    expect(path).not.toBeNull();
    if (path !== null) expect(toCidPath(path)).toBe(TRAILING_SLASH_ENTRY.slice(0, -1));
  });

  it("B18: a dot-segment or percent-encoded variant of a listed script never yields a listed path", () => {
    const listed = new Set<string>(ALLOWLIST_ENTRIES);
    const variants = [
      `/ipfs/${DEFAULT_SCRIPT_CID}/../../ipns/evil`,
      `/ipfs/${DEFAULT_SCRIPT_CID}/%2e%2e/%2e%2e/ipns/evil`,
      `/ipfs/${DEFAULT_SCRIPT_CID}\\..\\..\\ipns\\evil`,
      `/ipfs/${DEFAULT_SCRIPT_CID}/x/%252e%252e`,
    ];
    for (const variant of variants) {
      const path = normalizeIpfsPath(variant);
      expect(path === null ? null : listed.has(toCidPath(path)), variant).not.toBe(true);
    }
  });
});

describe("isContentAddressed", () => {
  it("A3: is normalizeIpfsPath(x) !== null", () => {
    const inputs: unknown[] = [CID, CIDV1, CANONICAL_FILE, `fs:/ipfs/${CID}`, `/ipfs/${CID}/../../ipns/x`, "/ipns/x", `https://cdn.kleros.link${CANONICAL}`, 42, null];
    for (const input of inputs) expect(isContentAddressed(input), String(input)).toBe(normalizeIpfsPath(input) !== null);
    expect(isContentAddressed(CANONICAL_FILE)).toBe(true);
    expect(isContentAddressed("/ipns/x")).toBe(false);
  });
});
