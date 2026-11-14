import type { AppealPanel, FundingTerms, LosingSideDeadline } from "./types";

/**
 * When funding closes for the rulings other than the current one, or `null` when every ruling has one time, the appeal
 * period's end. A refuse-is-winner tie keeps two times: its cards fund the other rulings on the loser terms.
 */
export function losingDeadline({ tie, appealPeriodEnd, loserDeadline }: FundingTerms): number | null {
  if (tie === "shared-full-period" || tie === "all-winner" || loserDeadline >= appealPeriodEnd) return null;
  return loserDeadline;
}

function fromTerms(terms: FundingTerms): LosingSideDeadline | null {
  const at = losingDeadline(terms);
  return at === null ? null : { kind: "deadline", at };
}

/**
 * The losing side's funding time as the appeal panel knows it: `unknown` where the dispute can be appealed but its times
 * cannot be read here, `null` where there is no earlier time to tell or no funding at all.
 */
export function losingSideDeadline(panel: AppealPanel): LosingSideDeadline | null {
  switch (panel.kind) {
    case "crowdfunding":
    case "handled-by-arbitrable":
      return panel.terms === undefined ? { kind: "unknown" } : fromTerms(panel.terms);
    case "funding-unsupported":
    case "fees-unavailable":
      return { kind: "unknown" };
    case "hidden":
    case "not-appealable":
    case "escrow-appeal":
    case "escrow-ended":
    case "withdraw":
    case "withdraw-unsupported":
      return null;
  }
}
