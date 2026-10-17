import type { DisputeLookup, DisputeView, Outcome } from "@dispute-resolver/core";
import type { CaseDispute, SectionData } from "../../data";

export type FoundLookup = Extract<DisputeLookup, { status: "found" }>;
export type ExistingView = Extract<DisputeView, { exists: true }>;

/** The arbitrator's record of the dispute once the lookup found it; the header renders from it before `view` settles (P-20). */
export function foundLookup(dispute: CaseDispute): FoundLookup | undefined {
  const { lookup } = dispute;
  return lookup.status === "ready" && lookup.value.status === "found" ? lookup.value : undefined;
}

/**
 * The view of a dispute that exists, still loading, or unavailable; `null` when the lookup found no dispute, a state the
 * case page renders itself (spec 5.4, D-53).
 */
export function existingView(dispute: CaseDispute): SectionData<ExistingView> | null {
  const { view } = dispute;
  if (view.status !== "ready") return view;
  return view.value.exists ? { status: "ready", value: view.value } : null;
}

/** One field of the view as its own section state, so a failed field degrades only what shows it (D-36). */
export function viewField<T>(view: SectionData<ExistingView>, pick: (value: ExistingView) => Outcome<T>): SectionData<T> {
  if (view.status !== "ready") return view;
  const outcome = pick(view.value);
  return outcome.ok ? { status: "ready", value: outcome.value } : { status: "unavailable", error: outcome.error };
}
