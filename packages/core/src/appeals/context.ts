import { getAbiItem } from "viem";
import { idrV2Abi } from "../abi";
import { describesBinding } from "../disputes/localId";
import type { LocalIdResolution } from "../disputes/types";
import type { Outcome } from "../types";
import { fail, succeed } from "../outcome";
import type { AppealContext } from "./types";

/** `Contribution(_localDisputeID indexed, _round indexed, ruling, _contributor indexed, _amount)`, shared by v1 and v2. */
export const CONTRIBUTION_EVENT = getAbiItem({ abi: idrV2Abi, name: "Contribution" });

export const RULING_FUNDED_EVENT = getAbiItem({ abi: idrV2Abi, name: "RulingFunded" });

export function checkContext(context: AppealContext): Outcome<AppealContext> {
  return describesBinding(context.binding, context.family) ? succeed(context) : fail("invalid-data", "The family detection does not describe this dispute's arbitrable.");
}

/** The local dispute ID the IDisputeResolver reads need; an unresolved one keeps its failure kind. */
export function idrLocalId(localId: LocalIdResolution): Outcome<bigint> {
  switch (localId.kind) {
    case "local-id":
      return succeed(localId.value);
    case "unresolved":
      return fail(localId.reason, "The arbitrable's local dispute ID could not be read.");
    case "transaction-id":
    case "not-applicable":
      return fail("unsupported", "The arbitrable has no IDisputeResolver local dispute ID.");
  }
}

/** The governor session is the evidence group of the dispute's ERC-1497 `Dispute` event: `sessions.length − 1` at creation. */
export function governorSession(context: AppealContext): Outcome<bigint> {
  if (context.evidenceGroupId === undefined) return fail("not-found", "The governor session is unknown: the dispute's Dispute event was not read.");
  return succeed(context.evidenceGroupId);
}
