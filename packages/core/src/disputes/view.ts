import type { FamilyDetection } from "../families/types";
import { realityNotice } from "../metaEvidence";
import type { MetaEvidenceResult, RealityNotice } from "../metaEvidence/types";
import type { Outcome } from "../types";
import { deriveCompatibility } from "./compatibility";
import { fail, succeed } from "../outcome";
import { deriveTimeline } from "./timeline";
import type { Court, DisputeLookup, DisputeReads, DisputeView, LocalIdResolution } from "./types";

const NO_NOTICE: RealityNotice = { kind: "none", title: null };
const DETAILS_NOT_READ = "The dispute details were not read.";

function findCourt(courts: Outcome<readonly Court[]>, subcourtId: bigint): Outcome<Court> {
  if (!courts.ok) return courts;
  const court = courts.value.find((candidate) => candidate.id === subcourtId);
  return court === undefined ? fail("not-found", `Court ${subcourtId.toString()} is not in the court list.`) : succeed(court);
}

function numberOfVotes(reads: DisputeReads | null): Outcome<number> {
  if (reads === null) return fail("rpc-error", DETAILS_NOT_READ);
  if (!reads.votesLengths.ok) return reads.votesLengths;
  const [first] = reads.votesLengths.value;
  if (first === undefined || first > BigInt(Number.MAX_SAFE_INTEGER)) return fail("invalid-data", "The dispute has no valid vote count.");
  return succeed(Number(first));
}

/** An existing dispute degrades field by field when an input is missing or failed, never as a whole. */
export function buildDisputeView(input: {
  readonly lookup: DisputeLookup;
  readonly reads: DisputeReads | null;
  readonly family: Outcome<FamilyDetection>;
  readonly courts: Outcome<readonly Court[]>;
  readonly metaEvidence: MetaEvidenceResult | null;
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
    numberOfVotes: numberOfVotes(reads),
    court,
    realityNotice: metaEvidence?.status === "ok" ? realityNotice(metaEvidence.metaEvidence.realityQuestion) : NO_NOTICE,
  };
}
