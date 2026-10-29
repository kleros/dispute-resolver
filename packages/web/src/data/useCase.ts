import {
  describeAppealRules,
  evidenceScanStart,
  getChain,
  getOverride,
  type Address,
  type AppealDecisionEvent,
  type BehaviorOverride,
  type DisputeEvent,
  type DisputeEventResult,
  type DisputeReads,
  type FamilyDetection,
  type ReadClient,
} from "@dispute-resolver/core";
import { useProductFunding } from "./appealHooks";
import { executedRulingFrom, useAppealReads, type AppealPlan } from "./caseAppealReads";
import {
  assembleAppealPanel,
  assembleDecision,
  assembleView,
  assembleWriteContext,
  decisionWaitsForFunding,
  lookupError,
  viewWithoutDispute,
  type FoundCaseReads,
} from "./caseAssembly";
import { useCoreDeps } from "./context";
import { useDisputeDetails, useDisputeEvent, useDisputeLookup, useEvidence, useExecutedRuling, useFamily, useMetaEvidence, type FoundDispute } from "./disputeHooks";
import { useCourts } from "./ongoingHooks";
import { LOADING, fromOutcome, noRpcError, ready, unavailableFrom, valueOf } from "./sectionData";
import type { CaseData, CaseDispute, FoundLookup, SectionData } from "./types";

function foundEvent(event: SectionData<DisputeEventResult>): DisputeEvent | undefined {
  return event.status === "ready" && event.value.status === "found" ? event.value.event : undefined;
}

/** `null` without a found event, `undefined` while loading. */
function settledEventBlock(event: SectionData<DisputeEventResult>): bigint | null | undefined {
  if (event.status === "loading") return undefined;
  return foundEvent(event)?.blockNumber ?? null;
}

function appealDecisionsOf(details: SectionData<DisputeReads>): SectionData<readonly AppealDecisionEvent[]> {
  return details.status === "ready" ? fromOutcome(details.value.appealDecisions) : details;
}

/**
 * The Dispute event gives where round 0 starts (the arbitrator's scan start without one) and the evidence group, which
 * is a governor's session.
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

/** Where the executed-ruling scan starts, once the details and the Dispute event have settled; `undefined` before. */
function executedRulingStart(
  chainId: number,
  details: SectionData<DisputeReads>,
  disputeEvent: SectionData<DisputeEventResult>,
  override: BehaviorOverride | undefined,
): bigint | undefined {
  const chain = getChain(chainId);
  if (chain === undefined || details.status === "loading" || disputeEvent.status === "loading") return undefined;
  const disputeStartBlock = foundEvent(disputeEvent)?.blockNumber ?? evidenceScanStart(chain);
  return executedRulingFrom(appealDecisionsOf(details), override, disputeStartBlock);
}

/**
 * Each section gets its own `SectionData`, so a failing read degrades one section. A new ID or chain starts from a
 * fresh lookup, and nothing of the previous dispute is shown. `account` is the connected wallet, for the withdraw panel.
 */
export function useCase(chainId: number, disputeId: bigint | null, account?: Address): CaseData {
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
  const readClient = deps.getReadClient(chainId);
  const plan = appealPlan(found, family, details, disputeEvent, readClient, override);
  const appeal = useAppealReads(plan, found?.dispute.period ?? 0, account);
  const executed = useExecutedRuling(chainId, found, executedRulingStart(chainId, details, disputeEvent, override));
  const rules = family.status === "ready" ? describeAppealRules(deps.registry, family.value) : null;
  const fundingNeeded = found !== undefined && decisionWaitsForFunding(found.dispute, details, executed);
  const productFunding = useProductFunding(chainId, binding, valueOf(family), fundingNeeded);

  if (disputeId === null) return { status: "no-id", chainId };

  const base = { status: "dispute", chainId, disputeId, lookup, courts } as const;
  if (lookup.status !== "ready") return { ...base, ...everySection(lookup) };
  if (lookup.value.status !== "found") {
    const error = lookupError(lookup.value, disputeId);
    return { ...base, ...everySection(unavailableFrom(error)), view: ready(viewWithoutDispute(lookup.value, error)) };
  }

  const reads: FoundCaseReads = { lookup: lookup.value, family, rules, metaEvidence, courts, details, appeal, executed, productFunding, override, readClient };
  return {
    ...base,
    view: assembleView(reads),
    family,
    metaEvidence,
    disputeEvent,
    evidence,
    appealDecisions: appealDecisionsOf(details),
    appealPanel: assembleAppealPanel(reads),
    decision: assembleDecision(reads),
    write: assembleWriteContext(reads),
  };
}

function everySection(state: Exclude<SectionData<unknown>, { status: "ready" }>): Omit<CaseDispute, "status" | "chainId" | "disputeId" | "lookup" | "courts"> {
  const section = state.status === "loading" ? LOADING : unavailableFrom(state.error);
  return {
    view: section,
    family: section,
    metaEvidence: section,
    disputeEvent: section,
    evidence: section,
    appealDecisions: section,
    appealPanel: section,
    decision: section,
    write: section,
  };
}
