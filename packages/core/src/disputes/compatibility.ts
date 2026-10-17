import type { FamilyDetection } from "../families/types";
import type { Compatibility, LocalIdResolution } from "./types";

/**
 * Whether the case page offers evidence submission and the dispute's own actions (spec 5.5, 04 §1 `compatibility`):
 * `view-only` when the family is unknown, cannot take evidence, or needs a local ID that could not be resolved. The
 * kleros.eth governor is view-only by its evidence capability while still funding appeals (D-47); idr-legacy is full
 * (D-46).
 */
export function deriveCompatibility(family: FamilyDetection | undefined, localId: LocalIdResolution): Compatibility {
  if (family === undefined) return "view-only";
  const { capabilities } = family;
  if (capabilities.evidence.kind === "none") return "view-only";
  if (capabilities.localId !== "none" && localId.kind === "unresolved") return "view-only";
  return "full";
}
