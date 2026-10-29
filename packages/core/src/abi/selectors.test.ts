import { getAbiItem, keccak256, stringToHex, toFunctionSelector, toHex } from "viem";
import { describe, expect, it } from "vitest";
import type { ProbeSignature } from "./types";
import { EIP1967_IMPLEMENTATION_SLOT, SELECTORS, governorAbi } from "./index";
import { ARTIFACTS, VERIFIED, findBySignature, signatureOf, type NormalizedItem } from "./__fixtures__/artifacts";
import { RECORDED_CONTRACTS } from "../families/__fixtures__/recorded";

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

const PROBE_SIGNATURES = Object.keys(SOURCES) as ProbeSignature[];

function selectorFromSource(signature: ProbeSignature): string {
  return toFunctionSelector(signatureOf(findBySignature(SOURCES[signature], signature, "function")));
}

describe("SELECTORS", () => {
  it.each(PROBE_SIGNATURES)("%s equals the selector computed from its published or verified source entry", (signature) => {
    expect(SELECTORS[signature]).toBe(selectorFromSource(signature));
  });
});

/** Governor dialect selectors that are not probes, so not in `SELECTORS`. */
const GOVERNOR_DIALECT = (["withdrawFeesAndRewards", "getContributions", "getRoundInfo"] as const).map((name) => toFunctionSelector(getAbiItem({ abi: governorAbi, name })));

describe("governor selectors against the recorded bytecode", () => {
  const GOVERNORS = RECORDED_CONTRACTS.filter((contract) => contract.expectedFamily === "governor");

  it("every recorded governor carries the verified dialect and sharedMultiplier(), whose published selector is 0xce1d8ab2", () => {
    const sharedMultiplier = toFunctionSelector(getAbiItem({ abi: governorAbi, name: "sharedMultiplier" }));
    expect(sharedMultiplier).toBe("0xce1d8ab2");
    expect(toFunctionSelector(signatureOf(findBySignature(ARTIFACTS.klerosGovernor, "sharedMultiplier()", "function")))).toBe(sharedMultiplier);
    expect(GOVERNORS.map((contract) => contract.address)).toEqual(
      expect.arrayContaining(["0x327a29fce0a6490e4236240be176daa282eccfdf", "0x7510c77163683448b8dc8fe9e019d9482be1ed2b", "0xe5bcea6f87aaee4a81f64dfdb4d30d400e0e5cf4"]),
    );
    for (const contract of GOVERNORS) {
      // Solc dispatches a function with `PUSH4 <selector>` (0x63), read in the implementation's code behind a proxy.
      const dispatcherCode = (contract.implementation?.code ?? contract.code).toLowerCase();
      for (const selector of [...GOVERNOR_DIALECT, sharedMultiplier]) expect(dispatcherCode.includes(`63${selector.slice(2)}`), `${contract.address} ${selector}`).toBe(true);
    }
  });
});

describe("EIP-1967 implementation slot", () => {
  it("equals keccak256('eip1967.proxy.implementation') - 1", () => {
    const derived = toHex(BigInt(keccak256(stringToHex("eip1967.proxy.implementation"))) - 1n, { size: 32 });
    expect(EIP1967_IMPLEMENTATION_SLOT).toBe(derived);
  });
});
