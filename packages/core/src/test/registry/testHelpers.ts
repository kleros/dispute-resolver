import { toRegistryAddress } from "../../registry/address";
import type { Address } from "../../types";

/** The wallet-hijack script of mainnet dispute 1684, which must never be allowlisted (A1, 06 §3 invariant 4). */
export const DISPUTE_1684_SCRIPT = "QmVkffjdrtLVsRxybdB2xSidamnUrvck3FVxmKxJz6eD7f";

/** The script override of mainnet dispute 1621, removed by D-25. */
export const DISPUTE_1621_OVERRIDE = "Qmf1k727vP7qZv21MDB8vwL6tfVEKPCUQAiw8CTfHStkjf";

/** The script named by the meta-evidence of mainnet dispute 1621, which runs in place of the override (D-25). */
export const DISPUTE_1621_SCRIPT = "QmdpXXmNxmdmLqZCabRUC9bZ65c2BN54EuUTRi5SdtiHQ4";

/** The second "Unslashed" address, removed by D-27: it has no code on any checked chain. */
export const REMOVED_UNSLASHED_ADDRESS = "0xb9f9b5eee2ad29098b9b3ea0b401571f5da4ad81";

/** Unslashed on mainnet, checksummed as the chain and the old app report it. */
export const UNSLASHED_CHECKSUMMED = "0xe0e1bc8C6cd1B81993e2Fcfb80832d814886eA38";

/** An address literal typed as the lowercase core `Address`, validated like any registry input. */
export function addr(value: string): Address {
  return toRegistryAddress(value);
}

/** A sorted copy, so tests compare sets without depending on declaration order. */
export function sortedStrings(values: readonly string[]): string[] {
  return [...values].sort((a, b) => a.localeCompare(b));
}

/** The arbitrator chain of a registry key, as written. */
export function chainOfKey(key: string): string {
  return key.slice(0, key.indexOf(":"));
}

/** The address of a registry key, as written. */
export function addressOfKey(key: string): string {
  return key.slice(key.indexOf(":") + 1);
}
