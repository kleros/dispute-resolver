import type { ChainIdField } from "./types";

/**
 * The chain an evidence display is told a meta-evidence chain ID names, which also keys the display allowlist. Every
 * allowlist key is a configured chain, so an `unsupported` number never matches one and the display stays strict.
 */
export function displayChainId(field: ChainIdField, arbitratorChainId: number): number {
  switch (field.status) {
    case "valid":
    case "unsupported":
      return field.chainId;
    case "absent":
    case "invalid":
      return arbitratorChainId;
  }
}
