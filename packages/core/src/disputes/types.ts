import type { Address, ChainId, Env, Fetcher, Outcome, Period, ReadClient, Unavailable, UnixSeconds } from "../types";
import type { FamilyDetection } from "../families/types";
import type { RealityNotice } from "../metaEvidence/types";

declare const arbitratorBinding: unique symbol;

/**
 * Read from the arbitrator (`disputes(id).arbitrated`). Every write builder takes it instead of a bare address, so
 * meta-evidence cannot choose the arbitrable.
 */
export interface ArbitratedBinding {
  readonly [arbitratorBinding]: true;
  readonly chainId: ChainId;
  readonly disputeId: bigint;
  readonly arbitrator: Address;
  readonly arbitrated: Address;
}

export interface ArbitratorDispute {
  readonly id: bigint;
  readonly subcourtId: bigint;
  readonly arbitrated: Address;
  readonly numberOfChoices: bigint;
  readonly period: Period;
  readonly lastPeriodChange: UnixSeconds;
  readonly ruled: boolean;
}

/** A revert of `disputes(id)` is `not-found`; a transport error is `unavailable`, not "does not exist". */
export type DisputeLookup =
  | { readonly status: "found"; readonly dispute: ArbitratorDispute; readonly binding: ArbitratedBinding }
  | { readonly status: "not-found" }
  | { readonly status: "no-arbitrator" }
  | { readonly status: "unavailable"; readonly error: Unavailable };

export interface AppealDecisionEvent {
  readonly blockNumber: bigint;
  readonly appealedAt: UnixSeconds;
}

export type LocalIdResolution =
  | { readonly kind: "local-id"; readonly value: bigint } // externalIDtoLocalID (idr-*)
  | { readonly kind: "transaction-id"; readonly value: bigint } // disputeIDtoTransactionID (escrow-v1)
  | { readonly kind: "not-applicable" } // governor, view-only
  | { readonly kind: "unresolved"; readonly reason: "reverted" | "rpc-error" };

export interface AppealInfo {
  readonly appealCost: bigint;
  readonly appealPeriodStart: UnixSeconds;
  readonly appealPeriodEnd: UnixSeconds;
}

export interface DisputeReads {
  readonly dispute: ArbitratorDispute;
  readonly binding: ArbitratedBinding;
  readonly votesLengths: Outcome<readonly bigint[]>;
  readonly currentRuling: Outcome<bigint>;
  readonly appealDecisions: Outcome<readonly AppealDecisionEvent[]>;
  /** Present only when the period is 3 or 4. */
  readonly appealInfo: Outcome<AppealInfo> | null;
  readonly localId: LocalIdResolution;
}

export interface Court {
  readonly id: bigint;
  readonly parent: bigint;
  readonly hiddenVotes: boolean;
  /** Seconds per period: evidence, commit, vote, appeal. */
  readonly timesPerPeriod: readonly [bigint, bigint, bigint, bigint];
  readonly policyUri: string | null;
  readonly name: string | null;
}

export type TimelineColumnName = "evidence" | "commit" | "vote" | "appeal" | "execution";

export type TimelineColumn =
  | { readonly name: TimelineColumnName; readonly state: "concluded" }
  | { readonly name: TimelineColumnName; readonly state: "current"; readonly deadline: UnixSeconds | null }
  | { readonly name: TimelineColumnName; readonly state: "upcoming"; readonly durationSeconds: bigint | null };

export interface Timeline {
  readonly columns: readonly TimelineColumn[];
}

export type Decision =
  | { readonly kind: "none" }
  | { readonly kind: "jury-decision"; readonly ruling: bigint; readonly rulingText: string; readonly appealHint: boolean }
  | { readonly kind: "winner"; readonly ruling: bigint; readonly rulingText: string; readonly wonBy: "default" | "jury" };

export type Compatibility = "full" | "view-only";

export type DisputeView =
  | { readonly exists: false; readonly reason: "not-found" | "no-arbitrator" }
  | { readonly exists: false; readonly reason: "unavailable"; readonly error: Unavailable }
  | {
      readonly exists: true;
      readonly chainId: ChainId;
      readonly disputeId: bigint;
      readonly arbitrable: Address;
      readonly family: Outcome<FamilyDetection>;
      readonly compatibility: Compatibility;
      readonly period: Period;
      readonly lastPeriodChange: UnixSeconds;
      readonly timeline: Outcome<Timeline>;
      readonly decision: Outcome<Decision>;
      readonly numberOfVotes: Outcome<number>;
      readonly court: Outcome<Court>;
      readonly realityNotice: RealityNotice;
    };

export interface OngoingDispute {
  readonly id: bigint;
  readonly arbitrated: Address;
  readonly period: Period;
  readonly subcourtId: bigint;
  readonly lastPeriodChange: UnixSeconds;
  /** `lastPeriodChange + timesPerPeriod[period]`, or null when the court is unknown or the period is 4. */
  readonly countdownTarget: UnixSeconds | null;
}

export type OngoingList =
  | { readonly status: "no-arbitrator" }
  | { readonly status: "ok"; readonly disputes: readonly OngoingDispute[]; readonly failedIds: readonly bigint[] }
  | { readonly status: "failed"; readonly error: Unavailable };

export interface DisputeReadContext {
  readonly chainId: ChainId;
  /** `undefined` when the chain has no RPC configured. */
  readonly client: ReadClient | undefined;
  readonly signal?: AbortSignal;
}

export interface CourtsContext extends DisputeReadContext {
  readonly fetcher: Fetcher;
  readonly env: Env;
}
