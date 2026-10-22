import { governorAbi, idrV1Abi, idrV2Abi } from "../abi";
import type { WithdrawItem } from "../appeals/types";
import type { ArbitratedBinding, LocalIdResolution } from "../disputes/types";
import type { FamilyDetection } from "../families/types";
import type { Address } from "../types";
import { arbitrableLocalId, built, describesBinding, refused } from "./build";
import type { WriteBuild } from "./types";

/**
 * One transaction per item, with no value, indexed like `items`. idr-v2 sends
 * `withdrawFeesAndRewardsForAllRounds(localID, beneficiary, ruling)`, idr-v1 the same with `[ruling]`, governors
 * `withdrawFeesAndRewards(beneficiary, session, round, listIndex)`. idr-legacy, Escrow V1 and view-only arbitrables
 * refuse every item, and so does an item whose dialect is not the family's.
 */
export function buildWithdrawCalls(input: {
  readonly binding: ArbitratedBinding;
  readonly family: FamilyDetection;
  readonly localId: LocalIdResolution;
  readonly beneficiary: Address;
  readonly items: readonly WithdrawItem[];
}): readonly WriteBuild[] {
  const { binding, family, beneficiary } = input;
  const localId = arbitrableLocalId(family, input.localId);
  const target = { kind: "withdraw", chainId: binding.chainId, address: binding.arbitrated, value: 0n } as const;
  return input.items.map((item): WriteBuild => {
    if (!describesBinding(binding, family)) return refused("family-mismatch");
    if (item.dialect !== family.capabilities.withdraw.kind) return refused("withdraw-unsupported");
    if (item.dialect === "governor") {
      return built({ ...target, abi: governorAbi, functionName: "withdrawFeesAndRewards", args: [beneficiary, item.session, item.round, item.listIndex] });
    }
    if (localId === undefined) return refused("local-id-unresolved");
    if (item.dialect === "idr-v1") {
      return built({ ...target, abi: idrV1Abi, functionName: "withdrawFeesAndRewardsForAllRounds", args: [localId, beneficiary, [item.ruling]] });
    }
    return built({ ...target, abi: idrV2Abi, functionName: "withdrawFeesAndRewardsForAllRounds", args: [localId, beneficiary, item.ruling] });
  });
}
