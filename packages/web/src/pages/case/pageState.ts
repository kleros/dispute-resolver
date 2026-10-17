import type { DisputeLookup } from "@dispute-resolver/core";
import type { CaseDispute } from "../../data";
import type { CasePageHook, CasePageState } from "../../parity";

/** The arbitrator's record once the lookup has found the dispute; the header renders from it before the view (P-20). */
export function foundDispute(dispute: CaseDispute): Extract<DisputeLookup, { status: "found" }> | undefined {
  const { lookup } = dispute;
  return lookup.status === "ready" && lookup.value.status === "found" ? lookup.value : undefined;
}

function lookupState(dispute: CaseDispute): CasePageState {
  const { lookup } = dispute;
  if (lookup.status === "loading") return "loading";
  if (lookup.status === "unavailable") return "unavailable";
  return lookup.value.status === "found" ? "dispute" : lookup.value.status;
}

/**
 * The `case-page` hook of a dispute (§12.1): the state from the lookup; the arbitrable (the arbitrator's, A22), the
 * period and the last period change as soon as the lookup found it (P-20); the family once detected (`unknown` when
 * detection failed, D-36); the compatibility and the Reality notice once the view has settled.
 */
export function casePageHook(dispute: CaseDispute): CasePageHook {
  const state = lookupState(dispute);
  const found = foundDispute(dispute);
  if (found === undefined) return { state };
  const { family, view } = dispute;
  const settled = view.status === "ready" && view.value.exists ? view.value : null;
  let detected: CasePageHook["family"] = null;
  if (family.status === "ready") detected = family.value.family;
  else if (family.status === "unavailable") detected = "unknown";
  return {
    state,
    arbitrable: found.binding.arbitrated,
    family: detected,
    period: found.dispute.period,
    lastPeriodChange: found.dispute.lastPeriodChange,
    compatibility: settled?.compatibility ?? null,
    realityNotice: settled?.realityNotice.kind ?? null,
  };
}
