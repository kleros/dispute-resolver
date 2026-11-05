import type { CanonicalIpfsPath } from "../uri/types";
import type { EvidenceDocument } from "./types";

export function buildEvidenceDocument(input: { readonly name: string; readonly description: string; readonly fileUri: CanonicalIpfsPath | null }): EvidenceDocument {
  return { name: input.name, description: input.description, fileURI: input.fileUri ?? "", evidenceSide: 0 };
}
