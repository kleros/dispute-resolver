import type { ChainId, MetaEvidence } from "@dispute-resolver/core";
import { APP_CONFIG } from "../../env";
import { buildEvidenceDisplay, EvidenceDisplayFrame } from "../../safe-content";
import { useCoreDeps } from "../../data";
import type { FoundLookup } from "./caseState";

interface EvidenceDisplayProps {
  readonly metaEvidence: MetaEvidence;
  /** The page chain, the arbitrator's chain. */
  readonly chainId: ChainId;
  readonly found: FoundLookup;
}

/**
 * The meta-evidence's evidence-display iframe (spec 9.4, A8, B6, C5, D-26, D-34, D-35), or nothing when it names no https
 * display. The arbitrable and the arbitrator come from the arbitrator's binding, never from meta-evidence (A22).
 */
export function EvidenceDisplay({ metaEvidence, chainId, found }: EvidenceDisplayProps) {
  const { env, gateway } = useCoreDeps();
  const { binding } = found;
  const model = buildEvidenceDisplay({
    metaEvidence,
    arbitratorChainId: chainId,
    disputeId: binding.disputeId,
    arbitrable: binding.arbitrated,
    arbitrator: binding.arbitrator,
    env,
    gateway,
    appOrigin: APP_CONFIG.appOrigin,
  });
  return model === null ? null : <EvidenceDisplayFrame model={model} />;
}
