import { describe, expect, it } from "vitest";
import { reserveThroughGateway } from "./gateway";
import { gatewayUrl, normalizeIpfsPath, policyFetchUrl, resolveGateway } from "./index";
import type { CanonicalIpfsPath, GatewayOrigin } from "./types";
import { GNOSIS, MAINNET } from "../test/disputes/testHelpers";
import { AUTHORITY_LESS_HTTPS, CIDV1, DEFAULT_GATEWAY, GNOSIS_416_PATH, T2CR_DISPLAY_CID } from "../test/uri/testHelpers";

const GATEWAY: GatewayOrigin = DEFAULT_GATEWAY;
const OTHER_GATEWAY: GatewayOrigin = "https://ipfs.example.org";
const CID = T2CR_DISPLAY_CID;
const T2CR_DISPLAY_URL = `https://ipfs.kleros.io/ipfs/${CID}/index.html`;
const T2CR_ON_GATEWAY = `${DEFAULT_GATEWAY}/ipfs/${CID}/index.html`;

function canonical(input: string): CanonicalIpfsPath {
  const path = normalizeIpfsPath(input);
  if (path === null) throw new Error(`test input is not content-addressed: ${input}`);
  return path;
}

describe("resolveGateway", () => {
  it("defaults to https://cdn.kleros.link", () => {
    expect(resolveGateway({})).toBe(DEFAULT_GATEWAY);
    expect(resolveGateway({ REACT_APP_IPFS_GATEWAY: undefined })).toBe(DEFAULT_GATEWAY);
    expect(resolveGateway({ REACT_APP_IPFS_GATEWAY: "" })).toBe(DEFAULT_GATEWAY);
    expect(resolveGateway({ REACT_APP_IPFS_GATEWAY: "   " })).toBe(DEFAULT_GATEWAY);
  });

  it("uses REACT_APP_IPFS_GATEWAY as an origin, without its trailing slash", () => {
    expect(resolveGateway({ REACT_APP_IPFS_GATEWAY: "https://ipfs.example.org" })).toBe("https://ipfs.example.org");
    expect(resolveGateway({ REACT_APP_IPFS_GATEWAY: "https://ipfs.example.org/" })).toBe("https://ipfs.example.org");
    expect(resolveGateway({ REACT_APP_IPFS_GATEWAY: " https://IPFS.Example.org:8443/ " })).toBe("https://ipfs.example.org:8443");
  });

  it("ignores a configured gateway that is not an https origin", () => {
    const values = [
      "http://ipfs.example.org",
      "ipfs.example.org",
      "//ipfs.example.org",
      "https://ipfs.example.org/ipfs",
      "https://user:secret@ipfs.example.org",
      "https://ipfs.example.org/?x=1",
      "https://ipfs.example.org/#x",
      "javascript:alert(1)",
    ];
    for (const value of values) expect(resolveGateway({ REACT_APP_IPFS_GATEWAY: value }), value).toBe(DEFAULT_GATEWAY);
  });
});

describe("gatewayUrl", () => {
  it("joins the gateway origin and a canonical path", () => {
    expect(gatewayUrl(canonical(CID), GATEWAY)).toBe(`${DEFAULT_GATEWAY}/ipfs/${CID}`);
    expect(gatewayUrl(canonical(`ipfs://${CIDV1}/metaEvidence.json`), OTHER_GATEWAY)).toBe(`https://ipfs.example.org/ipfs/${CIDV1}/metaEvidence.json`);
  });

  it("a gateway URL never resolves outside the CID", () => {
    const tricky = [`/ipfs/${CID}/%252e%252e/%252e%252e/ipns/x`, `/ipfs/${CID}/what%3F/..%23`, `/ipfs/${CID}/a b/c`];
    for (const input of tricky) {
      const url = new URL(gatewayUrl(canonical(input), GATEWAY));
      expect(url.origin, input).toBe(DEFAULT_GATEWAY);
      expect(url.pathname.startsWith(`/ipfs/${CID}/`), input).toBe(true);
      expect(url.search, input).toBe("");
      expect(url.hash, input).toBe("");
    }
  });
});

describe("reserveThroughGateway", () => {
  it("re-serves the T2CR display URL from the configured gateway", () => {
    expect(reserveThroughGateway(T2CR_DISPLAY_URL, GATEWAY)).toBe(T2CR_ON_GATEWAY);
    expect(reserveThroughGateway(T2CR_DISPLAY_URL, OTHER_GATEWAY)).toBe(`https://ipfs.example.org/ipfs/${CID}/index.html`);
  });

  it("refuses the dot-segment variants of the T2CR URL", () => {
    const variants = [
      `https://ipfs.kleros.io/ipfs/${CID}/../../ipns/evil.eth/index.html`,
      `https://ipfs.kleros.io/ipfs/${CID}/%2e%2e/%2e%2e/ipns/evil.eth/index.html`,
      `https://ipfs.kleros.io/ipfs/${CID}/.%2E/.%2E/ipns/evil.eth/index.html`,
      `https://ipfs.kleros.io/ipfs/${CID}\\..\\..\\ipns\\evil.eth\\index.html`,
      `https://ipfs.kleros.io/ipfs/${CID}/%5c..%5c..%5cipns%5cevil.eth`,
      `https://ipfs.kleros.io/ipfs/${CID}/..`,
    ];
    for (const variant of variants) expect(reserveThroughGateway(variant, GATEWAY), variant).toBeNull();
  });

  it("refuses backslashes and control characters even where the URL parser would repair them", () => {
    const inputs = [`https://ipfs.kleros.io/ipfs/${CID}\\index.html`, `https://ipfs.kleros.io/ipfs/\t${CID}/index.html`, `https://ipfs.kleros.io/ipfs/${CID}/index\n.html`];
    for (const input of inputs) expect(reserveThroughGateway(input, GATEWAY), JSON.stringify(input)).toBeNull();
  });

  it("only a path that begins /ipfs/ is re-served, not a bare CID at the root", () => {
    expect(reserveThroughGateway(`https://example.org/${CID}/index.html`, GATEWAY)).toBeNull();
  });

  it("resolves dot segments before looking for /ipfs/<CID>", () => {
    expect(reserveThroughGateway(`https://ipfs.kleros.io/assets/../ipfs/${CID}/index.html`, GATEWAY)).toBe(T2CR_ON_GATEWAY);
    expect(reserveThroughGateway(`https://ipfs.kleros.io/ipfs/${CID}/js/../index.html`, GATEWAY)).toBe(T2CR_ON_GATEWAY);
  });

  it("drops the query and the fragment of the original URL", () => {
    expect(reserveThroughGateway(`${T2CR_DISPLAY_URL}?x=1#y`, GATEWAY)).toBe(T2CR_ON_GATEWAY);
  });

  it("is idempotent on a URL already on the gateway", () => {
    expect(reserveThroughGateway(T2CR_ON_GATEWAY, GATEWAY)).toBe(T2CR_ON_GATEWAY);
    expect(reserveThroughGateway(`${DEFAULT_GATEWAY}${GNOSIS_416_PATH}`, GATEWAY)).toBe(`${DEFAULT_GATEWAY}${GNOSIS_416_PATH}`);
  });

  it("re-serves an http URL whose path is /ipfs/<CID> from the configured gateway", () => {
    const inputs = [`http://ipfs.kleros.io/ipfs/${CID}/index.html`, `HTTP://ipfs.kleros.io/ipfs/${CID}/index.html`, `http://u:p@ipfs.kleros.io:8080/ipfs/${CID}/index.html?x=1#f`];
    for (const input of inputs) expect(reserveThroughGateway(input, GATEWAY), input).toBe(T2CR_ON_GATEWAY);
  });

  it("returns null for anything that is not an http(s) URL with an explicit authority and an /ipfs/<CID> path", () => {
    const inputs = [
      "",
      `/ipfs/${CID}/index.html`,
      CID,
      `ipfs://${CID}/index.html`,
      `http:/ipfs.kleros.io/ipfs/${CID}/index.html`,
      `http:ipfs.kleros.io/ipfs/${CID}`,
      `https:/ipfs.kleros.io/ipfs/${CID}/index.html`,
      "http://example.org/ipfs/not-a-cid/x",
      "http://example.org/ipns/x",
      `http://example.org/ipfs/${CID}/../../ipns/x`,
      `//ipfs.kleros.io/ipfs/${CID}/index.html`,
      "https://example.org/index.html",
      "https://example.org/ipns/kleros.io/index.html",
      "https://example.org/ipfs/not-a-cid/index.html",
      `https://example.org/IPFS/${CID}/index.html`,
      `https://example.org/ipfs/ipfs/${CID}/index.html`,
      `https://example.org/x/ipfs/${CID}/index.html`,
      "javascript:alert(1)",
    ];
    for (const input of inputs) expect(reserveThroughGateway(input, GATEWAY), input).toBeNull();
  });
});

describe("policyFetchUrl", () => {
  it("fetches an https policy URL as is", () => {
    expect(policyFetchUrl("https://example.org/policies/general.json", GATEWAY)).toBe("https://example.org/policies/general.json");
  });

  it("every court policy URI recorded on chains 1 and 100 resolves through the gateway", () => {
    for (const recording of [MAINNET, GNOSIS]) {
      const policies = Object.keys(recording.policies);
      expect(policies.length, `court policies recorded on chain ${String(recording.chainId)}`).toBeGreaterThan(0);
      for (const uri of policies) expect(policyFetchUrl(uri, GATEWAY), `${String(recording.chainId)} ${uri}`).toBe(`${DEFAULT_GATEWAY}${uri}`);
    }
  });

  it("a content-addressed path containing 'http' goes through the gateway", () => {
    expect(policyFetchUrl(`/ipfs/${CID}/http-policy.json`, GATEWAY)).toBe(`${DEFAULT_GATEWAY}/ipfs/${CID}/http-policy.json`);
  });

  it("refuses a policy URI that is neither https nor content-addressed", () => {
    const inputs = ["", "http://example.org/policy.json", "/ipns/kleros.io/policy.json", `/ipfs/${CID}/../../ipns/x`, "javascript:alert(1)", "policy.json"];
    for (const input of inputs) expect(policyFetchUrl(input, GATEWAY), input).toBeNull();
  });

  it("refuses an https policy URI without an explicit authority, which a browser fetches from the app", () => {
    for (const input of AUTHORITY_LESS_HTTPS) expect(policyFetchUrl(input, GATEWAY), input).toBeNull();
  });
});
