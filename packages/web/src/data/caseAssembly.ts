import {
  buildAppealPanel,
  buildDisputeView,
  type AppealPanel,
  type BehaviorOverride,
  type Court,
  type DisputeLookup,
  type DisputeReads,
  type DisputeView,
  type FamilyDetection,
  type MetaEvidence,
  type MetaEvidenceResult,
  type Multipliers,
  type Outcome,
  type RoundFunding,
  type RulingOptions,
  type Unavailable,
  type WithdrawState,
} from "@dispute-resolver/core";
import { LOADING, ready, unavailableFrom } from "./sectionData";
import type { CaseWriteContext, SectionData } from "./types";

/** The appeal-money reads of the period; `null` is "not read for this period and family" (ARCHITECTURE.md §5.3). */
export interface AppealReads {
  readonly multipliers: SectionData<Multipliers> | null;
  readonly funding: SectionData<RoundFunding> | null;
  readonly withdraw: SectionData<WithdrawState> | null;
}

/** Every read of one found dispute, each in its own section state (D-36). */
export interface FoundCaseReads {
  readonly lookup: Extract<DisputeLookup, { status: "found" }>;
  readonly family: SectionData<FamilyDetection>;
  readonly metaEvidence: SectionData<MetaEvidenceResult>;
  readonly courts: SectionData<readonly Court[]>;
  readonly details: SectionData<DisputeReads>;
  readonly appeal: AppealReads;
  readonly override: BehaviorOverride | undefined;
}

/** Why the sections that hang off a dispute cannot load when the lookup found none (spec §5.4, D-53). */
export function lookupError(lookup: Exclude<DisputeLookup, { status: "found" }>, disputeId: bigint): Unavailable {
  switch (lookup.status) {
    case "not-found":
      return { code: "not-found", message: `Dispute with ID ${disputeId.toString()} does not exist on this network.` };
    case "no-arbitrator":
      return { code: "unsupported", message: "There is no arbitrator on this network." };
    case "unavailable":
      return lookup.error;
  }
}

/** The view of a lookup that found no dispute: `exists: false` with its reason. */
export function viewWithoutDispute(lookup: Exclude<DisputeLookup, { status: "found" }>, error: Unavailable): DisputeView {
  const notRead: Outcome<never> = { ok: false, error };
  return buildDisputeView({ lookup, reads: null, family: notRead, courts: notRead, metaEvidence: null, fundedRulings: null });
}

function toOutcome<T>(section: Exclude<SectionData<T>, { status: "loading" }>): Outcome<T> {
  return section.status === "ready" ? { ok: true, value: section.value } : { ok: false, error: section.error };
}

function settled<T>(section: SectionData<T>): section is Exclude<SectionData<T>, { status: "loading" }> {
  return section.status !== "loading";
}

/** An optional read as `buildAppealPanel` and `buildDisputeView` take it: `null` when not read. */
function optionalOutcome<T>(section: SectionData<T> | null): Outcome<T> | null | undefined {
  if (section === null) return null;
  return settled(section) ? toOutcome(section) : undefined;
}

/**
 * The view above the accordion (04 §1), built once every read it shows has settled, so the decision text never
 * flickers from a fallback to the meta-evidence's options. Each failed read degrades its own field (D-36).
 */
export function assembleView(reads: FoundCaseReads): SectionData<DisputeView> {
  const { family, courts, metaEvidence, details } = reads;
  const funding = optionalOutcome(reads.appeal.funding);
  if (!settled(family) || !settled(courts) || !settled(metaEvidence) || !settled(details) || funding === undefined) return LOADING;
  return ready(
    buildDisputeView({
      lookup: reads.lookup,
      reads: details.status === "ready" ? details.value : null,
      family: toOutcome(family),
      courts: toOutcome(courts),
      metaEvidence: metaEvidence.status === "ready" ? metaEvidence.value : null,
      fundedRulings: funding === null ? null : mapOutcome(funding, (value) => value.fundedRulings),
    }),
  );
}

function mapOutcome<T, U>(outcome: Outcome<T>, map: (value: T) => U): Outcome<U> {
  return outcome.ok ? { ok: true, value: map(outcome.value) } : outcome;
}

/** Spec §5.12 item 5: meta-evidence without `rulingOptions` takes the generic card set (fallback outcomes or Yes/No). */
const NO_RULING_OPTIONS: RulingOptions = { type: "single-select" };

/** The ruling options of a usable meta-evidence (`ok`, or the `invalid` placeholder of A2), else why there are none. */
function usableMetaEvidence(metaEvidence: MetaEvidenceResult): SectionData<MetaEvidence> {
  switch (metaEvidence.status) {
    case "ok":
    case "invalid":
      return ready(metaEvidence.metaEvidence);
    case "missing":
      return unavailableFrom({ code: "not-found", message: "This dispute has no meta-evidence, so its ruling options are unknown." });
    case "failed":
      return unavailableFrom(metaEvidence.error);
  }
}

/** The withdraw state for the panel: a rejected read is the state's own `unavailable` (§5.15). */
function withdrawState(section: SectionData<WithdrawState> | null): WithdrawState | null | undefined {
  if (section === null) return null;
  if (section.status === "loading") return undefined;
  return section.status === "ready" ? section.value : { status: "unavailable", error: section.error };
}

/** The appeal panel (06 §1, spec §5.11), once the family, the details, the meta-evidence and the period's reads have settled. */
export function assembleAppealPanel(reads: FoundCaseReads): SectionData<AppealPanel> {
  const { family, details, metaEvidence, appeal } = reads;
  if (family.status !== "ready") return family;
  if (details.status !== "ready") return details;
  if (metaEvidence.status !== "ready") return metaEvidence;
  const usable = usableMetaEvidence(metaEvidence.value);
  if (usable.status !== "ready") return usable;
  const multipliers = optionalOutcome(appeal.multipliers);
  const funding = optionalOutcome(appeal.funding);
  const withdraw = withdrawState(appeal.withdraw);
  if (multipliers === undefined || funding === undefined || withdraw === undefined) return LOADING;
  const { rulingOptions, fallbackOutcomes } = usable.value;
  return ready(
    buildAppealPanel({
      family: family.value,
      period: reads.lookup.dispute.period,
      localId: details.value.localId,
      override: reads.override,
      rulingOptions: rulingOptions ?? NO_RULING_OPTIONS,
      fallbackOutcomes,
      currentRuling: details.value.currentRuling,
      appealInfo: details.value.appealInfo,
      multipliers,
      funding,
      withdraw,
    }),
  );
}

/** What the write builders need (A22: the binding comes from the arbitrator), once the family and details are known. */
export function assembleWriteContext(reads: FoundCaseReads): SectionData<CaseWriteContext> {
  const { family, details } = reads;
  if (family.status !== "ready") return family;
  if (details.status !== "ready") return details;
  const { appealInfo } = details.value;
  return ready({
    binding: reads.lookup.binding,
    family: family.value,
    localId: details.value.localId,
    override: reads.override,
    appealInfo: appealInfo?.ok === true ? appealInfo.value : null,
  });
}

