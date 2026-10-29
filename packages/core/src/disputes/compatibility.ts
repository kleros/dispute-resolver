import type { FamilyDetection } from "../families/types";
import type { Compatibility, LocalIdResolution } from "./types";

/** A view-only family can still fund appeals: the kleros.eth governor is view-only by its evidence capability alone. */
export function deriveCompatibility(family: FamilyDetection | undefined, localId: LocalIdResolution): Compatibility {
  if (family === undefined) return "view-only";
  const { capabilities } = family;
  if (capabilities.evidence.kind === "none") return "view-only";
  if (capabilities.localId !== "none" && localId.kind === "unresolved") return "view-only";
  return "full";
}
