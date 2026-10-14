import type { ChainId } from "@dispute-resolver/core";

const COURT_ORIGIN = "https://court.kleros.io";

/** The Court page of a dispute (spec 5.2, spec 5.13), built with `new URL` so no dispute ID can leave its path segment (A18). */
export function courtCaseUrl(disputeId: bigint, chainId: ChainId): string {
  const url = new URL(`/cases/${encodeURIComponent(disputeId.toString())}`, COURT_ORIGIN);
  url.searchParams.set("requiredChainId", String(chainId));
  return url.toString();
}
