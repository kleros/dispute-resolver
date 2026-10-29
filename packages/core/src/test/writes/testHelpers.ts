import { decodeFunctionData, encodeFunctionData, getAddress } from "viem";
import type { LocalIdResolution } from "../../disputes/types";
import { classifySelectors, scanSelectors } from "../../families";
import { RECORDED_CONTRACTS } from "../../families/__fixtures__/recorded";
import type { FamilyDetection } from "../../families/types";
import type { Address, Hex, WriteCall } from "../../types";
import type { WriteBuild } from "../../writes/types";

export { detectionFor, FAMILY_SIGNATURES, testBinding } from "../appeals/testHelpers";

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

export function expectCall(build: WriteBuild): WriteCall {
  if (!build.ok) throw new Error(`expected a call, got refusal ${build.refusal}`);
  return build.call;
}

export function calldata(call: WriteCall): Hex {
  return encodeFunctionData({ abi: call.abi, functionName: call.functionName, args: call.args });
}

export function selectorOf(call: WriteCall): Hex {
  return calldata(call).slice(0, 10) as Hex;
}

export function decodedArgs(call: WriteCall): readonly unknown[] {
  return decodeFunctionData({ abi: call.abi, data: calldata(call) }).args ?? [];
}

export const BENEFICIARY: Address = "0x00000000000000000000000000000000000000b1";
/** `BENEFICIARY` as decoded calldata reads it back (checksummed). */
export const DECODED_BENEFICIARY = getAddress(BENEFICIARY);
export const EVIDENCE_CID = "QmYs17mAJTaQwYeXNTb6n4idoQXmRcAjREeUdjJShNSeKh";
