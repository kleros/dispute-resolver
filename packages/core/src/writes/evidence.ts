import { arbitrableProxyAbi, governorAbi } from "../abi";
import type { ArbitratedBinding, LocalIdResolution } from "../disputes/types";
import type { FamilyDetection } from "../families/types";
import type { CanonicalIpfsPath } from "../uri/types";
import { normalizeIpfsPath } from "../uri";
import { arbitrableLocalId, built, describesBinding, refused } from "./build";
import type { WriteBuild } from "./types";

/**
 * Evidence submission on the arbitrated contract with no value (spec 5.14, 6.2): `submitEvidence(localID, uri)` for
 * the local-ID dialect (the transaction ID for Escrow V1), `submitEvidence(uri)` for governors that have it. The
 * evidence upload result must be content-addressed and is written in canonical form (B16).
 */
export function buildSubmitEvidenceCall(input: {
  readonly binding: ArbitratedBinding;
  readonly family: FamilyDetection;
  readonly localId: LocalIdResolution;
  readonly evidenceUri: string;
}): WriteBuild {
  const { binding, family } = input;
  if (!describesBinding(binding, family)) return refused("family-mismatch");
  const target = { kind: "submit-evidence", chainId: binding.chainId, address: binding.arbitrated, value: 0n } as const;
  switch (family.capabilities.evidence.kind) {
    case "none":
      return refused("evidence-unsupported");
    case "uri-only":
      return withCanonicalUri(input.evidenceUri, (evidenceUri) => built({ ...target, abi: governorAbi, functionName: "submitEvidence", args: [evidenceUri] }));
    case "local-id": {
      const localId = arbitrableLocalId(family, input.localId);
      if (localId === undefined) return refused("local-id-unresolved");
      return withCanonicalUri(input.evidenceUri, (evidenceUri) => built({ ...target, abi: arbitrableProxyAbi, functionName: "submitEvidence", args: [localId, evidenceUri] }));
    }
  }
}

function withCanonicalUri(uri: string, build: (canonical: CanonicalIpfsPath) => WriteBuild): WriteBuild {
  const canonical = normalizeIpfsPath(uri);
  return canonical === null ? refused("not-content-addressed") : build(canonical);
}
