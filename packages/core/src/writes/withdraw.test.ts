import { toFunctionSelector } from "viem";
import { describe, expect, it } from "vitest";
import type { WithdrawItem } from "../appeals/types";
import type { LocalIdResolution } from "../disputes/types";
import type { FamilyDetection } from "../families/types";
import governor1621 from "./__fixtures__/governor-1621.json";
import { buildWithdrawCalls } from "./index";
import {
  BENEFICIARY,
  DECODED_BENEFICIARY,
  decodedArgs,
  detectionFor,
  expectCall,
  FAMILY_SIGNATURES,
  recordedDetections,
  selectorOf,
  testBinding,
} from "../test/writes/testHelpers";

const ARBITRABLE = "0x99489d7bb33539f3d1a401741e56e8f02b9ae0cf";
const binding = testBinding({ chainId: 1, disputeId: 1454n, arbitrated: ARBITRABLE });
const LOCAL_ID: LocalIdResolution = { kind: "local-id", value: 4n };
const V2_WITHDRAW = toFunctionSelector("withdrawFeesAndRewardsForAllRounds(uint256,address,uint256)");
const V1_WITHDRAW = toFunctionSelector("withdrawFeesAndRewardsForAllRounds(uint256,address,uint256[])");
const GOVERNOR_WITHDRAW = toFunctionSelector("withdrawFeesAndRewards(address,uint256,uint256,uint256)");

function family(signatures: keyof typeof FAMILY_SIGNATURES): FamilyDetection {
  return detectionFor(1, ARBITRABLE, FAMILY_SIGNATURES[signatures]);
}

function recordedFamily(chainId: number, address: string): FamilyDetection {
  const found = recordedDetections().find((entry) => entry.detection.chainId === chainId && entry.detection.arbitrable === address);
  if (found === undefined) throw new Error(`no recorded bytecode for ${String(chainId)}:${address}`);
  return found.detection;
}

const v2Items: readonly WithdrawItem[] = [
  { dialect: "idr-v2", ruling: 1n, amount: 10n },
  { dialect: "idr-v2", ruling: 2n, amount: 20n },
];

describe("buildWithdrawCalls", () => {
  it("D-51: one withdrawal per contributed ruling, in the order of the items", () => {
    const builds = buildWithdrawCalls({ binding, family: family("idr-v2"), localId: LOCAL_ID, beneficiary: BENEFICIARY, items: v2Items });
    expect(builds).toHaveLength(2);
    const calls = builds.map(expectCall);
    expect(calls.map(decodedArgs)).toEqual([
      [4n, DECODED_BENEFICIARY, 1n],
      [4n, DECODED_BENEFICIARY, 2n],
    ]);
  });

  it("§5.15: idr-v2 withdraws through withdrawFeesAndRewardsForAllRounds(localID, beneficiary, ruling) with no value", () => {
    const [build] = buildWithdrawCalls({ binding, family: family("idr-v2"), localId: LOCAL_ID, beneficiary: BENEFICIARY, items: v2Items.slice(0, 1) });
    const call = expectCall(build ?? { ok: false, refusal: "withdraw-unsupported" });
    expect(call).toMatchObject({ kind: "withdraw", chainId: 1, address: ARBITRABLE, functionName: "withdrawFeesAndRewardsForAllRounds", value: 0n });
    expect(selectorOf(call)).toBe(V2_WITHDRAW);
  });

  it("D-49: idr-v1 withdraws each ruling through the array signature, one ruling per transaction (Unslashed, mainnet 0x4b89…, Gnosis 0x1128…)", () => {
    for (const [chainId, address] of [
      [1, "0xe0e1bc8c6cd1b81993e2fcfb80832d814886ea38"],
      [1, "0x4b89e798b10478a839ea0abcf86c4b94a3c782a4"],
      [100, "0x1128ed55ab2d796fa92d2f8e1f336d745354a77a"],
    ] as const) {
      const detection = recordedFamily(chainId, address);
      expect(detection.capabilities.withdraw).toEqual({ kind: "idr-v1" });
      const v1Binding = testBinding({ chainId, disputeId: 0n, arbitrated: detection.arbitrable });
      const items: readonly WithdrawItem[] = [
        { dialect: "idr-v1", ruling: 2n, amount: 1n },
        { dialect: "idr-v1", ruling: 1n, amount: 1n },
      ];
      const calls = buildWithdrawCalls({ binding: v1Binding, family: detection, localId: LOCAL_ID, beneficiary: BENEFICIARY, items }).map(expectCall);
      expect(calls.map(selectorOf)).toEqual([V1_WITHDRAW, V1_WITHDRAW]);
      expect(calls.map(decodedArgs)).toEqual([
        [4n, DECODED_BENEFICIARY, [2n]],
        [4n, DECODED_BENEFICIARY, [1n]],
      ]);
      expect(calls.every((call) => call.chainId === chainId && call.address === detection.arbitrable && call.value === 0n)).toBe(true);
    }
  });

  it("D-47: a governor withdraws through withdrawFeesAndRewards(beneficiary, session, round, listIndex) (golden 1621)", () => {
    const governor = recordedFamily(1, governor1621.governor);
    const governorBinding = testBinding({ chainId: 1, disputeId: 1621n, arbitrated: governor1621.arbitrated });
    const session = BigInt(governor1621.session);
    const winnerListIndex = BigInt(governor1621.sessionRuling) - 1n;
    const items: readonly WithdrawItem[] = [
      { dialect: "governor", session, round: 0n, listIndex: winnerListIndex, amount: 5n },
      { dialect: "governor", session, round: 1n, listIndex: 0n, amount: 6n },
    ];
    const calls = buildWithdrawCalls({ binding: governorBinding, family: governor, localId: { kind: "not-applicable" }, beneficiary: BENEFICIARY, items }).map(expectCall);
    expect(calls.map(selectorOf)).toEqual([GOVERNOR_WITHDRAW, GOVERNOR_WITHDRAW]);
    expect(calls.map(decodedArgs)).toEqual([
      [DECODED_BENEFICIARY, 18n, 0n, 1n],
      [DECODED_BENEFICIARY, 18n, 1n, 0n],
    ]);
    expect(calls[0]).toMatchObject({ kind: "withdraw", chainId: 1, address: governor1621.governor, functionName: "withdrawFeesAndRewards", value: 0n });
  });

  it("D-46: idr-legacy cannot withdraw through the resolver, so every item is refused", () => {
    expect(buildWithdrawCalls({ binding, family: family("idr-legacy-uint8"), localId: LOCAL_ID, beneficiary: BENEFICIARY, items: v2Items })).toEqual([
      { ok: false, refusal: "withdraw-unsupported" },
      { ok: false, refusal: "withdraw-unsupported" },
    ]);
  });

  it("D-46: escrow and view-only arbitrables have no withdrawal", () => {
    for (const [name, localId] of [
      ["escrow-v1", { kind: "transaction-id", value: 1n }],
      ["view-only", { kind: "not-applicable" }],
    ] as const) {
      expect(buildWithdrawCalls({ binding, family: family(name), localId, beneficiary: BENEFICIARY, items: v2Items })).toEqual([
        { ok: false, refusal: "withdraw-unsupported" },
        { ok: false, refusal: "withdraw-unsupported" },
      ]);
    }
  });

  it("D-49: an item of another dialect than the family's is refused, never sent with the wrong signature", () => {
    const builds = buildWithdrawCalls({
      binding,
      family: family("idr-v1"),
      localId: LOCAL_ID,
      beneficiary: BENEFICIARY,
      items: [
        v2Items[0] ?? { dialect: "idr-v2", ruling: 1n, amount: 1n },
        { dialect: "governor", session: 0n, round: 0n, listIndex: 0n, amount: 1n },
        { dialect: "idr-v1", ruling: 1n, amount: 1n },
      ],
    });
    expect(builds.slice(0, 2)).toEqual([
      { ok: false, refusal: "withdraw-unsupported" },
      { ok: false, refusal: "withdraw-unsupported" },
    ]);
    expect(selectorOf(expectCall(builds[2] ?? { ok: false, refusal: "withdraw-unsupported" }))).toBe(V1_WITHDRAW);
  });

  it("§5.15: an IDisputeResolver withdrawal without a resolved local ID is refused", () => {
    expect(buildWithdrawCalls({ binding, family: family("idr-v2"), localId: { kind: "unresolved", reason: "reverted" }, beneficiary: BENEFICIARY, items: v2Items })).toEqual([
      { ok: false, refusal: "local-id-unresolved" },
      { ok: false, refusal: "local-id-unresolved" },
    ]);
  });

  it("D-51: nothing to withdraw builds no call", () => {
    expect(buildWithdrawCalls({ binding, family: family("idr-v2"), localId: LOCAL_ID, beneficiary: BENEFICIARY, items: [] })).toEqual([]);
  });
});
