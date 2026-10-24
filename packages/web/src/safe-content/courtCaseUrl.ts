import type { ChainId } from "@dispute-resolver/core";

const COURT_ORIGIN = "https://court.kleros.io";

/** Built with `new URL` so no dispute ID can leave its path segment. */
export function courtCaseUrl(disputeId: bigint, chainId: ChainId): string {
  const url = new URL(`/cases/${encodeURIComponent(disputeId.toString())}`, COURT_ORIGIN);
  url.searchParams.set("requiredChainId", String(chainId));
  return url.toString();
}
