import { describe, expect, it } from "vitest";
import { getOverride, getRealityProxy, isDisplayAllowlisted, isScriptAllowed, registryKey } from "./lookups";
import { REGISTRY } from "./registry";
import { UNSLASHED_CHECKSUMMED } from "../test/registry/testHelpers";
import { toRegistryAddress } from "./address";

const MAINNET_REALITY_SCRIPT = "QmWWsDmvjhR9UVRgkcG75vAKzfK3vB85EkZzudnaxwfAWr/bundle.js";
const DEFAULT_SCRIPT = REGISTRY.defaultScriptCid;
const SEPOLIA_ONLY_SCRIPT = "QmP7AfDnaKmrgsbyvWUvmqhmBFdAkp1d9JYCmGFQzCdgfx";
const GNOSIS_DIRECTORY_SCRIPT = "QmRnwMuc7kGipQkjzPY9jhcttRhebPRYwEvBVGTjmkMwe9";
const ETHEREUM_SEER = toRegistryAddress("0x2018038203aEE8e7a29dABd73771b0355D4F85ad");
const POH_V2_MAINNET = toRegistryAddress("0xbE9834097A4E97689d9B667441acafb456D0480A");

describe("registryKey", () => {
  it("joins the arbitrator chain and the lowercase arbitrable", () => {
    expect(registryKey(1, toRegistryAddress("0xE0E1BC8C6CD1B81993E2FCFB80832D814886EA38"))).toBe("1:0xe0e1bc8c6cd1b81993e2fcfb80832d814886ea38");
  });
});

describe("getRealityProxy", () => {
  it("finds a registered proxy by arbitrator chain and address", () => {
    const entry = getRealityProxy(REGISTRY, 1, ETHEREUM_SEER);
    expect(entry?.proxy).toBe(ETHEREUM_SEER);
    expect(entry?.kind).toBe("single-chain");
    expect(entry?.realityChainId).toBe(1);
  });

  it("a cross-chain proxy reports its home chain", () => {
    const entry = getRealityProxy(REGISTRY, 1, toRegistryAddress("0xfe0eb5fc686f929eb26d541d75bb59f816c0aa68"));
    expect(entry?.kind).toBe("cross-chain");
    expect(entry?.realityChainId).toBe(100);
  });

  it("the same address on another arbitrator chain is not registered", () => {
    expect(getRealityProxy(REGISTRY, 100, ETHEREUM_SEER)).toBeUndefined();
  });

  it("an unregistered address is not found", () => {
    expect(getRealityProxy(REGISTRY, 1, toRegistryAddress("0x0000000000000000000000000000000000000001"))).toBeUndefined();
  });
});

describe("getOverride", () => {
  it("Unslashed on mainnet has the override", () => {
    const override = getOverride(REGISTRY, 1, toRegistryAddress("0xe0e1bc8c6cd1b81993e2fcfb80832d814886ea38"));
    expect(override?.roundIndexOffset).toBe(1);
    expect(override?.refuseToArbitrateFundable).toBe(false);
  });

  it("the override is keyed by chain, so the same address elsewhere has none", () => {
    expect(getOverride(REGISTRY, 100, toRegistryAddress(UNSLASHED_CHECKSUMMED))).toBeUndefined();
  });

  it("an ordinary arbitrable has no override", () => {
    expect(getOverride(REGISTRY, 1, ETHEREUM_SEER)).toBeUndefined();
  });
});

describe("isScriptAllowed", () => {
  it("accepts a listed script in every common IPFS URI form", () => {
    for (const uri of [DEFAULT_SCRIPT, `/ipfs/${DEFAULT_SCRIPT}`, `ipfs://${DEFAULT_SCRIPT}`, `fs://${DEFAULT_SCRIPT}`, `ipfs/${DEFAULT_SCRIPT}`]) {
      expect(isScriptAllowed(REGISTRY, 1, uri), uri).toBe(true);
    }
  });

  it("accepts a listed script that lives inside a directory", () => {
    expect(isScriptAllowed(REGISTRY, 1, MAINNET_REALITY_SCRIPT)).toBe(true);
    expect(isScriptAllowed(REGISTRY, 1, `ipfs://${MAINNET_REALITY_SCRIPT}`)).toBe(true);
  });

  it("only accepts a script for the chain it is listed under", () => {
    expect(isScriptAllowed(REGISTRY, 11155111, SEPOLIA_ONLY_SCRIPT)).toBe(true);
    expect(isScriptAllowed(REGISTRY, 1, SEPOLIA_ONLY_SCRIPT)).toBe(false);
    expect(isScriptAllowed(REGISTRY, 137, DEFAULT_SCRIPT)).toBe(false);
  });

  it("a chain without a list rejects every script", () => {
    expect(isScriptAllowed(REGISTRY, 42161, DEFAULT_SCRIPT)).toBe(false);
    expect(isScriptAllowed(REGISTRY, 999999, DEFAULT_SCRIPT)).toBe(false);
  });

  it("rejects a script that is not listed, and any other path inside a listed CID", () => {
    expect(isScriptAllowed(REGISTRY, 1, `/ipfs/${DEFAULT_SCRIPT}/other.js`)).toBe(false);
    expect(isScriptAllowed(REGISTRY, 1, `/ipfs/${MAINNET_REALITY_SCRIPT.split("/")[0] ?? ""}`)).toBe(false);
    expect(isScriptAllowed(REGISTRY, 1, `/ipfs/${MAINNET_REALITY_SCRIPT}/extra`)).toBe(false);
  });

  it("a trailing slash on a directory-style entry is the same path (the Gnosis Moderate script)", () => {
    expect(isScriptAllowed(REGISTRY, 100, GNOSIS_DIRECTORY_SCRIPT)).toBe(true);
    expect(isScriptAllowed(REGISTRY, 100, `/ipfs/${GNOSIS_DIRECTORY_SCRIPT}/`)).toBe(true);
    expect(isScriptAllowed(REGISTRY, 100, `/ipfs/${GNOSIS_DIRECTORY_SCRIPT}/index.js`)).toBe(false);
  });

  it("rejects anything that is not an IPFS path", () => {
    expect(isScriptAllowed(REGISTRY, 1, "https://example.com/script.js")).toBe(false);
    expect(isScriptAllowed(REGISTRY, 1, `https://cdn.kleros.link/ipfs/${DEFAULT_SCRIPT}`)).toBe(false);
    expect(isScriptAllowed(REGISTRY, 1, `/ipns/${DEFAULT_SCRIPT}`)).toBe(false);
    expect(isScriptAllowed(REGISTRY, 1, "")).toBe(false);
  });
});

describe("isDisplayAllowlisted", () => {
  it("a member of the list under the key is allowlisted", () => {
    expect(isDisplayAllowlisted(REGISTRY, 1, POH_V2_MAINNET)).toBe(true);
    expect(isDisplayAllowlisted(REGISTRY, 1, ETHEREUM_SEER)).toBe(true);
  });

  it("the same address under another key is not allowlisted", () => {
    expect(isDisplayAllowlisted(REGISTRY, 100, POH_V2_MAINNET)).toBe(false);
    expect(isDisplayAllowlisted(REGISTRY, 137, POH_V2_MAINNET)).toBe(false);
  });

  it("a non-member is not allowlisted", () => {
    expect(isDisplayAllowlisted(REGISTRY, 1, toRegistryAddress("0x0000000000000000000000000000000000000001"))).toBe(false);
  });

  it("a key without a list allowlists nothing", () => {
    expect(isDisplayAllowlisted(REGISTRY, 42161, POH_V2_MAINNET)).toBe(false);
    expect(isDisplayAllowlisted(REGISTRY, 0, POH_V2_MAINNET)).toBe(false);
    expect(isDisplayAllowlisted(REGISTRY, 10, POH_V2_MAINNET)).toBe(false);
  });
});
