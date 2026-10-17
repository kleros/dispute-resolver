import type { FamilyDetection } from "../families/types";
import { realityNotice } from "../metaEvidence";
import type { MetaEvidenceResult, RealityNotice } from "../metaEvidence/types";
import type { FallbackOutcomes, RulingOptions } from "../rulings/types";
import type { Outcome } from "../types";
import { deriveCompatibility } from "./compatibility";
import { deriveDecision } from "./decision";
import { fail, succeed } from "./outcome";
import { deriveTimeline } from "./timeline";
import type { ArbitratorDispute, Compatibility, Court, Decision, DisputeLookup, DisputeReads, DisputeView, LocalIdResolution } from "./types";

const NO_NOTICE: RealityNotice = { kind: "none", title: null };
const DETAILS_NOT_READ = "The dispute details were not read.";

/** The court of the dispute from the list: a failed list keeps its reason, a list without the court is `not-found` (D-36). */
function findCourt(courts: Outcome<readonly Court[]>, subcourtId: bigint): Outcome<Court> {
  if (!courts.ok) return courts;
  const court = courts.value.find((candidate) => candidate.id === subcourtId);
  return court === undefined ? fail("not-found", `Court ${subcourtId.toString()} is not in the court list.`) : succeed(court);
}

/** `votesLengths[0]`, the first round's vote count (spec 5.8); an empty list is `invalid-data` (D-36). */
function numberOfVotes(reads: DisputeReads | null): Outcome<number> {
  if (reads === null) return fail("rpc-error", DETAILS_NOT_READ);
  if (!reads.votesLengths.ok) return reads.votesLengths;
  const [first] = reads.votesLengths.value;
  if (first === undefined || first > BigInt(Number.MAX_SAFE_INTEGER)) return fail("invalid-data", "The dispute has no valid vote count.");
  return succeed(Number(first));
}

/** Ruling options and fallback outcomes from the loaded meta-evidence, or the INVALID placeholder (spec 5.9, A2). */
function rulingSources(metaEvidence: MetaEvidenceResult | null): { readonly rulingOptions: RulingOptions | null; readonly fallbackOutcomes: FallbackOutcomes } {
  if (metaEvidence?.status === "ok" || metaEvidence?.status === "invalid") {
    return { rulingOptions: metaEvidence.metaEvidence.rulingOptions, fallbackOutcomes: metaEvidence.metaEvidence.fallbackOutcomes };
  }
  return { rulingOptions: null, fallbackOutcomes: null };
}

/**
 * The decision alert from the reads (spec 5.9). Periods 0–2 need no read. The appeal and execution periods need the
 * current ruling; execution also needs the current round's funded rulings, where `null` means the arbitrable was not
 * scanned (no funded ruling) and a failed scan degrades the decision instead of guessing (D-36).
 */
function decision(
  dispute: ArbitratorDispute,
  reads: DisputeReads | null,
  fundedRulings: Outcome<readonly bigint[]> | null,
  metaEvidence: MetaEvidenceResult | null,
  compatibility: Compatibility,
): Outcome<Decision> {
  const { period } = dispute;
  if (period < 3) return succeed({ kind: "none" });
  if (reads === null) return fail("rpc-error", DETAILS_NOT_READ);
  if (!reads.currentRuling.ok) return reads.currentRuling;
  let funded: readonly bigint[] = [];
  if (period === 4 && fundedRulings !== null) {
    if (!fundedRulings.ok) return fundedRulings;
    funded = fundedRulings.value;
  }
  return succeed(deriveDecision({ period, currentRuling: reads.currentRuling.value, fundedRulings: funded, ...rulingSources(metaEvidence), compatibility }));
}

/**
 * Everything the case page renders above the accordion (04 §1). A lookup without a dispute is `exists: false` with its
 * reason; an existing dispute degrades field by field when an input is missing or failed, never as a whole (D-36). The
 * arbitrable is the arbitrator's (A22), the Reality notice comes from loaded meta-evidence only.
 */
export function buildDisputeView(input: {
  readonly lookup: DisputeLookup;
  readonly reads: DisputeReads | null;
  readonly family: Outcome<FamilyDetection>;
  readonly courts: Outcome<readonly Court[]>;
  readonly metaEvidence: MetaEvidenceResult | null;
  readonly fundedRulings: Outcome<readonly bigint[]> | null;
}): DisputeView {
  const { lookup, reads, family, metaEvidence } = input;
  switch (lookup.status) {
    case "not-found":
    case "no-arbitrator":
      return { exists: false, reason: lookup.status };
    case "unavailable":
      return { exists: false, reason: "unavailable", error: lookup.error };
    case "found":
      break;
  }
  const { dispute, binding } = lookup;
  const localId: LocalIdResolution = reads?.localId ?? { kind: "unresolved", reason: "rpc-error" };
  const compatibility = deriveCompatibility(family.ok ? family.value : undefined, localId);
  const court = findCourt(input.courts, dispute.subcourtId);
  return {
    exists: true,
    chainId: binding.chainId,
    disputeId: binding.disputeId,
    arbitrable: binding.arbitrated,
    family,
    compatibility,
    period: dispute.period,
    lastPeriodChange: dispute.lastPeriodChange,
    timeline: court.ok ? succeed(deriveTimeline({ period: dispute.period, lastPeriodChange: dispute.lastPeriodChange, court: court.value })) : court,
    decision: decision(dispute, reads, input.fundedRulings, metaEvidence, compatibility),
    numberOfVotes: numberOfVotes(reads),
    court,
    realityNotice: metaEvidence?.status === "ok" ? realityNotice(metaEvidence.metaEvidence.realityQuestion) : NO_NOTICE,
  };
}
