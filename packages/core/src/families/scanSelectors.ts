import type { Hex } from "../types";

const PUSH1 = 0x60;
const PUSH4 = 0x63;
const PUSH32 = 0x7f;

/**
 * The `PUSH4` operands of a contract's code, lowercase (06 §1): solc dispatches each external function by comparing
 * the call's selector with a `PUSH4` constant. The walk goes opcode by opcode and skips the immediate data of `PUSH1`
 * to `PUSH32`, so a `0x63` byte inside other push data is never read as an opcode. A `PUSH4` cut short by the end of
 * the code carries no selector.
 */
export function scanSelectors(code: Hex): ReadonlySet<Hex> {
  const hex = code.slice(2).toLowerCase();
  const byteLength = Math.floor(hex.length / 2);
  const byteAt = (index: number): number => Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  const selectors = new Set<Hex>();
  let index = 0;
  while (index < byteLength) {
    const opcode = byteAt(index);
    const dataLength = opcode >= PUSH1 && opcode <= PUSH32 ? opcode - PUSH1 + 1 : 0;
    const dataEnd = index + 1 + dataLength;
    if (opcode === PUSH4 && dataEnd <= byteLength) {
      selectors.add(`0x${hex.slice((index + 1) * 2, dataEnd * 2)}`);
    }
    index = dataEnd;
  }
  return selectors;
}
