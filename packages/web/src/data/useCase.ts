import {
  evidenceScanStart,
  getChain,
  getOverride,
  type Address,
  type AppealDecisionEvent,
  type BehaviorOverride,
  type ChainId,
  type DisputeEvent,
  type DisputeEventResult,
  type DisputeLookup,
  type DisputeReads,
  type FamilyDetection,
  type ReadClient,
} from "@dispute-resolver/core";
import { useAppealReads, type AppealPlan } from "./caseAppealReads";
import { assembleAppealPanel, assembleView, assembleWriteContext, lookupError, viewWithoutDispute, type FoundCaseReads } from "./caseAssembly";
import { useCoreDeps } from "./context";
import { useDisputeDetails, useDisputeEvent, useDisputeLookup, useEvidence, useFamily, useMetaEvidence, type FoundDispute } from "./disputeHooks";
import { useCourts } from "./ongoingHooks";
import { LOADING, noRpcError, ready, unavailableFrom, valueOf } from "./sectionData";
import type { CaseData, CaseDispute, SectionData } from "./types";

type FoundLookup = Extract<DisputeLookup, { status: "found" }>;

/** The found Dispute event, or `undefined` while loading, without one, or when its read failed. */
function foundEvent(event: SectionData<DisputeEventResult>): DisputeEvent | undefined {
  return event.status === "ready" && event.value.status === "found" ? event.value.event : undefined;
}

/** The settled Dispute-event block for the details key: `null` without a found event, `undefined` while loading. */
function settledEventBlock(event: SectionData<DisputeEventResult>): bigint | null | undefined {
  if (event.status === "loading") return undefined;
  return foundEvent(event)?.blockNumber ?? null;
}

/** The `AppealDecision` events of the details: the appeal rounds (D-30) and the "Appealed" markers (D-03). */
function appealDecisionsOf(details: SectionData<DisputeReads>): SectionData<readonly AppealDecisionEvent[]> {
  if (details.status !== "ready") return details;
  const { appealDecisions } = details.value;
  return appealDecisions.ok ? ready(appealDecisions.value) : unavailableFrom(appealDecisions.error);
}

/**
 * The appeal reads' inputs, or why they cannot exist: the family, the details and the Dispute event must all be settled.
 * The Dispute event gives where round 0 starts (the arbitrator's scan start without one, D-02, P-01) and the evidence
 * group, which is a governor's session (D-47).
 */
function appealPlan(
  found: FoundLookup | undefined,
  family: SectionData<FamilyDetection>,
  details: SectionData<DisputeReads>,
  disputeEvent: SectionData<DisputeEventResult>,
  client: ReadClient | undefined,
  override: BehaviorOverride | undefined,
): SectionData<AppealPlan> {
  if (found === undefined || family.status === "loading" || details.status === "loading" || disputeEvent.status === "loading") return LOADING;
  if (family.status === "unavailable") return family;
  if (details.status === "unavailable") return details;
  const chain = getChain(found.binding.chainId);
  if (client === undefined || chain === undefined) return unavailableFrom(noRpcError(found.binding.chainId));
  const { localId } = details.value;
  const decisions = appealDecisionsOf(details);
  const event = foundEvent(disputeEvent);
  return ready({
    context: { client, binding: found.binding, family: family.value, localId, override, evidenceGroupId: event?.evidenceGroupId },
    decisions,
    disputeStartBlock: event?.blockNumber ?? evidenceScanStart(chain),
  });
}

/**
 * The case page's data (ARCHITECTURE.md §5.3): lookup, then family, meta-evidence, Dispute event and courts in
 * parallel, then the details, then the appeal reads of the period, assembled into one `SectionData` per section so a
 * failing read degrades one section (D-36). `null` is the D-09 state; a new ID or chain starts from a fresh lookup,
 * and nothing of the previous dispute is shown (D-53). `account` is the connected wallet, for the withdraw panel.
 */
export function useCase(chainId: ChainId, disputeId: bigint | null, account?: Address): CaseData {
  const deps = useCoreDeps();
  const lookup = useDisputeLookup(chainId, disputeId);
  const found = lookup.status === "ready" && lookup.value.status === "found" ? lookup.value : undefined;
  const binding = found?.binding;

  const family = useFamily(chainId, binding?.arbitrated);
  const metaEvidence = useMetaEvidence(chainId, binding, "case");
  const disputeEvent = useDisputeEvent(chainId, binding);
  const courts = useCourts(chainId);
  const evidence = useEvidence(chainId, binding, disputeEvent);

  const eventBlock = settledEventBlock(disputeEvent);
  const detailsInput: FoundDispute | undefined = found !== undefined && family.status !== "loading" && eventBlock !== undefined ? found : undefined;
  const details = useDisputeDetails(chainId, detailsInput, valueOf(family), eventBlock ?? null);

  const override = binding === undefined ? undefined : getOverride(deps.registry, chainId, binding.arbitrated);
  const plan = appealPlan(found, family, details, disputeEvent, deps.getReadClient(chainId), override);
  const appeal = useAppealReads(plan, found?.dispute.period ?? 0, account);

  if (disputeId === null) return { status: "no-id", chainId };

  const base = { status: "dispute", chainId, disputeId, lookup, courts } as const;
  if (lookup.status !== "ready") return { ...base, ...everySection(lookup) };
  if (lookup.value.status !== "found") {
    const error = lookupError(lookup.value, disputeId);
    return { ...base, ...everySection(unavailableFrom(error)), view: ready(viewWithoutDispute(lookup.value, error)) };
  }

  const reads: FoundCaseReads = { lookup: lookup.value, family, metaEvidence, courts, details, appeal, override };
  return {
    ...base,
    view: assembleView(reads),
    family,
    metaEvidence,
    disputeEvent,
    evidence,
    appealDecisions: appealDecisionsOf(details),
    appealPanel: assembleAppealPanel(reads),
    write: assembleWriteContext(reads),
  };
}

/** Every dispute-dependent section in one state: all loading with the lookup, or all failing with its error. */
function everySection(state: Exclude<SectionData<unknown>, { status: "ready" }>): Omit<CaseDispute, "status" | "chainId" | "disputeId" | "lookup" | "courts"> {
  const section = state.status === "loading" ? LOADING : unavailableFrom(state.error);
  return { view: section, family: section, metaEvidence: section, disputeEvent: section, evidence: section, appealDecisions: section, appealPanel: section, write: section };
}
