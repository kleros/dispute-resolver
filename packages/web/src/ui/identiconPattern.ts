import { hexToBytes, isHex } from "viem";

/** Token fills for the cells; the background is a token too, so the icon follows light and dark mode. */
const IDENTICON_FILLS = [
  "fill-klerosUIComponentsPrimaryPurple",
  "fill-klerosUIComponentsSecondaryPurple",
  "fill-klerosUIComponentsPrimaryBlue",
  "fill-klerosUIComponentsTint",
  "fill-klerosUIComponentsSuccess",
  "fill-klerosUIComponentsWarning",
] as const;

type IdenticonFill = (typeof IDENTICON_FILLS)[number];

interface IdenticonPattern {
  readonly cells: readonly (readonly boolean[])[];
  readonly fill: IdenticonFill;
}

const GRID = 5;
const HALF = 3;

function seedBytes(address: string): Uint8Array {
  const value = address.toLowerCase();
  if (isHex(value) && value.length > 2) {
    return hexToBytes(value.length % 2 === 0 ? value : `0x0${value.slice(2)}`);
  }
  return new TextEncoder().encode(value);
}

/** Any string is accepted; the same address in any case gives the same pattern. */
export function identiconPattern(address: string): IdenticonPattern {
  const bytes = seedBytes(address);
  const byteAt = (position: number): number => (bytes.length === 0 ? 0 : (bytes[position % bytes.length] ?? 0));
  const cells = Array.from({ length: GRID }, (_, row) => {
    const half = Array.from({ length: HALF }, (_, column) => byteAt(row * HALF + column) % 2 === 1);
    return [...half, ...half.slice(0, HALF - 1).reverse()];
  });
  let colorSeed = 0;
  for (let position = GRID * HALF; position < Math.max(bytes.length, GRID * HALF + 1); position += 1) {
    colorSeed += byteAt(position);
  }
  return { cells, fill: IDENTICON_FILLS[colorSeed % IDENTICON_FILLS.length] ?? IDENTICON_FILLS[0] };
}
