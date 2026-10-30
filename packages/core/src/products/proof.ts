import { size } from "viem";
import type { ArbitratedBinding } from "../disputes/types";
import type { Address, Hex, ReadClient } from "../types";

/**
 * Reads, from the arbitrable's own getters or storage, the fully funded rulings of the round its `rule()` used, and
 * throws when any step fails or proves nothing. The readers declare every integer output as `uint256`: viem decodes a
 * narrower type without masking it anyway, so each small field is range-checked on the full word instead.
 */
export type ProductReader = (client: ReadClient, binding: ArbitratedBinding) => Promise<readonly bigint[]>;

class NoProof extends Error {
  constructor() {
    super("The arbitrable's funding does not prove a ruling.");
    this.name = "NoProof";
  }
}

export function check(condition: boolean): asserts condition {
  if (!condition) throw new NoProof();
}

export function fitsBits(value: bigint, bits: bigint): boolean {
  return value < 1n << bits;
}

/** No submission or item seen on chain has more than four requests. */
const SCAN_CAP = 16n;

/** The first index below `count`, newest first and at most `SCAN_CAP` of them, that `visit` answers for. */
export async function newestFirst<T>(count: bigint, visit: (index: bigint) => Promise<T | undefined>): Promise<T> {
  for (let index = count - 1n; index >= 0n && count - index <= SCAN_CAP; index -= 1n) {
    const found = await visit(index);
    if (found !== undefined) return found;
  }
  throw new NoProof();
}

/** A side funded alone, as `rule()` reads it: 0 for none, else the party, which is its ruling. */
export function sideFunded(side: bigint): readonly bigint[] {
  check(side <= 2n);
  return side === 0n ? [] : [side];
}

/** Refuse to Arbitrate is never funded, and the second side funded in a round appeals it, so never both stay funded. */
export function paidSides(hasPaid: readonly [boolean, boolean, boolean]): readonly bigint[] {
  const [refused, requester, challenger] = hasPaid;
  check(!refused && !(requester && challenger));
  if (requester) return [1n];
  return challenger ? [2n] : [];
}

export function sameAddress(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

/** The raw answer of a view call, for the reads that check its length before decoding any of it. */
export async function rawCall(client: ReadClient, to: Address, data: Hex, minimumBytes: number): Promise<Hex> {
  const result = await client.request({ method: "eth_call", params: [{ to, data }, "latest"] });
  check(size(result) >= minimumBytes);
  return result;
}
