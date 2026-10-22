import { getAbiItem, keccak256, stringToHex, toFunctionSelector, toHex } from "viem";
import { describe, expect, it } from "vitest";
import type { Hex } from "../types";
import type { ProbeSignature } from "./types";
import { EIP1967_IMPLEMENTATION_SLOT, SELECTORS, governorAbi } from "./index";
import { ARTIFACTS, VERIFIED, findBySignature, signatureOf, type NormalizedItem } from "./__fixtures__/artifacts";
import { carriesSelector, recordedByFamily, RECORDED_CONTRACTS } from "./__fixtures__/bytecode";

/** Written out by hand, independently of `SELECTORS`. */
const DOCUMENTED: Readonly<Record<string, string>> = {
  "disputeIDtoTransactionID(uint256)": "0x2fbe3b03",
  "externalIDtoLocalID(uint256)": "0xc21ae061",
  "submitEvidence(string)": "0xbac91e2e",
  "submitEvidence(uint256,string)": "0xa6a7f0eb",
  "fundAppeal(uint256)": "0xa446ff57",
  "getCurrentSessionNumber()": "0x6c0b7e71",
  "getTotalWithdrawableAmount(uint256,address,uint256)": "0xec85635b",
  "getTotalWithdrawableAmount(uint256,address,uint256[])": "0xc25516e9",
  "fundAppeal(uint256,uint256)": "0x4b2f0ea0",
};

/** Read from the verified legacy resolver. */
const LEGACY_FUND_APPEAL_UINT8 = "0x12b3a2c0";

const GOVERNOR_FIXTURE = VERIFIED.governors[0];
if (GOVERNOR_FIXTURE === undefined) throw new Error("the governor fixtures are empty");

/** Selectors are recomputed from these source entries, never from the literals. */
const SOURCES: Readonly<Record<ProbeSignature, readonly NormalizedItem[]>> = {
  "disputeIDtoTransactionID(uint256)": ARTIFACTS.escrowV1,
  "externalIDtoLocalID(uint256)": ARTIFACTS.arbitrableProxy,
  "submitEvidence(string)": GOVERNOR_FIXTURE.abi,
  "submitEvidence(uint256,string)": ARTIFACTS.idrV2,
  "fundAppeal(uint256)": ARTIFACTS.klerosGovernor,
  "getCurrentSessionNumber()": ARTIFACTS.klerosGovernor,
  "getTotalWithdrawableAmount(uint256,address,uint256)": ARTIFACTS.idrV2,
  "getTotalWithdrawableAmount(uint256,address,uint256[])": ARTIFACTS.idrV1,
  "fundAppeal(uint256,uint256)": ARTIFACTS.idrV2,
  "fundAppeal(uint256,uint8)": VERIFIED.legacyResolver.abi,
};

const byText = new Intl.Collator("en").compare;

const PROBE_SIGNATURES = Object.keys(SOURCES) as ProbeSignature[];

function selectorFromSource(signature: ProbeSignature): string {
  return toFunctionSelector(signatureOf(findBySignature(SOURCES[signature], signature, "function")));
}

describe("SELECTORS", () => {
  it("has exactly the ten probe signatures", () => {
    expect(Object.keys(SELECTORS).sort(byText)).toEqual([...PROBE_SIGNATURES].sort(byText));
  });

  it.each(PROBE_SIGNATURES)("%s equals the selector computed from its published or verified source entry", (signature) => {
    expect(SELECTORS[signature]).toBe(selectorFromSource(signature));
  });

  it.each(Object.entries(DOCUMENTED))("%s is %s when written out by hand", (signature, selector) => {
    expect(SELECTORS[signature as ProbeSignature]).toBe(selector);
  });

  it("fundAppeal(uint256,uint8) is 0x12b3a2c0, as read from the verified older resolver", () => {
    expect(SELECTORS["fundAppeal(uint256,uint8)"]).toBe(LEGACY_FUND_APPEAL_UINT8);
  });

  it("every selector is a distinct, lowercase 4-byte hex value", () => {
    const values = Object.values(SELECTORS);
    expect(new Set(values).size).toBe(values.length);
    for (const value of values) expect(value).toMatch(/^0x[0-9a-f]{8}$/);
  });
});

/** Governor dialect selectors that are not probes, so not in `SELECTORS`. */
const GOVERNOR_DIALECT: readonly Hex[] = ["0x56858619", "0x68c76ffd", "0x8a9bb02a"];

describe("governor dialect selectors", () => {
  it("withdrawFeesAndRewards, getContributions and getRoundInfo of governorAbi have the expected selectors", () => {
    expect([
      toFunctionSelector(getAbiItem({ abi: governorAbi, name: "withdrawFeesAndRewards" })),
      toFunctionSelector(getAbiItem({ abi: governorAbi, name: "getContributions" })),
      toFunctionSelector(getAbiItem({ abi: governorAbi, name: "getRoundInfo" })),
    ]).toEqual(GOVERNOR_DIALECT);
  });

  it("fundAppeal, getCurrentSessionNumber and submitEvidence of governorAbi are the probe selectors", () => {
    expect(toFunctionSelector(getAbiItem({ abi: governorAbi, name: "fundAppeal" }))).toBe(SELECTORS["fundAppeal(uint256)"]);
    expect(toFunctionSelector(getAbiItem({ abi: governorAbi, name: "getCurrentSessionNumber" }))).toBe(SELECTORS["getCurrentSessionNumber()"]);
    expect(toFunctionSelector(getAbiItem({ abi: governorAbi, name: "submitEvidence" }))).toBe(SELECTORS["submitEvidence(string)"]);
  });
});

describe("probe selectors against the recorded bytecode", () => {
  const ESCROW = recordedByFamily("escrow-v1");
  const GOVERNORS = recordedByFamily("governor");
  const IDR_V2 = recordedByFamily("idr-v2");
  const IDR_V1 = recordedByFamily("idr-v1");
  const IDR_LEGACY = recordedByFamily("idr-legacy");

  it("the recorded fixtures cover every family the selectors discriminate", () => {
    for (const group of [ESCROW, GOVERNORS, IDR_V2, IDR_V1, IDR_LEGACY]) expect(group.length).toBeGreaterThan(0);
  });

  it("every Escrow V1 carries disputeIDtoTransactionID and submitEvidence(uint256,string), and no externalIDtoLocalID", () => {
    for (const contract of ESCROW) {
      expect(carriesSelector(contract, SELECTORS["disputeIDtoTransactionID(uint256)"])).toBe(true);
      expect(carriesSelector(contract, SELECTORS["submitEvidence(uint256,string)"])).toBe(true);
      expect(carriesSelector(contract, SELECTORS["externalIDtoLocalID(uint256)"])).toBe(false);
    }
  });

  it("every governor carries fundAppeal(uint256), getCurrentSessionNumber() and the verified dialect, and no local dispute ID", () => {
    for (const contract of GOVERNORS) {
      expect(carriesSelector(contract, SELECTORS["fundAppeal(uint256)"])).toBe(true);
      expect(carriesSelector(contract, SELECTORS["getCurrentSessionNumber()"])).toBe(true);
      for (const selector of GOVERNOR_DIALECT) expect(carriesSelector(contract, selector)).toBe(true);
      expect(carriesSelector(contract, SELECTORS["externalIDtoLocalID(uint256)"])).toBe(false);
      expect(carriesSelector(contract, SELECTORS["submitEvidence(uint256,string)"])).toBe(false);
    }
  });

  it("sharedMultiplier() of governorAbi is 0xce1d8ab2, the published getter, and every recorded governor carries it", () => {
    const selector = toFunctionSelector(getAbiItem({ abi: governorAbi, name: "sharedMultiplier" }));
    expect(selector).toBe("0xce1d8ab2");
    expect(toFunctionSelector(signatureOf(findBySignature(ARTIFACTS.klerosGovernor, "sharedMultiplier()", "function")))).toBe(selector);
    expect(GOVERNORS.map((contract) => contract.address)).toEqual(
      expect.arrayContaining(["0x327a29fce0a6490e4236240be176daa282eccfdf", "0x7510c77163683448b8dc8fe9e019d9482be1ed2b", "0xe5bcea6f87aaee4a81f64dfdb4d30d400e0e5cf4"]),
    );
    for (const contract of GOVERNORS) expect(carriesSelector(contract, selector), contract.address).toBe(true);
  });

  it("poh.eth, ubi-voting.eth and fork-dao.eth carry submitEvidence(string) and kleros.eth does not", () => {
    const kleros = "0xe5bcea6f87aaee4a81f64dfdb4d30d400e0e5cf4";
    for (const contract of GOVERNORS) {
      expect(carriesSelector(contract, SELECTORS["submitEvidence(string)"])).toBe(contract.address !== kleros);
    }
    expect(GOVERNORS.some((contract) => contract.address === kleros)).toBe(true);
  });

  it("every idr-v2 contract carries the v2 withdrawable selector and not the v1 one", () => {
    for (const contract of IDR_V2) {
      expect(carriesSelector(contract, SELECTORS["getTotalWithdrawableAmount(uint256,address,uint256)"])).toBe(true);
      expect(carriesSelector(contract, SELECTORS["getTotalWithdrawableAmount(uint256,address,uint256[])"])).toBe(false);
    }
  });

  it("every idr-v1 contract (Unslashed implementation included) carries the v1 withdrawable selector and not the v2 one", () => {
    for (const contract of IDR_V1) {
      expect(carriesSelector(contract, SELECTORS["getTotalWithdrawableAmount(uint256,address,uint256[])"])).toBe(true);
      expect(carriesSelector(contract, SELECTORS["getTotalWithdrawableAmount(uint256,address,uint256)"])).toBe(false);
    }
    expect(IDR_V1.some((contract) => contract.address === "0xe0e1bc8c6cd1b81993e2fcfb80832d814886ea38")).toBe(true);
  });

  it("the older resolver carries externalIDtoLocalID, submitEvidence(uint256,string) and fundAppeal(uint256,uint8) only", () => {
    for (const contract of IDR_LEGACY) {
      expect(carriesSelector(contract, SELECTORS["externalIDtoLocalID(uint256)"])).toBe(true);
      expect(carriesSelector(contract, SELECTORS["submitEvidence(uint256,string)"])).toBe(true);
      expect(carriesSelector(contract, SELECTORS["fundAppeal(uint256,uint8)"])).toBe(true);
      expect(carriesSelector(contract, SELECTORS["fundAppeal(uint256,uint256)"])).toBe(false);
      expect(carriesSelector(contract, SELECTORS["getTotalWithdrawableAmount(uint256,address,uint256)"])).toBe(false);
      expect(carriesSelector(contract, SELECTORS["getTotalWithdrawableAmount(uint256,address,uint256[])"])).toBe(false);
    }
  });

  it("no other recorded contract carries fundAppeal(uint256,uint8)", () => {
    const carriers = RECORDED_CONTRACTS.filter((contract) => carriesSelector(contract, SELECTORS["fundAppeal(uint256,uint8)"]));
    expect(carriers.map((contract) => contract.expectedFamily)).toEqual(["idr-legacy"]);
  });

  it("the current ArbitrableProxy of every chain carries fundAppeal(uint256,uint256)", () => {
    for (const contract of IDR_V2) expect(carriesSelector(contract, SELECTORS["fundAppeal(uint256,uint256)"])).toBe(true);
  });
});

describe("EIP-1967 implementation slot", () => {
  it("equals keccak256('eip1967.proxy.implementation') - 1", () => {
    const derived = toHex(BigInt(keccak256(stringToHex("eip1967.proxy.implementation"))) - 1n, { size: 32 });
    expect(EIP1967_IMPLEMENTATION_SLOT).toBe(derived);
  });

  it("is the well-known slot value", () => {
    expect(EIP1967_IMPLEMENTATION_SLOT).toBe("0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc");
  });
});
