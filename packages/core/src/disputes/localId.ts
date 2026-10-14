import { escrowV1Abi, idrV2Abi } from "../abi";
import type { FamilyDetection } from "../families/types";
import { isContractFailure } from "../rpc";
import type { ReadClient } from "../types";
import type { ArbitratedBinding, LocalIdResolution } from "./types";

/**
 * The arbitrable's own ID for the dispute, by the family's local-ID source (spec 5.3 step 2): `externalIDtoLocalID` for
 * the IDisputeResolver families, `disputeIDtoTransactionID` for Escrow V1, none otherwise. The call goes to the
 * arbitrator's `arbitrated` (A22). A contract failure is `unresolved` / `reverted`, a transport failure `rpc-error`.
 * Today's `DisputeCreation` re-resolution is not run: KlerosLiquid records and emits the same arbitrable (D-11).
 */
export async function resolveLocalId(client: ReadClient, binding: ArbitratedBinding, family: FamilyDetection): Promise<LocalIdResolution> {
  const { arbitrated, disputeId } = binding;
  try {
    switch (family.capabilities.localId) {
      case "externalIDtoLocalID":
        return { kind: "local-id", value: await client.readContract({ address: arbitrated, abi: idrV2Abi, functionName: "externalIDtoLocalID", args: [disputeId] }) };
      case "disputeIDtoTransactionID":
        return {
          kind: "transaction-id",
          value: await client.readContract({ address: arbitrated, abi: escrowV1Abi, functionName: "disputeIDtoTransactionID", args: [disputeId] }),
        };
      case "none":
        return { kind: "not-applicable" };
    }
  } catch (error) {
    return { kind: "unresolved", reason: isContractFailure(error) ? "reverted" : "rpc-error" };
  }
}
