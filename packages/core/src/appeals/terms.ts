import type { FundingTerms } from "./types";

/**
 * When funding closes for the rulings other than the current one, or `null` when every ruling has one time, the appeal
 * period's end. A refuse-is-winner tie keeps two times: its cards fund the other rulings on the loser terms.
 */
export function losingDeadline({ tie, appealPeriodEnd, loserDeadline }: FundingTerms): number | null {
  if (tie === "shared-full-period" || tie === "all-winner" || loserDeadline >= appealPeriodEnd) return null;
  return loserDeadline;
}
