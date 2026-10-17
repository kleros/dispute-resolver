/** The title of a multiple-select combination (spec 5.12 item 4): "None" for 0, else its set bits' titles, lowest bit first. */
export function combinationTitle(combination: bigint, titles: readonly string[]): string {
  if (combination === 0n) return "None";
  return titles.filter((_, index) => ((combination >> BigInt(index)) & 1n) === 1n).join(" ");
}

/** The ruling code of the combination of the selected option indexes: the bitmask + 1 (spec 5.12 item 4, D-33). */
export function combinationCode(selectedIndexes: readonly number[]): bigint {
  let mask = 0n;
  for (const index of selectedIndexes) {
    if (!Number.isSafeInteger(index) || index < 0) throw new RangeError(`Option index ${String(index)} is not a non-negative integer`);
    mask |= 1n << BigInt(index);
  }
  return mask + 1n;
}

const HEX_KEY = /^0x[\da-f]+$/i;

/** The ruling code of a reserved option, whose key is its code in hex (spec 5.12 item 2); `null` when the key is not hex. */
export function reservedCode(hexKey: string): bigint | null {
  return HEX_KEY.test(hexKey) ? BigInt(hexKey) : null;
}
