import type { Abi, Hex } from "viem";
import { decodeEventLog, encodeAbiParameters, encodeFunctionData, getAbiItem, toEventSelector, toFunctionSelector } from "viem";
import { describe, expect, it } from "vitest";
import {
  arbitrableProxyAbi,
  erc1497Abi,
  erc792Abi,
  escrowV1Abi,
  governorAbi,
  idrLegacyFundAppealAbi,
  idrV1Abi,
  idrV2Abi,
  klerosLiquidAbi,
  multiplierGetterAbi,
  policyRegistryAbi,
  realityAbi,
  realityProxyAbi,
} from "./index";
import { ARTIFACTS, VERIFIED, findBySignature, normalizeAbi, signatureOf, type NormalizedFunction, type NormalizedItem } from "./__fixtures__/artifacts";

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
      // The IDisputeResolver interface leaves `externalIDtoLocalID` non-view; every deployed implementation exposes a view mapping getter.
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
    name: "idrLegacyFundAppealAbi",
    abi: idrLegacyFundAppealAbi,
    entries: [fn("fundAppeal(uint256,uint256)", ARTIFACTS.idrV2, ARTIFACTS.idrV1, ARTIFACTS.arbitrableProxy), fn("fundAppeal(uint256,uint8)", VERIFIED.legacyResolver.abi)],
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
    name: "erc792Abi",
    abi: erc792Abi,
    entries: [
      fn("arbitrationCost(bytes)", ARTIFACTS.iArbitrator),
      fn("appealCost(uint256,bytes)", ARTIFACTS.iArbitrator),
      ev("DisputeCreation(uint256,address)", ARTIFACTS.iArbitrator),
      ev("AppealDecision(uint256,address)", ARTIFACTS.iArbitrator),
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
];

/** No published artifact declares `denominator` or `MULTIPLIER_DENOMINATOR`, so their entries are built by hand. */
function constructedGetter(name: string): NormalizedItem[] {
  return [{ type: "function", name, inputs: [], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" }];
}

function embeddedItems(abi: Abi): NormalizedItem[] {
  return normalizeAbi(abi);
}

describe("every embedded entry is the published or verified entry, nothing else is embedded", () => {
  for (const abiCase of CASES) {
    it(`${abiCase.name} embeds exactly the listed entries`, () => {
      const embedded = embeddedItems(abiCase.abi)
        .map((item) => `${item.type} ${signatureOf(item)}`)
        .sort(byText);
      const expected = abiCase.entries.map((entry) => `${entry.kind} ${entry.signature}`).sort(byText);
      expect(embedded).toEqual(expected);
    });

    for (const entry of abiCase.entries) {
      it(`${abiCase.name} ${entry.kind} ${entry.signature} equals its source (name, inputs, outputs, indexed flags, mutability)`, () => {
        const embedded = findBySignature(embeddedItems(abiCase.abi), entry.signature, entry.kind);
        expect(entry.sources.length).toBeGreaterThan(0);
        for (const source of entry.sources) expect(embedded).toEqual(findBySignature(source, entry.signature, entry.kind));
      });
    }
  }
});

describe("governor sources", () => {
  it("the verified governors are the four deployed ones, and only kleros.eth lacks submitEvidence(string)", () => {
    expect(VERIFIED.governors.map((governor) => governor.address)).toEqual([
      "0x327a29fce0a6490e4236240be176daa282eccfdf",
      "0x7510c77163683448b8dc8fe9e019d9482be1ed2b",
      "0xf7de5537ecd69a94695fcf4bcdbdee6329b63322",
      "0xe5bcea6f87aaee4a81f64dfdb4d30d400e0e5cf4",
    ]);
    const withEvidence = VERIFIED.governors.filter((governor) => governor.abi.some((item) => signatureOf(item) === "submitEvidence(string)"));
    expect(withEvidence).toHaveLength(3);
    expect(GOVERNORS_WITH_EVIDENCE).toHaveLength(3);
  });

  it("the governor fundAppeal argument is the submission index, not a ruling", () => {
    const entry = findBySignature(embeddedItems(governorAbi), "fundAppeal(uint256)", "function") as NormalizedFunction;
    expect(entry.inputs).toEqual([{ name: "_submissionID", type: "uint256" }]);
    expect(entry.stateMutability).toBe("payable");
  });
});

describe("externalIDtoLocalID mutability", () => {
  it("deployed implementations expose a view getter while IDRv2 declares the same signature nonpayable", () => {
    const signature = "externalIDtoLocalID(uint256)";
    const deployed = [ARTIFACTS.arbitrableProxy, VERIFIED.legacyResolver.abi].map((source) => findBySignature(source, signature, "function"));
    const declared = findBySignature(ARTIFACTS.idrV2, signature, "function") as NormalizedFunction;
    for (const item of deployed) expect((item as NormalizedFunction).stateMutability).toBe("view");
    expect(declared.stateMutability).toBe("nonpayable");
    expect(declared.inputs.map((input) => input.type)).toEqual(["uint256"]);
    expect(declared.outputs.map((output) => output.type)).toEqual(["uint256"]);
  });
});

describe("event topics the Reality lookup filters on", () => {
  const TOPIC_SIGNATURES: readonly [ABI: Abi, name: string, signature: string][] = [
    [realityProxyAbi, "DisputeIDToQuestionID", "DisputeIDToQuestionID(uint256,bytes32)"],
    [realityProxyAbi, "ArbitrationCreated", "ArbitrationCreated(bytes32,address,uint256)"],
    [realityAbi, "LogNewQuestion", "LogNewQuestion(bytes32,address,uint256,string,bytes32,address,uint32,uint32,uint256,uint256)"],
    [realityAbi, "LogNewTemplate", "LogNewTemplate(uint256,address,string)"],
  ];

  it.each(TOPIC_SIGNATURES)("$1 topic is the hash of its full signature", (abi, name, signature) => {
    const item = abi.find((entry) => entry.type === "event" && entry.name === name);
    expect(item).toBeDefined();
    expect(toEventSelector(item as Parameters<typeof toEventSelector>[0])).toBe(toEventSelector(signature));
  });

  it("Reality.eth v2 and v3 declare the same lookup events", () => {
    for (const signature of ["LogNewQuestion(bytes32,address,uint256,string,bytes32,address,uint32,uint32,uint256,uint256)", "LogNewTemplate(uint256,address,string)"]) {
      const reference = findBySignature(ARTIFACTS.realitio, signature, "event");
      expect(findBySignature(ARTIFACTS.realityEth30, signature, "event")).toEqual(reference);
      expect(findBySignature(ARTIFACTS.realityEth32, signature, "event")).toEqual(reference);
    }
  });
});

describe("arbitrator event topics", () => {
  it("DisputeCreation and Evidence have their known on-chain topic hashes", () => {
    const dispute = getAbiItem({ abi: klerosLiquidAbi, name: "DisputeCreation" });
    const evidence = getAbiItem({ abi: erc1497Abi, name: "Evidence" });
    expect(toEventSelector(dispute)).toBe("0x141dfc18aa6a56fc816f44f0e9e2f1ebc92b15ab167770e17db5b084c10ed995");
    expect(toEventSelector(evidence)).toBe("0xdccf2f8b2cc26eafcd61905cba744cff4b81d14740725f6376390dc6298a6a3c");
  });
});

describe("encoding through the embedded ABIs", () => {
  it("getSubcourt takes a bigint and encodes the selector of the published signature", () => {
    const data = encodeFunctionData({ abi: klerosLiquidAbi, functionName: "getSubcourt", args: [3n] });
    expect(data.slice(0, 10)).toBe(toFunctionSelector("getSubcourt(uint96)"));
    expect(data).toHaveLength(2 + 8 + 64);
  });

  it("the v1 withdrawable read encodes the array of rulings", () => {
    const data = encodeFunctionData({
      abi: idrV1Abi,
      functionName: "getTotalWithdrawableAmount",
      args: [1n, "0x0000000000000000000000000000000000000001", [1n, 2n]],
    });
    expect(data.slice(0, 10)).toBe(toFunctionSelector("getTotalWithdrawableAmount(uint256,address,uint256[])"));
  });

  it("each legacy fundAppeal overload encodes under its own selector", () => {
    const [wide, narrow] = idrLegacyFundAppealAbi;
    expect(encodeFunctionData({ abi: [wide], functionName: "fundAppeal", args: [1n, 2n] }).slice(0, 10)).toBe(toFunctionSelector("fundAppeal(uint256,uint256)"));
    expect(encodeFunctionData({ abi: [narrow], functionName: "fundAppeal", args: [1n, 1] }).slice(0, 10)).toBe(toFunctionSelector("fundAppeal(uint256,uint8)"));
  });

  it("the Contribution event decodes its ruling and amount", () => {
    const padded = (value: bigint): Hex => encodeAbiParameters([{ type: "uint256" }], [value]);
    const contributor = encodeAbiParameters([{ type: "address" }], ["0x0000000000000000000000000000000000000002"]);
    const decoded = decodeEventLog({
      abi: idrV2Abi,
      topics: [toEventSelector("Contribution(uint256,uint256,uint256,address,uint256)"), padded(7n), padded(1n), contributor],
      data: encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [2n, 500n]),
    });
    expect(decoded.eventName).toBe("Contribution");
    expect(decoded.args).toEqual({
      _localDisputeID: 7n,
      _round: 1n,
      ruling: 2n,
      _contributor: "0x0000000000000000000000000000000000000002",
      _amount: 500n,
    });
  });
});
