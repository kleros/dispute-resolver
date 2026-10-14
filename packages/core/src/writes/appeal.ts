import { escrowV1Abi, governorAbi, idrLegacyFundAppealAbi, idrV2Abi } from "../abi";
import type { ArbitratedBinding, LocalIdResolution } from "../disputes/types";
import type { FamilyDetection } from "../families/types";
import { arbitrableLocalId, built, describesBinding, isUint256, refused } from "./build";
import type { WriteBuild } from "./types";

/** The older resolver proxy's `fundAppeal(uint256,uint8)` alone, so the encoder cannot pick the other overload (D-46). */
const [, legacyUint8FundAppeal] = idrLegacyFundAppealAbi;
const fundAppealUint8Abi = [legacyUint8FundAppeal] as const;

const UINT8_MAX = 255n;

/**
 * Appeal funding of one ruling, paying `value` (spec 5.12 fund action): IDisputeResolver `fundAppeal(localID, ruling)`
 * through the selector the family carries (the `uint8` one of the older resolver proxy, D-46), or the governor's
 * `fundAppeal(listIndex)` (D-47). The governor's verified source maps a ruling to `listIndex = ruling − 1`; ruling 0,
 * "refuse to arbitrate", names no list. Escrow V1 appeals through `buildEscrowAppealCall` instead.
 */
export function buildFundAppealCall(input: {
  readonly binding: ArbitratedBinding;
  readonly family: FamilyDetection;
  readonly localId: LocalIdResolution;
  readonly ruling: bigint;
  readonly value: bigint;
}): WriteBuild {
  const { binding, family, ruling, value } = input;
  if (!describesBinding(binding, family)) return refused("family-mismatch");
  const target = { kind: "fund-appeal", chainId: binding.chainId, address: binding.arbitrated, value } as const;
  const appeal = family.capabilities.appeal;
  switch (appeal.kind) {
    case "governor": {
      const listIndex = ruling - 1n;
      if (!isUint256(listIndex)) return refused("ruling-out-of-range");
      return built({ ...target, abi: governorAbi, functionName: "fundAppeal", args: [listIndex] });
    }
    case "idr": {
      const localId = arbitrableLocalId(family, input.localId);
      if (localId === undefined) return refused("local-id-unresolved");
      if (appeal.fundAppeal === "fundAppeal(uint256,uint8)") {
        if (ruling < 0n || ruling > UINT8_MAX) return refused("ruling-out-of-range");
        return built({ ...target, abi: fundAppealUint8Abi, functionName: "fundAppeal", args: [localId, Number(ruling)] });
      }
      if (!isUint256(ruling)) return refused("ruling-out-of-range");
      return built({ ...target, abi: idrV2Abi, functionName: "fundAppeal", args: [localId, ruling] });
    }
    case "escrow-pay-cost":
    case "none":
      return refused("appeal-unsupported");
  }
}

/** Escrow V1's `appeal(transactionID)` paying the arbitrator's appeal cost (spec 10.2); only for `escrow-pay-cost`. */
export function buildEscrowAppealCall(input: {
  readonly binding: ArbitratedBinding;
  readonly family: FamilyDetection;
  readonly localId: LocalIdResolution;
  readonly appealCost: bigint;
}): WriteBuild {
  const { binding, family, appealCost } = input;
  if (!describesBinding(binding, family)) return refused("family-mismatch");
  if (family.capabilities.appeal.kind !== "escrow-pay-cost") return refused("appeal-unsupported");
  const transactionId = arbitrableLocalId(family, input.localId);
  if (transactionId === undefined) return refused("local-id-unresolved");
  return built({
    kind: "escrow-appeal",
    chainId: binding.chainId,
    address: binding.arbitrated,
    abi: escrowV1Abi,
    functionName: "appeal",
    args: [transactionId],
    value: appealCost,
  });
}
