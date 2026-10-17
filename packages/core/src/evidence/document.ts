import type { CanonicalIpfsPath } from "../uri/types";
import type { EvidenceDocument } from "./types";

/** The evidence JSON the app uploads before `submitEvidence` (spec 5.14 step 1). The supporting side is always 0. */
export function buildEvidenceDocument(input: { readonly name: string; readonly description: string; readonly fileUri: CanonicalIpfsPath | null }): EvidenceDocument {
  return { name: input.name, description: input.description, fileURI: input.fileUri ?? "", evidenceSide: 0 };
}
