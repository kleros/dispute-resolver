import type { Hex } from "../types";
import type { ProbeSignature } from "./types";

/**
 * The 4-byte selectors the family probes look for in a contract's dispatcher bytecode (06 §1). The values are written
 * out and proven against the published artifacts and the verified sources in `selectors.test.ts`, so a transcription
 * typo cannot survive.
 */
export const SELECTORS: Readonly<Record<ProbeSignature, Hex>> = {
  "disputeIDtoTransactionID(uint256)": "0x2fbe3b03",
  "externalIDtoLocalID(uint256)": "0xc21ae061",
  "submitEvidence(string)": "0xbac91e2e",
  "submitEvidence(uint256,string)": "0xa6a7f0eb",
  "fundAppeal(uint256)": "0xa446ff57",
  "getCurrentSessionNumber()": "0x6c0b7e71",
  "getTotalWithdrawableAmount(uint256,address,uint256)": "0xec85635b",
  "getTotalWithdrawableAmount(uint256,address,uint256[])": "0xc25516e9",
  "fundAppeal(uint256,uint256)": "0x4b2f0ea0",
  "fundAppeal(uint256,uint8)": "0x12b3a2c0",
};

/** The EIP-1967 implementation slot, `keccak256("eip1967.proxy.implementation") - 1`: where an upgradeable proxy keeps its logic address (C11). */
export const EIP1967_IMPLEMENTATION_SLOT: Hex = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
