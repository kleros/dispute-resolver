import { EIP1967_IMPLEMENTATION_SLOT } from "../abi";
import { toRegistryAddress } from "../registry";
import type { Address, Hex, ReadClient } from "../types";

/** The EIP-1167 minimal-proxy runtime code: a fixed prefix, the 20-byte target, a fixed suffix (45 bytes in all). */
const EIP1167_CLONE = /^0x363d3d373d3d3d363d73[0-9a-f]{40}5af43d82803e903d91602b57fd5bf3$/i;

/** A storage word as a node returns it: at most 32 bytes of hex, possibly unpadded. */
const STORAGE_WORD = /^0x[0-9a-f]{0,64}$/i;

const ADDRESS_HEX_LENGTH = 40;
const WORD_HEX_LENGTH = 64;

/** Clones are never followed: their own code carries no selector, so they classify as view-only. */
export function isEip1167Clone(code: Hex): boolean {
  return EIP1167_CLONE.test(code);
}

/** An RPC error, an answer without a result or a malformed word rejects; none is ever read as "not a proxy". */
export async function readEip1967Implementation(client: ReadClient, address: Address): Promise<Address | null> {
  const word = await client.getStorageAt({ address, slot: EIP1967_IMPLEMENTATION_SLOT });
  if (word === undefined || !STORAGE_WORD.test(word)) throw new Error(`Malformed EIP-1967 implementation slot of ${address}`);
  const low = word.slice(2).padStart(WORD_HEX_LENGTH, "0").slice(-ADDRESS_HEX_LENGTH);
  if (BigInt(`0x${low}`) === 0n) return null;
  return toRegistryAddress(`0x${low}`);
}
