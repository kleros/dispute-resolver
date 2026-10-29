import type { Abi } from "viem";
import { getAbiItem, toEventSelector } from "viem";
import { describe, expect, it } from "vitest";
import {
  arbitrableProxyAbi,
  erc1497Abi,
  erc792Abi,
  escrowV1Abi,
  governorAbi,
  idrV1Abi,
  idrV2Abi,
  klerosLiquidAbi,
  multiplierGetterAbi,
  policyRegistryAbi,
  realityAbi,
  realityProxyAbi,
} from "./index";
import { ARTIFACTS, VERIFIED, findBySignature, normalizeAbi, signatureOf, type NormalizedItem } from "./__fixtures__/artifacts";

type Kind = "function" | "event";

const byText = new Intl.Collator("en").compare;

interface Entry {
  readonly kind: Kind;
  readonly signature: string;
  /** Every source that must carry this exact entry. */
  readonly sources: readonly (readonly NormalizedItem[])[];
}

interface AbiCase {
  readonly name: string;
  readonly abi: Abi;
  readonly entries: readonly Entry[];
}

const fn = (signature: string, ...sources: readonly (readonly NormalizedItem[])[]): Entry => ({ kind: "function", signature, sources });
const ev = (signature: string, ...sources: readonly (readonly NormalizedItem[])[]): Entry => ({ kind: "event", signature, sources });

const GOVERNOR_ABIS = VERIFIED.governors.map((governor) => governor.abi);
const GOVERNORS_WITH_EVIDENCE = VERIFIED.governors.filter((governor) => governor.label !== "kleros.eth governor").map((governor) => governor.abi);
const REALITY_ABIS = [ARTIFACTS.realitio, ARTIFACTS.realitioErc20, ARTIFACTS.realityEth30, ARTIFACTS.realityEth32] as const;
const CROSS_CHAIN_PROXY_ABIS = VERIFIED.crossChainRealityProxies.map((proxy) => proxy.abi);

const CASES: readonly AbiCase[] = [
  {
    name: "klerosLiquidAbi",
    abi: klerosLiquidAbi,
    entries: [
      fn("disputes(uint256)", ARTIFACTS.klerosLiquid),
      fn("getDispute(uint256)", ARTIFACTS.klerosLiquid),
      fn("currentRuling(uint256)", ARTIFACTS.klerosLiquid),
      fn("appealPeriod(uint256)", ARTIFACTS.klerosLiquid),
      fn("appealCost(uint256,bytes)", ARTIFACTS.klerosLiquid),
      fn("arbitrationCost(bytes)", ARTIFACTS.klerosLiquid),
      fn("courts(uint256)", ARTIFACTS.klerosLiquid),
      fn("getSubcourt(uint96)", ARTIFACTS.klerosLiquid),
      ev("DisputeCreation(uint256,address)", ARTIFACTS.klerosLiquid),
      ev("NewPeriod(uint256,uint8)", ARTIFACTS.klerosLiquid),
      ev("AppealDecision(uint256,address)", ARTIFACTS.klerosLiquid),
    ],
  },
  { name: "policyRegistryAbi", abi: policyRegistryAbi, entries: [fn("policies(uint256)", ARTIFACTS.policyRegistry)] },
  {
    name: "arbitrableProxyAbi",
    abi: arbitrableProxyAbi,
    entries: [
      fn("createDispute(bytes,string,uint256)", ARTIFACTS.arbitrableProxy),
      fn("submitEvidence(uint256,string)", ARTIFACTS.arbitrableProxy, ARTIFACTS.idrV2, ARTIFACTS.idrV1, VERIFIED.legacyResolver.abi),
    ],
  },
  {
    name: "idrV2Abi",
    abi: idrV2Abi,
    entries: [
      fn("externalIDtoLocalID(uint256)", ARTIFACTS.arbitrableProxy, VERIFIED.legacyResolver.abi),
      fn("getMultipliers()", ARTIFACTS.idrV2),
      fn("fundAppeal(uint256,uint256)", ARTIFACTS.idrV2),
      fn("getTotalWithdrawableAmount(uint256,address,uint256)", ARTIFACTS.idrV2),
      fn("withdrawFeesAndRewardsForAllRounds(uint256,address,uint256)", ARTIFACTS.idrV2),
      ev("Contribution(uint256,uint256,uint256,address,uint256)", ARTIFACTS.idrV2, ARTIFACTS.idrV1, ARTIFACTS.arbitrableProxy),
      ev("RulingFunded(uint256,uint256,uint256)", ARTIFACTS.idrV2, ARTIFACTS.idrV1, ARTIFACTS.arbitrableProxy),
    ],
  },
  {
    name: "idrV1Abi",
    abi: idrV1Abi,
    entries: [fn("getTotalWithdrawableAmount(uint256,address,uint256[])", ARTIFACTS.idrV1), fn("withdrawFeesAndRewardsForAllRounds(uint256,address,uint256[])", ARTIFACTS.idrV1)],
  },
  {
    name: "escrowV1Abi",
    abi: escrowV1Abi,
    entries: [fn("disputeIDtoTransactionID(uint256)", ARTIFACTS.escrowV1), fn("appeal(uint256)", ARTIFACTS.escrowV1), fn("submitEvidence(uint256,string)", ARTIFACTS.escrowV1)],
  },
  {
    name: "governorAbi",
    abi: governorAbi,
    entries: [
      fn("submitEvidence(string)", ...GOVERNORS_WITH_EVIDENCE),
      fn("fundAppeal(uint256)", ARTIFACTS.klerosGovernor, ...GOVERNOR_ABIS),
      fn("withdrawFeesAndRewards(address,uint256,uint256,uint256)", ARTIFACTS.klerosGovernor, ...GOVERNOR_ABIS),
      fn("getContributions(uint256,uint256,address)", ARTIFACTS.klerosGovernor, ...GOVERNOR_ABIS),
      fn("getRoundInfo(uint256,uint256)", ARTIFACTS.klerosGovernor, ...GOVERNOR_ABIS),
      fn("getCurrentSessionNumber()", ARTIFACTS.klerosGovernor, ...GOVERNOR_ABIS),
      fn("winnerMultiplier()", ARTIFACTS.klerosGovernor, ...GOVERNOR_ABIS),
      fn("loserMultiplier()", ARTIFACTS.klerosGovernor, ...GOVERNOR_ABIS),
      fn("MULTIPLIER_DIVISOR()", ARTIFACTS.klerosGovernor, ...GOVERNOR_ABIS),
      fn("sharedMultiplier()", ARTIFACTS.klerosGovernor),
    ],
  },
  {
    name: "multiplierGetterAbi",
    abi: multiplierGetterAbi,
    entries: [
      fn("winnerStakeMultiplier()", ARTIFACTS.arbitrableProxy),
      fn("winnerMultiplier()", ARTIFACTS.klerosGovernor, ...GOVERNOR_ABIS),
      fn("loserStakeMultiplier()", ARTIFACTS.arbitrableProxy),
      fn("loserMultiplier()", ARTIFACTS.klerosGovernor, ...GOVERNOR_ABIS),
      fn("loserAppealPeriodMultiplier()", ARTIFACTS.arbitrableProxy),
      fn("MULTIPLIER_DIVISOR()", ARTIFACTS.klerosGovernor, ...GOVERNOR_ABIS),
      fn("denominator()", constructedGetter("denominator")),
      fn("MULTIPLIER_DENOMINATOR()", constructedGetter("MULTIPLIER_DENOMINATOR")),
    ],
  },
  {
    name: "realityAbi",
    abi: realityAbi,
    entries: [
      fn("templates(uint256)", ...REALITY_ABIS),
      ev("LogNewQuestion(bytes32,address,uint256,string,bytes32,address,uint32,uint32,uint256,uint256)", ...REALITY_ABIS),
      ev("LogNewTemplate(uint256,address,string)", ...REALITY_ABIS),
    ],
  },
  {
    name: "realityProxyAbi",
    abi: realityProxyAbi,
    entries: [
      fn("arbitrationCreatedBlock(uint256)", ...CROSS_CHAIN_PROXY_ABIS),
      ev("DisputeIDToQuestionID(uint256,bytes32)", ARTIFACTS.realitioArbitratorProxy),
      ev("ArbitrationCreated(bytes32,address,uint256)", ...CROSS_CHAIN_PROXY_ABIS),
    ],
  },
  {
    name: "erc1497Abi",
    abi: erc1497Abi,
    entries: [
      ev("MetaEvidence(uint256,string)", ARTIFACTS.iEvidence),
      ev("Evidence(address,uint256,address,string)", ARTIFACTS.iEvidence),
      ev("Dispute(address,uint256,uint256,uint256)", ARTIFACTS.iEvidence),
    ],
  },
  { name: "erc792Abi", abi: erc792Abi, entries: [ev("Ruling(address,uint256,uint256)", ARTIFACTS.iArbitrable)] },
];

/** No published artifact declares `denominator` or `MULTIPLIER_DENOMINATOR`, so their entries are built by hand. */
function constructedGetter(name: string): NormalizedItem[] {
  return [{ type: "function", name, inputs: [], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" }];
}

describe("every embedded entry is the published or verified entry, nothing else is embedded", () => {
  for (const abiCase of CASES) {
    it(`${abiCase.name} embeds exactly the listed entries`, () => {
      const embedded = normalizeAbi(abiCase.abi)
        .map((item) => `${item.type} ${signatureOf(item)}`)
        .sort(byText);
      const expected = abiCase.entries.map((entry) => `${entry.kind} ${entry.signature}`).sort(byText);
      expect(embedded).toEqual(expected);
    });

    for (const entry of abiCase.entries) {
      it(`${abiCase.name} ${entry.kind} ${entry.signature} equals its source (name, inputs, outputs, indexed flags, mutability)`, () => {
        const embedded = findBySignature(normalizeAbi(abiCase.abi), entry.signature, entry.kind);
        expect(entry.sources.length).toBeGreaterThan(0);
        for (const source of entry.sources) expect(embedded).toEqual(findBySignature(source, entry.signature, entry.kind));
      });
    }
  }
});

describe("event topics", () => {
  it("DisputeCreation has its known on-chain topic hash", () => {
    expect(toEventSelector(getAbiItem({ abi: klerosLiquidAbi, name: "DisputeCreation" }))).toBe("0x141dfc18aa6a56fc816f44f0e9e2f1ebc92b15ab167770e17db5b084c10ed995");
  });

  it("the arbitrable's Ruling event has the topic hash every executed dispute carries", () => {
    expect(toEventSelector(getAbiItem({ abi: erc792Abi, name: "Ruling" }))).toBe("0x394027a5fa6e098a1191094d1719d6929b9abc535fcc0c8f448d6a4e75622276");
  });
});
