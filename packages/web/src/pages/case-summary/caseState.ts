import type { DisputeView, Outcome } from "@dispute-resolver/core";
import { fromOutcome, type CaseDispute, type SectionData } from "../../data";

export type ExistingView = Extract<DisputeView, { exists: true }>;

/** `null` when the lookup found no dispute, a state the case page renders itself. */
export function existingView(dispute: CaseDispute): SectionData<ExistingView> | null {
  const { view } = dispute;
  if (view.status !== "ready") return view;
  return view.value.exists ? { status: "ready", value: view.value } : null;
}

/** One field of the view as its own section state, so a failed field degrades only what shows it. */
export function viewField<T>(view: SectionData<ExistingView>, pick: (value: ExistingView) => Outcome<T>): SectionData<T> {
  return view.status === "ready" ? fromOutcome(pick(view.value)) : view;
}
