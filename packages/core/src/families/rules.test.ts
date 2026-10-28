import { describe, expect, it } from "vitest";
import { SELECTORS } from "../abi";
import type { ProbeSignature } from "../abi/types";
import { REGISTRY, toRegistryAddress } from "../registry";
import type { Registry } from "../registry/types";
import { classifySelectors, describeAppealRules, detectFamily } from "./index";
import { RECORDED_CONTRACTS } from "./__fixtures__/recorded";
import type { FamilyDetection } from "./types";
import { fakeNodeClient, recordedDetection, recordedNode } from "../test/families/testHelpers";

const WITHOUT_VERIFIED: Registry = { ...REGISTRY, verifiedArbitrables: {} };

const IDR_V2: readonly ProbeSignature[] = [
  "externalIDtoLocalID(uint256)",
  "submitEvidence(uint256,string)",
  "fundAppeal(uint256,uint256)",
  "getTotalWithdrawableAmount(uint256,address,uint256)",
];
const ESCROW: readonly ProbeSignature[] = ["disputeIDtoTransactionID(uint256)", "submitEvidence(uint256,string)"];

/** A detection of an unregistered contract carrying exactly `signatures`. */
function probed(signatures: readonly ProbeSignature[], fields: Partial<FamilyDetection> = {}): FamilyDetection {
  const { family, capabilities } = classifySelectors(new Set(signatures.map((signature) => SELECTORS[signature])));
  return { chainId: 1, arbitrable: "0x00000000000000000000000000000000000000dd", family, writeFamily: family, capabilities, realityProxy: null, implementation: null, ...fields };
}

describe("describeAppealRules", () => {
  it("an old Reality proxy without an appeal function cannot be appealed", async () => {
    const rules = describeAppealRules(REGISTRY, await recordedDetection(1, "0x594ec762b59978c97c82bc36ab493ed8b1f1f368"));
    expect(rules).toEqual({ route: "none", verified: true, settlement: "unknown", refundsWithoutAppeal: false, tie: null, noun: "answer" });
  });

  it("a registered Reality proxy with appeals crowdfunds answers under verified rules where the only funded answer wins, and promises no refund", async () => {
    const rules = describeAppealRules(REGISTRY, await recordedDetection(100, "0xe04f5791d671d5c4e08ab49b39807087b591ea3e"));
    expect(rules).toEqual({ route: "crowdfunding", verified: true, settlement: "sole-funded-wins", refundsWithoutAppeal: false, tie: "refuse-is-winner", noun: "answer" });
  });

  it.each([
    ["the mainnet ArbitrableProxy", 1, "0x99489d7bb33539f3d1a401741e56e8f02b9ae0cf"],
    ["its Gnosis bytecode twin", 100, "0xc7add3c961f7935cb4914e37da991d2f1cd7986c"],
    ["the v1 resolver proxy", 1, "0x4b89e798b10478a839ea0abcf86c4b94a3c782a4"],
    ["a Sepolia ArbitrableProxy", 11155111, "0x1780601e6465f32233643f3af54abc3d8df161be"],
  ])("%s crowdfunds options under verified rules where the only funded option wins and an unappealed round is refunded", async (_, chainId, address) => {
    const rules = describeAppealRules(REGISTRY, await recordedDetection(chainId, address));
    expect(rules).toEqual({ route: "crowdfunding", verified: true, settlement: "sole-funded-wins", refundsWithoutAppeal: true, tie: "refuse-is-winner", noun: "option" });
  });

  it("Yubiai crowdfunds under verified rules where the jury's ruling stands", async () => {
    const rules = describeAppealRules(REGISTRY, await recordedDetection(100, "0xaeecfa44639b61d2e0a9534d918789d94a24a9de"));
    expect(rules).toEqual({ route: "crowdfunding", verified: true, settlement: "jury-stands", refundsWithoutAppeal: false, tie: "refuse-is-winner", noun: "option" });
  });

  it("governors crowdfund lists, a tie is shared by every list and an unappealed round is refunded", async () => {
    for (const address of ["0x327a29fce0a6490e4236240be176daa282eccfdf", "0xe5bcea6f87aaee4a81f64dfdb4d30d400e0e5cf4"]) {
      const rules = describeAppealRules(REGISTRY, await recordedDetection(1, address));
      expect(rules, address).toEqual({
        route: "crowdfunding",
        verified: true,
        settlement: "sole-funded-wins",
        refundsWithoutAppeal: true,
        tie: "shared-full-period",
        noun: "list",
      });
    }
  });

  it("Unslashed's tie makes every option a winner, under rules the Dispute Resolver has not verified", async () => {
    const detection = await recordedDetection(1, "0xe0e1bc8c6cd1b81993e2fcfb80832d814886ea38");
    expect(detection.implementation).not.toBeNull();
    expect(describeAppealRules(REGISTRY, detection)).toEqual({
      route: "crowdfunding",
      verified: false,
      settlement: "unknown",
      refundsWithoutAppeal: false,
      tie: "all-winner",
      noun: "option",
    });
  });

  it("the Chiado ArbitrableProxy, whose source is not verified, crowdfunds under unverified rules", async () => {
    const rules = describeAppealRules(REGISTRY, await recordedDetection(10200, "0x4bef0321bd7fa943f85ae55e07f790c6becbd177"));
    expect(rules).toMatchObject({ route: "crowdfunding", verified: false, settlement: "unknown" });
  });

  it("a contract matching the IDisputeResolver selectors without an entry is not verified", () => {
    expect(describeAppealRules(REGISTRY, probed(IDR_V2))).toEqual({
      route: "crowdfunding",
      verified: false,
      settlement: "unknown",
      refundsWithoutAppeal: false,
      tie: "refuse-is-winner",
      noun: "option",
    });
  });

  it("an entry whose family differs from the detection is not verified", async () => {
    const detection = await recordedDetection(1, "0x99489d7bb33539f3d1a401741e56e8f02b9ae0cf");
    const asV1: FamilyDetection = { ...detection, family: "idr-v1", writeFamily: "idr-v1" };
    expect(describeAppealRules(REGISTRY, asV1)).toMatchObject({ verified: false, settlement: "unknown" });
  });

  it("a verified address now behind an EIP-1967 proxy is not verified", async () => {
    const detection = await recordedDetection(1, "0x99489d7bb33539f3d1a401741e56e8f02b9ae0cf");
    const upgraded: FamilyDetection = { ...detection, implementation: toRegistryAddress("0x00000000000000000000000000000000000000aa") };
    expect(describeAppealRules(REGISTRY, upgraded)).toMatchObject({ verified: false, settlement: "unknown" });
  });

  it("an entry on another chain does not verify the same address", async () => {
    const detection = await recordedDetection(1, "0x99489d7bb33539f3d1a401741e56e8f02b9ae0cf");
    expect(describeAppealRules(REGISTRY, { ...detection, chainId: 100 })).toMatchObject({ verified: false });
  });

  it("Escrow V1 appeals by paying the cost, under verified rules where the jury's ruling stands", async () => {
    const rules = describeAppealRules(REGISTRY, await recordedDetection(1, "0xe2dd8cce2c33a04215074adb4b5820b765d8ed9d"));
    expect(rules).toEqual({ route: "escrow", verified: true, settlement: "jury-stands", refundsWithoutAppeal: false, tie: null, noun: "option" });
  });

  it("an escrow-shaped contract without an entry is not verified", () => {
    expect(describeAppealRules(REGISTRY, probed(ESCROW))).toEqual({
      route: "escrow",
      verified: false,
      settlement: "unknown",
      refundsWithoutAppeal: false,
      tie: null,
      noun: "option",
    });
  });

  it("a view-only contract appeals in its own application, under unverified rules", async () => {
    const rules = describeAppealRules(REGISTRY, await recordedDetection(1, "0xebcf3bca271b26ae4b162ba560e243055af0e679"));
    expect(rules).toEqual({ route: "arbitrable", verified: false, settlement: "unknown", refundsWithoutAppeal: false, tie: null, noun: "option" });
  });

  it("the legacy resolver proxy's funding is not supported here, while its settlement rule is verified", async () => {
    const rules = describeAppealRules(REGISTRY, await recordedDetection(1, "0x135c573503f70dc290b1d60fe2e7f7eb114febd6"));
    expect(rules).toEqual({ route: "unsupported", verified: true, settlement: "sole-funded-wins", refundsWithoutAppeal: false, tie: null, noun: "option" });
  });
});

describe("verified arbitrables", () => {
  const verified = Object.entries(REGISTRY.verifiedArbitrables);

  it("every verified arbitrable's recorded bytecode classifies as its entry's family", async () => {
    for (const [key, entry] of verified) {
      const contract = RECORDED_CONTRACTS.find((candidate) => `${String(candidate.chainId)}:${candidate.address}` === key);
      if (contract === undefined) throw new Error(`no recorded bytecode for ${key}`);
      const detection = await recordedDetection(contract.chainId, contract.address);
      expect(detection.writeFamily, key).toBe(entry.family);
      expect(describeAppealRules(REGISTRY, detection).verified, key).toBe(true);
    }
  });

  it("a verified entry changes the appeal rules' wording and never the family, the capabilities or the route", async () => {
    for (const [key] of verified) {
      const contract = RECORDED_CONTRACTS.find((candidate) => `${String(candidate.chainId)}:${candidate.address}` === key);
      if (contract === undefined) throw new Error(`no recorded bytecode for ${key}`);
      const client = fakeNodeClient(recordedNode(contract.chainId)).client;
      const withEntry = await detectFamily({ client, chainId: contract.chainId, arbitrable: contract.address, registry: REGISTRY });
      const withoutEntry = await detectFamily({ client, chainId: contract.chainId, arbitrable: contract.address, registry: WITHOUT_VERIFIED });
      expect(withEntry, key).toEqual(withoutEntry);
      const rules = describeAppealRules(REGISTRY, withEntry);
      const unverified = describeAppealRules(WITHOUT_VERIFIED, withoutEntry);
      expect({ ...rules, verified: false, settlement: "unknown", refundsWithoutAppeal: false }, key).toEqual(unverified);
    }
  });
});
