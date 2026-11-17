import { escrowV1Abi, governorAbi, idrV2Abi } from "../abi";
import type { ArbitratedBinding, LocalIdResolution } from "../disputes/types";
import type { FamilyDetection } from "../families/types";
import { isUint256 } from "../bigint";
import { describesBinding } from "../disputes/localId";
import { arbitrableLocalId, built, refused } from "./build";
import type { WriteBuild } from "./types";

/**
 * IDisputeResolver `fundAppeal(localID, ruling)`, or the governor's `fundAppeal(listIndex)`. The governor's verified
 * source maps a ruling to `listIndex = ruling − 1`; ruling 0, "refuse to arbitrate", names no list. Refused from the
 * card's deadline on (`nowSeconds` is the chain's time), since the contracts accept a contribution only strictly
 * before it. Escrow V1 appeals through `buildEscrowAppealCall` instead.
 */
export function buildFundAppealCall(input: {
  readonly binding: ArbitratedBinding;
  readonly family: FamilyDetection;
  readonly localId: LocalIdResolution;
  readonly ruling: bigint;
  readonly value: bigint;
  /** The funded card's deadline. */
  readonly deadline: number;
  readonly nowSeconds: number;
}): WriteBuild {
  const { binding, family, ruling, value } = input;
  if (!describesBinding(binding, family)) return refused("family-mismatch");
  const target = { kind: "fund-appeal", chainId: binding.chainId, address: binding.arbitrated, value } as const;
  const appeal = family.capabilities.appeal;
  if (appeal.kind !== "governor" && appeal.kind !== "idr") return refused("appeal-unsupported");
  if (input.nowSeconds >= input.deadline) return refused("funding-closed");
  switch (appeal.kind) {
    case "governor": {
      const listIndex = ruling - 1n;
      if (!isUint256(listIndex)) return refused("ruling-out-of-range");
      return built({ ...target, abi: governorAbi, functionName: "fundAppeal", args: [listIndex] });
    }
    case "idr": {
      const localId = arbitrableLocalId(family, input.localId);
      if (localId === undefined) return refused("local-id-unresolved");
      if (!isUint256(ruling)) return refused("ruling-out-of-range");
      return built({ ...target, abi: idrV2Abi, functionName: "fundAppeal", args: [localId, ruling] });
    }
  }
}

/** Escrow V1 appeals by paying the arbitrator's whole appeal cost, not by crowdfunding. */
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
