import type { FamilyDetection } from "../families/types";
import type { Compatibility, LocalIdResolution } from "./types";

/**
 * `unknown` when a failed read leaves it open: the family, or the local ID of a family that needs one. `view-only` is
 * proven by the family or by the contract refusing the local-ID call; the kleros.eth governor is view-only by its
 * evidence capability alone and can still fund appeals.
 */
export function deriveCompatibility(family: FamilyDetection | undefined, localId: LocalIdResolution): Compatibility {
  if (family === undefined) return "unknown";
  const { capabilities } = family;
  if (capabilities.evidence.kind === "none") return "view-only";
  if (capabilities.localId === "none" || localId.kind !== "unresolved") return "full";
  return localId.reason === "rpc-error" ? "unknown" : "view-only";
}
