import {
  fundingRound,
  roundStartBlock,
  roundsToScan,
  type Address,
  type AppealContext,
  type AppealDecisionEvent,
  type BehaviorOverride,
  type FamilyDetection,
  type Period,
} from "@dispute-resolver/core";
import { useMultipliers, useRoundFunding, useWithdrawable } from "./appealHooks";
import type { AppealReads } from "./caseAssembly";
import { LOADING, unavailableFrom } from "./sectionData";
import type { SectionData } from "./types";

export interface AppealPlan {
  readonly context: AppealContext;
  readonly decisions: SectionData<readonly AppealDecisionEvent[]>;
  /** Where round 0 starts: the Dispute event's block, or the arbitrator's deployment block without one. */
  readonly disputeStartBlock: bigint;
}

function appealNeeds(period: Period, family: FamilyDetection): { readonly funding: boolean; readonly multipliers: boolean; readonly withdraw: boolean } {
  const { appeal, withdraw } = family.capabilities;
  const crowdfunds = appeal.kind === "idr" || appeal.kind === "governor";
  const withdraws = withdraw.kind === "idr-v2" || withdraw.kind === "idr-v1" || withdraw.kind === "governor";
  return { funding: crowdfunds && period >= 3, multipliers: crowdfunds && period === 3, withdraw: withdraws && period === 4 };
}

interface RoundPlan {
  readonly fundingRound: bigint;
  readonly fundingFrom: bigint;
  readonly rounds: readonly bigint[];
  readonly starts: readonly bigint[];
}

function roundPlan(period: Period, decisions: readonly AppealDecisionEvent[], override: BehaviorOverride | undefined, disputeStartBlock: bigint): RoundPlan {
  const current = fundingRound(decisions.length, override);
  const rounds = roundsToScan(period, decisions.length, override);
  return {
    fundingRound: current,
    fundingFrom: roundStartBlock(current, decisions, override, disputeStartBlock),
    rounds,
    starts: rounds.map((round) => roundStartBlock(round, decisions, override, disputeStartBlock)),
  };
}

function failedReads(period: Period, state: Extract<SectionData<AppealPlan>, { status: "unavailable" }>): AppealReads {
  const failed = unavailableFrom(state.error);
  return { multipliers: period === 3 ? failed : null, funding: period >= 3 ? failed : null, withdraw: period === 4 ? failed : null };
}

/** Every hook runs on every render, disabled until its inputs exist; a read the period or family does not need is `null`. */
export function useAppealReads(planState: SectionData<AppealPlan>, period: Period, account: Address | undefined): AppealReads {
  const plan = planState.status === "ready" ? planState.value : undefined;
  const needs = plan === undefined ? undefined : appealNeeds(period, plan.context.family);
  const decisions = plan?.decisions;
  const rounds = plan !== undefined && decisions?.status === "ready" ? roundPlan(period, decisions.value, plan.context.override, plan.disputeStartBlock) : undefined;

  const multipliers = useMultipliers(plan?.context.binding.chainId ?? 0, needs?.multipliers === true ? plan?.context.family : undefined);
  const funding = useRoundFunding(needs?.funding === true ? plan?.context : undefined, rounds?.fundingRound, rounds?.fundingFrom);
  const withdraw = useWithdrawable(needs?.withdraw === true && rounds !== undefined ? plan?.context : undefined, account, rounds?.rounds ?? [], rounds?.starts ?? []);

  if (planState.status === "loading") return { multipliers: LOADING, funding: LOADING, withdraw: LOADING };
  if (planState.status === "unavailable") return failedReads(period, planState);
  if (needs === undefined || decisions === undefined) return { multipliers: null, funding: null, withdraw: null };
  const decisionsError = decisions.status === "unavailable" ? unavailableFrom(decisions.error) : undefined;
  return {
    multipliers: needs.multipliers ? multipliers : null,
    funding: needs.funding ? (decisionsError ?? funding) : null,
    withdraw: needs.withdraw ? (decisionsError ?? withdraw) : null,
  };
}
