import { SELECTORS } from "../../abi";
import type { ProbeSignature } from "../../abi/types";
import type { ArbitratedBinding } from "../../disputes/types";
import { classifySelectors } from "../../families";
import type { FamilyDetection } from "../../families/types";
import { toRegistryAddress } from "../../registry";

export { recordedDetection } from "../families/testHelpers";
export { answer, callKey, fakeNode, reverting, rpcError, rpcLog, type CallReply, type FakeNodeSpec, type RpcLog } from "../rpc/testHelpers";

/**
 * A binding as `disputes.lookupDispute` creates it. The brand is only reachable through `disputes`, whose node reads
 * are not part of these unit tests, so the test double casts once here.
 */
export function testBinding(fields: { readonly chainId?: number; readonly disputeId: bigint; readonly arbitrated: string; readonly arbitrator?: string }): ArbitratedBinding {
  const binding = {
    chainId: fields.chainId ?? 1,
    disputeId: fields.disputeId,
    arbitrator: toRegistryAddress(fields.arbitrator ?? "0x988b3a538b618c7a603e1c11ab82cd16dbe28069"),
    arbitrated: toRegistryAddress(fields.arbitrated),
  };
  return binding as unknown as ArbitratedBinding;
}

export function detectionFor(arbitrable: string, signatures: readonly ProbeSignature[], chainId = 1): FamilyDetection {
  const selectors = signatures.map((signature) => SELECTORS[signature]);
  const { family, capabilities } = classifySelectors(new Set(selectors));
  return { chainId, arbitrable: toRegistryAddress(arbitrable), family, writeFamily: family, capabilities, realityProxy: null, implementation: null };
}

export const FAMILY_SIGNATURES = {
  "idr-v2": ["externalIDtoLocalID(uint256)", "submitEvidence(uint256,string)", "fundAppeal(uint256,uint256)", "getTotalWithdrawableAmount(uint256,address,uint256)"],
  "idr-v1": ["externalIDtoLocalID(uint256)", "submitEvidence(uint256,string)", "fundAppeal(uint256,uint256)", "getTotalWithdrawableAmount(uint256,address,uint256[])"],
  "idr-legacy-uint8": ["externalIDtoLocalID(uint256)", "submitEvidence(uint256,string)", "fundAppeal(uint256,uint8)"],
  "idr-legacy-uint256": ["externalIDtoLocalID(uint256)", "submitEvidence(uint256,string)", "fundAppeal(uint256,uint256)"],
  "escrow-v1": ["disputeIDtoTransactionID(uint256)", "submitEvidence(uint256,string)"],
  governor: ["submitEvidence(string)", "fundAppeal(uint256)", "getCurrentSessionNumber()"],
  "governor-no-evidence": ["fundAppeal(uint256)", "getCurrentSessionNumber()"],
  "view-only": [],
} as const satisfies Readonly<Record<string, readonly ProbeSignature[]>>;
