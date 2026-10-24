import type { FamilyDetection } from "../families/types";
import type { Compatibility, LocalIdResolution } from "./types";

/**
 * `view-only` when the family is unknown, takes no evidence, or needs a local ID that could not be resolved. A view-only
 * family can still fund appeals: the kleros.eth governor is view-only by its evidence capability alone.
 */
export function deriveCompatibility(family: FamilyDetection | undefined, localId: LocalIdResolution): Compatibility {
  if (family === undefined) return "view-only";
  const { capabilities } = family;
  if (capabilities.evidence.kind === "none") return "view-only";
  if (capabilities.localId !== "none" && localId.kind === "unresolved") return "view-only";
  return "full";
}
