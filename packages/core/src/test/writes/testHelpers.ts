import { decodeFunctionData, encodeFunctionData, getAddress } from "viem";
import { SELECTORS } from "../../abi";
import type { ProbeSignature } from "../../abi/types";
import type { ArbitratedBinding, LocalIdResolution } from "../../disputes/types";
import { classifySelectors, scanSelectors } from "../../families";
import { RECORDED_CONTRACTS } from "../../families/__fixtures__/recorded";
import type { FamilyDetection } from "../../families/types";
import { toRegistryAddress } from "../../registry";
import type { Address, ChainId, Hex, WriteCall } from "../../types";
import type { WriteBuild } from "../../writes/types";

/**
 * A binding as `disputes.lookupDispute` creates it. The brand is only reachable through `disputes`, which is not built
 * in these unit tests, so the test double casts once here.
 */
export function testBinding(fields: { readonly chainId: ChainId; readonly disputeId: bigint; readonly arbitrated: string; readonly arbitrator?: string }): ArbitratedBinding {
  const binding = {
    chainId: fields.chainId,
    disputeId: fields.disputeId,
    arbitrator: toRegistryAddress(fields.arbitrator ?? "0x988b3a538b618c7a603e1c11ab82cd16dbe28069"),
    arbitrated: toRegistryAddress(fields.arbitrated),
  };
  return binding as unknown as ArbitratedBinding;
}

/** A detection of `arbitrable` whose code carries exactly the probe selectors of `signatures`, classified by `families`. */
export function detectionFor(chainId: ChainId, arbitrable: string, signatures: readonly ProbeSignature[]): FamilyDetection {
  const selectors = signatures.map((signature) => SELECTORS[signature]);
  const { family, capabilities } = classifySelectors(new Set(selectors));
  return { chainId, arbitrable: toRegistryAddress(arbitrable), family, writeFamily: family, capabilities, realityProxy: null, implementation: null };
}

/** Probe signatures of each family's typical code. */
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

/** One recorded contract with its dispatcher's selectors and the detection `families` gives its code. */
export interface RecordedDetection {
  readonly label: string;
  readonly blockNumber: number;
  readonly detection: FamilyDetection;
  /** Every `PUSH4` operand of the dispatcher code: the selectors the contract can be called with. */
  readonly dispatcher: ReadonlySet<Hex>;
}

/** Detections of every recorded contract that is not a registered Reality proxy, from its recorded bytecode. */
export function recordedDetections(): readonly RecordedDetection[] {
  return RECORDED_CONTRACTS.filter((contract) => contract.expectedFamily !== "reality-proxy").map((contract) => {
    const dispatcher = scanSelectors(contract.implementation?.code ?? contract.code);
    const { family, capabilities } = classifySelectors(dispatcher);
    const detection: FamilyDetection = {
      chainId: contract.chainId,
      arbitrable: contract.address,
      family,
      writeFamily: family,
      capabilities,
      realityProxy: null,
      implementation: contract.implementation?.address ?? null,
    };
    return { label: contract.label, blockNumber: contract.blockNumber, detection, dispatcher };
  });
}

/** The local ID resolution `disputes` gives a dispute of `detection`'s family, resolved to `value` where it has one. */
export function localIdFor(detection: FamilyDetection, value: bigint): LocalIdResolution {
  switch (detection.capabilities.localId) {
    case "externalIDtoLocalID":
      return { kind: "local-id", value };
    case "disputeIDtoTransactionID":
      return { kind: "transaction-id", value };
    case "none":
      return { kind: "not-applicable" };
  }
}

/** The call of a build that must succeed; fails the test with the refusal otherwise. */
export function expectCall(build: WriteBuild): WriteCall {
  if (!build.ok) throw new Error(`expected a call, got refusal ${build.refusal}`);
  return build.call;
}

/** The calldata the wallet would sign for `call`. */
export function calldata(call: WriteCall): Hex {
  return encodeFunctionData({ abi: call.abi, functionName: call.functionName, args: call.args });
}

/** The 4-byte selector of the calldata of `call`. */
export function selectorOf(call: WriteCall): Hex {
  return calldata(call).slice(0, 10) as Hex;
}

/** The arguments the calldata of `call` decodes to, through the call's own ABI. */
export function decodedArgs(call: WriteCall): readonly unknown[] {
  return decodeFunctionData({ abi: call.abi, data: calldata(call) }).args ?? [];
}

export const BENEFICIARY: Address = "0x00000000000000000000000000000000000000b1";
/** `BENEFICIARY` as decoded calldata reads it back (checksummed). */
export const DECODED_BENEFICIARY = getAddress(BENEFICIARY);
export const EVIDENCE_CID = "QmYs17mAJTaQwYeXNTb6n4idoQXmRcAjREeUdjJShNSeKh";
