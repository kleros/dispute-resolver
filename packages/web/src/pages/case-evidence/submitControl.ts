import { deriveCompatibility, type Unavailable } from "@dispute-resolver/core";
import type { CaseDispute, CaseWriteContext } from "../../data";

type SubmitControl =
  | { readonly kind: "hidden" }
  | { readonly kind: "loading" }
  | { readonly kind: "unavailable"; readonly error: Unavailable }
  | { readonly kind: "view-only" }
  | { readonly kind: "available"; readonly context: CaseWriteContext };

/**
 * A failed read of the write context is reported as such, never as an incompatible arbitrable. The control depends on
 * the write context alone, never on the evidence list, so a missing Dispute event does not hide submission. There is no
 * separate sign-in control: the upload signs in when needed.
 */
export function submitControl(dispute: CaseDispute): SubmitControl {
  const { lookup, write } = dispute;
  if (lookup.status !== "ready" || lookup.value.status !== "found" || lookup.value.dispute.period > 3) return { kind: "hidden" };
  if (write.status === "loading") return { kind: "loading" };
  if (write.status === "unavailable") return { kind: "unavailable", error: write.error };
  return deriveCompatibility(write.value.family, write.value.localId) === "full" ? { kind: "available", context: write.value } : { kind: "view-only" };
}
