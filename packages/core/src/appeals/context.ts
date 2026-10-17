import { getAbiItem } from "viem";
import { idrV2Abi } from "../abi";
import type { LocalIdResolution } from "../disputes/types";
import type { Outcome } from "../types";
import { fail, succeed } from "./outcome";
import type { AppealContext } from "./types";

/** `Contribution(_localDisputeID indexed, _round indexed, ruling, _contributor indexed, _amount)`, shared by v1 and v2. */
export const CONTRIBUTION_EVENT = getAbiItem({ abi: idrV2Abi, name: "Contribution" });

/** `RulingFunded(_localDisputeID indexed, _round indexed, _ruling indexed)`. */
export const RULING_FUNDED_EVENT = getAbiItem({ abi: idrV2Abi, name: "RulingFunded" });

/**
 * Whether the detection describes the binding's arbitrable on the binding's chain. Every read targets the arbitrable the
 * arbitrator names (A22); a detection of another contract would apply its dialect to the wrong one.
 */
export function checkContext(context: AppealContext): Outcome<AppealContext> {
  const { family, binding } = context;
  if (family.chainId !== binding.chainId || family.arbitrable !== binding.arbitrated) {
    return fail("invalid-data", "The family detection does not describe this dispute's arbitrable.");
  }
  return succeed(context);
}

/** The local dispute ID the IDisputeResolver reads need (spec 5.3 step 2); an unresolved one keeps its failure kind. */
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

/**
 * The governor session of the dispute (D-47): the evidence group of its ERC-1497 `Dispute` event, which the governor
 * emits as `sessions.length − 1` when it creates the dispute (verified source). The governor's current session is not
 * used: it moves on once the ruling is executed (golden 1621: session 18, current session 24).
 */
export function governorSession(context: AppealContext): Outcome<bigint> {
  if (context.evidenceGroupId === undefined) return fail("not-found", "The governor session is unknown: the dispute's Dispute event was not read.");
  return succeed(context.evidenceGroupId);
}
