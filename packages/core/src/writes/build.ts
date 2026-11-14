import type { Abi, ContractFunctionName } from "viem";
import type { LocalIdResolution } from "../disputes/types";
import type { FamilyDetection } from "../families/types";
import type { WriteCall } from "../types";
import type { WriteBuild, WriteRefusal } from "./types";

type WriteFunctionName<TAbi extends Abi> = ContractFunctionName<TAbi, "payable" | "nonpayable">;

/** A built call, its arguments checked against its own ABI at compile time. */
export function built<const TAbi extends Abi, TFunctionName extends WriteFunctionName<TAbi>>(call: WriteCall<TAbi, TFunctionName>): WriteBuild {
  return { ok: true, call };
}

export function refused(refusal: WriteRefusal): WriteBuild {
  return { ok: false, refusal };
}

/**
 * The arbitrable's own dispute ID in the dialect the family reads it with: the IDisputeResolver
 * local ID, or the Escrow V1 transaction ID. `undefined` when it is unresolved or of the other dialect.
 */
export function arbitrableLocalId(family: FamilyDetection, localId: LocalIdResolution): bigint | undefined {
  const source = family.capabilities.localId;
  if (source === "externalIDtoLocalID" && localId.kind === "local-id") return localId.value;
  if (source === "disputeIDtoTransactionID" && localId.kind === "transaction-id") return localId.value;
  return undefined;
}
