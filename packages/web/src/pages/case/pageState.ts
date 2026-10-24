import type { DisputeLookup } from "@dispute-resolver/core";
import type { CaseDispute } from "../../data";

/** Lets the header render from the arbitrator's record before the view has loaded. */
export function foundDispute(dispute: CaseDispute): Extract<DisputeLookup, { status: "found" }> | undefined {
  const { lookup } = dispute;
  return lookup.status === "ready" && lookup.value.status === "found" ? lookup.value : undefined;
}
