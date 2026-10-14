import { deriveCompatibility, type Unavailable } from "@dispute-resolver/core";
import type { CaseDispute, CaseWriteContext } from "../../data";

/** What the evidence panel offers above the list (spec 5.14 "Submit control", D-52). */
export type SubmitControl =
  | { readonly kind: "hidden" } // no dispute, or the execution period
  | { readonly kind: "loading" } // the write context is still being read
  | { readonly kind: "unavailable"; readonly error: Unavailable } // the family or the details read failed: the reason and a Retry (D-36)
  | { readonly kind: "view-only" } // an incompatible arbitrable: "Go to Arbitrable Application to Submit Evidence", disabled
  | { readonly kind: "available"; readonly context: CaseWriteContext };

/**
 * The submit control of spec 5.14: shown in periods 0 to 3 only; enabled when the arbitrable is compatible (spec 5.5:
 * a known family with an evidence dialect and, when it needs one, a resolved local ID), disabled otherwise. A failed
 * read of the write context says so with its reason; it never claims the arbitrable is incompatible (D-36). It depends
 * on the dispute's write context alone, never on the evidence list, so a missing Dispute event does not hide
 * submission (D-36). There is no separate sign-in control: the upload signs in when needed (D-52).
 */
export function submitControl(dispute: CaseDispute): SubmitControl {
  const { lookup, write } = dispute;
  if (lookup.status !== "ready" || lookup.value.status !== "found" || lookup.value.dispute.period > 3) return { kind: "hidden" };
  if (write.status === "loading") return { kind: "loading" };
  if (write.status === "unavailable") return { kind: "unavailable", error: write.error };
  return deriveCompatibility(write.value.family, write.value.localId) === "full" ? { kind: "available", context: write.value } : { kind: "view-only" };
}
