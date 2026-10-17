import type { DisputeLookup } from "@dispute-resolver/core";
import type { CaseDispute } from "../../data";

/** The arbitrator's record once the lookup has found the dispute; the header renders from it before the view (P-20). */
export function foundDispute(dispute: CaseDispute): Extract<DisputeLookup, { status: "found" }> | undefined {
  const { lookup } = dispute;
  return lookup.status === "ready" && lookup.value.status === "found" ? lookup.value : undefined;
}
