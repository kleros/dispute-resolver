/**
 * Test-only view of the recorded `eth_getCode` fixtures of the families module, reduced to what the
 * selector tests need: the code whose dispatcher carries the selectors (the implementation's code behind an EIP-1967
 * proxy, else the contract's own).
 */
import { z } from "../../zod";
import type { Hex } from "../../types";
import bytecode1 from "../../families/__fixtures__/bytecode-1.json";
import bytecode100 from "../../families/__fixtures__/bytecode-100.json";
import bytecode10200 from "../../families/__fixtures__/bytecode-10200.json";
import bytecode11155111 from "../../families/__fixtures__/bytecode-11155111.json";

const recordSchema = z.object({
  chainId: z.number(),
  blockNumber: z.number(),
  contracts: z.array(
    z.object({
      address: z.string(),
      label: z.string(),
      expectedFamily: z.string(),
      code: z.string(),
      eip1967Implementation: z.object({ address: z.string(), code: z.string() }).optional(),
    }),
  ),
});

export interface RecordedContract {
  readonly chainId: number;
  readonly blockNumber: number;
  readonly address: string;
  readonly label: string;
  readonly expectedFamily: string;
  /** The code a selector scan reads. */
  readonly dispatcherCode: string;
}

export const RECORDED_CONTRACTS: readonly RecordedContract[] = [bytecode1, bytecode100, bytecode10200, bytecode11155111].flatMap((raw) => {
  const record = recordSchema.parse(raw);
  return record.contracts.map((contract): RecordedContract => ({
    chainId: record.chainId,
    blockNumber: record.blockNumber,
    address: contract.address,
    label: contract.label,
    expectedFamily: contract.expectedFamily,
    dispatcherCode: contract.eip1967Implementation?.code ?? contract.code,
  }));
});

/** Solc dispatches a function with `PUSH4 <selector>` (`0x63`), so that is the operand a probe looks for. */
export function carriesSelector(contract: RecordedContract, selector: Hex): boolean {
  const operand = selector.toLowerCase().replace(/^0x/, "");
  return contract.dispatcherCode.toLowerCase().includes(`63${operand}`);
}

export function recordedByFamily(family: string): readonly RecordedContract[] {
  return RECORDED_CONTRACTS.filter((contract) => contract.expectedFamily === family);
}
