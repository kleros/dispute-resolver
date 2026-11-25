import { deriveCompatibility, type Unavailable } from "@dispute-resolver/core";
import type { CaseDispute, CaseWriteContext } from "../../data";

type SubmitControl =
  | { readonly kind: "hidden" }
  | { readonly kind: "loading" }
  | { readonly kind: "unavailable"; readonly error: Unavailable }
  | { readonly kind: "view-only" }
  | { readonly kind: "unread"; readonly error: Unavailable }
  | { readonly kind: "available"; readonly context: CaseWriteContext };

export const EVIDENCE_NOT_ACCEPTED = "This arbitrable contract does not accept evidence through the Dispute Resolver.";

/** Evidence closes when the Execution period starts. */
export const LAST_EVIDENCE_PERIOD = 3;

// The compatibility banner above carries the reload and fallback advice.
const LOCAL_ID_UNREAD: Unavailable = { code: "rpc-error", message: "Some of this dispute's data could not be read." };

/**
 * A failed read of the write context is reported as such, never as an incompatible arbitrable. The control depends on
 * the write context alone, never on the evidence list, so a missing Dispute event does not hide submission. There is no
 * separate sign-in control: the upload signs in when needed.
 */
export function submitControl(dispute: CaseDispute): SubmitControl {
  const { lookup, write } = dispute;
  if (lookup.status !== "ready" || lookup.value.status !== "found" || lookup.value.dispute.period > LAST_EVIDENCE_PERIOD) return { kind: "hidden" };
  if (write.status === "loading") return { kind: "loading" };
  if (write.status === "unavailable") return { kind: "unavailable", error: write.error };
  switch (deriveCompatibility(write.value.family, write.value.localId)) {
    case "full":
      return { kind: "available", context: write.value };
    case "view-only":
      return { kind: "view-only" };
    case "unknown":
      return { kind: "unread", error: LOCAL_ID_UNREAD };
  }
}
