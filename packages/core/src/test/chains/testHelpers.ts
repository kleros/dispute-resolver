import { getChain } from "../../chains/table";
import type { ChainConfig } from "../../chains/types";

/** The configuration of a chain the test knows is in the table; fails the test loudly when it is not. */
export function chainOf(id: number): ChainConfig {
  const chain = getChain(id);
  if (chain === undefined) throw new Error(`chain ${String(id)} is not in the table`);
  return chain;
}

/** A copy of the IDs in ascending order, so tests compare sets of chains without depending on table order. */
export function ascending(ids: readonly number[]): number[] {
  const copy = [...ids];
  copy.sort((a, b) => a - b);
  return copy;
}
