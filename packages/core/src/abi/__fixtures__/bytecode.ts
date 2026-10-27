/**
 * Test-only view of the recorded `eth_getCode` fixtures of the families module, reduced to what the
 * selector tests need: the code whose dispatcher carries the selectors (the implementation's code behind an EIP-1967
 * proxy, else the contract's own).
 */
import type { Hex } from "../../types";
import { RECORDED_CONTRACTS as RECORDED } from "../../families/__fixtures__/recorded";

export interface RecordedContract {
  readonly address: string;
  readonly expectedFamily: string;
  /** The code a selector scan reads. */
  readonly dispatcherCode: string;
}

const RECORDED_CONTRACTS: readonly RecordedContract[] = RECORDED.map((contract) => ({
  address: contract.address,
  expectedFamily: contract.expectedFamily,
  dispatcherCode: contract.implementation?.code ?? contract.code,
}));

/** Solc dispatches a function with `PUSH4 <selector>` (`0x63`), so that is the operand a probe looks for. */
export function carriesSelector(contract: RecordedContract, selector: Hex): boolean {
  const operand = selector.toLowerCase().replace(/^0x/, "");
  return contract.dispatcherCode.toLowerCase().includes(`63${operand}`);
}

export function recordedByFamily(family: string): readonly RecordedContract[] {
  return RECORDED_CONTRACTS.filter((contract) => contract.expectedFamily === family);
}
