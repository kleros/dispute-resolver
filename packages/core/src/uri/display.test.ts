import { describe, expect, it } from "vitest";
import { resolveDisplayUrl } from "./index";
import type { GatewayOrigin } from "./types";
import { AUTHORITY_LESS_HTTPS, CIDV1, DEFAULT_GATEWAY, EXPLICIT_AUTHORITY_HTTPS, HTTPS_SPELLINGS, movesOnAppPages, T2CR_DISPLAY_CID } from "../test/uri/testHelpers";

const GATEWAY: GatewayOrigin = DEFAULT_GATEWAY;
const CID = T2CR_DISPLAY_CID;
const T2CR_ON_GATEWAY = `${DEFAULT_GATEWAY}/ipfs/${CID}/index.html`;

describe("resolveDisplayUrl", () => {
  it("§9.4: a content-addressed display path goes through the gateway", () => {
    expect(resolveDisplayUrl(`/ipfs/${CID}/index.html`, GATEWAY)).toBe(T2CR_ON_GATEWAY);
    expect(resolveDisplayUrl(`ipfs/${CID}/index.html`, GATEWAY)).toBe(T2CR_ON_GATEWAY);
    expect(resolveDisplayUrl(`${CIDV1}/index.html`, "https://ipfs.example.org")).toBe(`https://ipfs.example.org/ipfs/${CIDV1}/index.html`);
  });

  it("D-26: an ipfs:// display goes through the gateway", () => {
    expect(resolveDisplayUrl(`ipfs://${CID}/index.html`, GATEWAY)).toBe(T2CR_ON_GATEWAY);
  });

  it("D-26: the T2CR display resolves to the configured gateway without naming the contract", () => {
    expect(resolveDisplayUrl(`https://ipfs.kleros.io/ipfs/${CID}/index.html`, GATEWAY)).toBe(T2CR_ON_GATEWAY);
  });

  it("D-26: a display path that is not content-addressed is never served from the gateway", () => {
    const inputs = ["/ipns/kleros.io/index.html", `/ipfs/${CID}/../../ipns/evil.eth/index.html`, `/ipfs/${CID}/%2e%2e/%2e%2e/ipns/evil.eth`, "index.html", "./display/index.html"];
    for (const input of inputs) expect(resolveDisplayUrl(input, GATEWAY), input).toBeNull();
  });

  it("B19: an https display on any host is used as is", () => {
    expect(resolveDisplayUrl("https://example.org/display/index.html", GATEWAY)).toBe("https://example.org/display/index.html");
    expect(resolveDisplayUrl("  https://example.org/display/  ", GATEWAY)).toBe("https://example.org/display/");
  });

  it("§9.4: an https display whose path leaves /ipfs/<CID> is not re-served and keeps today's any-host rule", () => {
    const url = `https://example.org/ipfs/${CID}/../../ipns/evil.eth/index.html`;
    expect(resolveDisplayUrl(url, GATEWAY)).toBe(url);
  });

  it("§9.4: a display that is not https renders nothing", () => {
    const inputs = [
      "http://example.org/display/index.html",
      `http://ipfs.kleros.io/ipfs/${CID}/index.html`,
      "//example.org/display/index.html",
      "javascript:alert(1)",
      "data:text/html,<p>x</p>",
      "",
    ];
    for (const input of inputs) expect(resolveDisplayUrl(input, GATEWAY), input).toBeNull();
  });

  it("§9.4: a missing or non-string display renders nothing", () => {
    for (const input of [undefined, null, 42, {}, [`/ipfs/${CID}`]]) expect(resolveDisplayUrl(input, GATEWAY)).toBeNull();
  });

  it("URI-01 §9.4: an https display without an explicit authority renders nothing", () => {
    for (const input of AUTHORITY_LESS_HTTPS) expect(resolveDisplayUrl(input, GATEWAY), input).toBeNull();
  });

  it("URI-01 §9.4: a display URL loads the same document from every page of the app", () => {
    const urls = HTTPS_SPELLINGS.map((input) => resolveDisplayUrl(input, GATEWAY)).filter((url) => url !== null);
    expect(urls).toHaveLength(EXPLICIT_AUTHORITY_HTTPS.length);
    expect(urls.filter(movesOnAppPages)).toEqual([]);
  });
});
