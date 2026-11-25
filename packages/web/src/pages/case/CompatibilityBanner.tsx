import type { Compatibility, FamilyDetection, Outcome, Period } from "@dispute-resolver/core";
import { Notice } from "../../ui";
import { EVIDENCE_NOT_ACCEPTED, LAST_EVIDENCE_PERIOD } from "../case-evidence";

interface BannerCopy {
  readonly title: string;
  readonly body: string;
}

const UNREAD: BannerCopy = {
  title: "View mode only",
  body: "You can't submit evidence or fund appeals on this page. Some of this dispute's data could not be read. Reload the page to try reading it again. If it keeps failing, use the arbitrable application, if it has one.",
};

const NO_EVIDENCE: BannerCopy = {
  title: "Evidence can't be submitted on this interface",
  body: `${EVIDENCE_NOT_ACCEPTED} You can submit it on the arbitrable application, if implemented.`,
};

const INCOMPATIBLE: BannerCopy = {
  title: "View mode only for this dispute",
  body: "The arbitrable contract of this dispute is not compatible with the interface of Dispute Resolver. You can't submit evidence or fund appeals on this interface. You can do these on the arbitrable application, if implemented.",
};

/**
 * An arbitrable that refuses evidence can still fund appeals here, as the kleros.eth governor does. Once evidence closes
 * its banner has nothing left to say, since its rewards are withdrawn on this page; the other two still matter to anyone
 * who comes to withdraw.
 */
function bannerCopy(compatibility: Exclude<Compatibility, "full">, family: Outcome<FamilyDetection>, period: Period): BannerCopy | null {
  if (compatibility === "unknown") return UNREAD;
  if (family.ok && family.value.capabilities.evidence.kind === "none" && family.value.capabilities.appeal.kind !== "none") {
    return period <= LAST_EVIDENCE_PERIOD ? NO_EVIDENCE : null;
  }
  return INCOMPATIBLE;
}

interface CompatibilityBannerProps {
  readonly compatibility: Exclude<Compatibility, "full">;
  readonly family: Outcome<FamilyDetection>;
  readonly period: Period;
}

export function CompatibilityBanner({ compatibility, family, period }: CompatibilityBannerProps) {
  const copy = bannerCopy(compatibility, family, period);
  return copy === null ? null : <Notice variant="info" title={copy.title} body={copy.body} />;
}
