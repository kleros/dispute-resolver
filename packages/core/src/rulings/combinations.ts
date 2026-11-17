/** The answer of a multiple-select with no option ticked: combination 0, ruling 1. */
export const NONE_OF_THE_OPTIONS_TEXT = "None of the options";

/** The titles of the set bits, lowest bit first, joined as reality-eth-lib joins a multiple-select answer. */
export function combinationTitle(combination: bigint, titles: readonly string[]): string {
  if (combination === 0n) return NONE_OF_THE_OPTIONS_TEXT;
  return titles.filter((_, index) => ((combination >> BigInt(index)) & 1n) === 1n).join(" / ");
}

export function combinationCode(selectedIndexes: readonly number[]): bigint {
  let mask = 0n;
  for (const index of selectedIndexes) {
    if (!Number.isSafeInteger(index) || index < 0) throw new RangeError(`Option index ${String(index)} is not a non-negative integer`);
    mask |= 1n << BigInt(index);
  }
  return mask + 1n;
}

const HEX_KEY = /^0x[\da-f]+$/i;

/** The ruling code of a reserved option, whose key is its code in hex; `null` when the key is not hex. */
export function reservedCode(hexKey: string): bigint | null {
  return HEX_KEY.test(hexKey) ? BigInt(hexKey) : null;
}
