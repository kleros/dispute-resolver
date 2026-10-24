import {
  buildAppealPanel,
  buildDisputeView,
  needsRulingOptions,
  readAppealCost,
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
  type ReadClient,
  type RoundFunding,
  type RulingOptions,
  type Unavailable,
  type WithdrawState,
} from "@dispute-resolver/core";
import { LOADING, ready, unavailableFrom } from "./sectionData";
import type { CaseWriteContext, SectionData } from "./types";

/** `null`: not read for this period and family. */
export interface AppealReads {
  readonly multipliers: SectionData<Multipliers> | null;
  readonly funding: SectionData<RoundFunding> | null;
  readonly withdraw: SectionData<WithdrawState> | null;
}

export interface FoundCaseReads {
  readonly lookup: Extract<DisputeLookup, { status: "found" }>;
  readonly family: SectionData<FamilyDetection>;
  readonly metaEvidence: SectionData<MetaEvidenceResult>;
  readonly courts: SectionData<readonly Court[]>;
  readonly details: SectionData<DisputeReads>;
  readonly appeal: AppealReads;
  readonly override: BehaviorOverride | undefined;
  /** The page chain's read client; `undefined` without one. */
  readonly readClient: ReadClient | undefined;
}

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

/** `null`: not read; `undefined`: still loading. */
function optionalOutcome<T>(section: SectionData<T> | null): Outcome<T> | null | undefined {
  if (section === null) return null;
  return settled(section) ? toOutcome(section) : undefined;
}

/** Waits for every read it shows, so the decision text never flickers from a fallback to the meta-evidence's options. */
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

/** Meta-evidence without `rulingOptions` gets the generic card set (fallback outcomes or Yes/No). */
const NO_RULING_OPTIONS: RulingOptions = { type: "single-select" };

/** An `invalid` result still carries a placeholder meta-evidence, whose ruling options are usable. */
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

function withdrawState(section: SectionData<WithdrawState> | null): WithdrawState | null | undefined {
  if (section === null) return null;
  if (section.status === "loading") return undefined;
  return section.status === "ready" ? section.value : { status: "unavailable", error: section.error };
}

type PanelOptions = Pick<MetaEvidence, "rulingOptions" | "fallbackOutcomes">;

const WITHOUT_OPTIONS: PanelOptions = { rulingOptions: NO_RULING_OPTIONS, fallbackOutcomes: null };

/** Only the crowdfunding cards wait for and depend on the meta-evidence; every other panel is built without it. */
function panelOptions(reads: FoundCaseReads, family: FamilyDetection): SectionData<PanelOptions> {
  if (!needsRulingOptions(reads.lookup.dispute.period, family)) return ready(WITHOUT_OPTIONS);
  const { metaEvidence } = reads;
  if (metaEvidence.status !== "ready") return metaEvidence;
  return usableMetaEvidence(metaEvidence.value);
}

export function assembleAppealPanel(reads: FoundCaseReads): SectionData<AppealPanel> {
  const { family, details, appeal } = reads;
  if (family.status !== "ready") return family;
  if (details.status !== "ready") return details;
  const options = panelOptions(reads, family.value);
  if (options.status !== "ready") return options;
  const multipliers = optionalOutcome(appeal.multipliers);
  const funding = optionalOutcome(appeal.funding);
  const withdraw = withdrawState(appeal.withdraw);
  if (multipliers === undefined || funding === undefined || withdraw === undefined) return LOADING;
  const { rulingOptions, fallbackOutcomes } = options.value;
  return ready(
    buildAppealPanel({
      family: family.value,
      period: reads.lookup.dispute.period,
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

export function assembleWriteContext(reads: FoundCaseReads): SectionData<CaseWriteContext> {
  const { family, details } = reads;
  if (family.status !== "ready") return family;
  if (details.status !== "ready") return details;
  const { binding } = reads.lookup;
  return ready({
    binding,
    family: family.value,
    localId: details.value.localId,
    readAppealCost: () => readAppealCost({ client: reads.readClient }, binding),
  });
}
