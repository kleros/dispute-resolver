import type { ResolvedChain } from "../routing";

/** What the pill and the footer say in place of a chain name when the URL names a chain that is not configured. */
export const UNSUPPORTED_NETWORK_LABEL = "Unsupported Network";

/** The URL names a chain that is not configured, as opposed to a configured chain's 404. */
export function isUnsupportedNetwork(resolvedChain: ResolvedChain): boolean {
  return resolvedChain.kind === "fallback" && resolvedChain.unsupportedSegment !== null;
}
