import type { Address, ChainId, Env, Fetcher, Outcome, Period, ReadClient, Unavailable, UnixSeconds } from "../types";
import type { FamilyDetection } from "../families/types";
import type { RealityNotice } from "../metaEvidence/types";

declare const arbitratorBinding: unique symbol;

/**
 * The dispute-to-arbitrable binding read from the arbitrator (`disputes(id).arbitrated`). Only `disputes` creates it;
 * every write builder takes it instead of a bare address, so meta-evidence cannot choose the arbitrable (A22).
 */
export interface ArbitratedBinding {
  readonly [arbitratorBinding]: true;
  readonly chainId: ChainId;
  readonly disputeId: bigint;
  readonly arbitrator: Address;
  readonly arbitrated: Address;
}

/** `KlerosLiquid.disputes(id)`. */
export interface ArbitratorDispute {
  readonly id: bigint;
  readonly subcourtId: bigint;
  readonly arbitrated: Address;
  readonly numberOfChoices: bigint;
  readonly period: Period;
  readonly lastPeriodChange: UnixSeconds;
  readonly ruled: boolean;
}

/** Existence (D-53, spec 5.4). A revert of `disputes(id)` is `not-found`; a transport error is `unavailable`, not "does not exist". */
export type DisputeLookup =
  | { readonly status: "found"; readonly dispute: ArbitratorDispute; readonly binding: ArbitratedBinding }
  | { readonly status: "not-found" }
  | { readonly status: "no-arbitrator" }
  | { readonly status: "unavailable"; readonly error: Unavailable };

/** One `AppealDecision(id)` event (spec 6.3). */
export interface AppealDecisionEvent {
  readonly blockNumber: bigint;
  readonly appealedAt: UnixSeconds;
}

/** The arbitrable's own dispute ID, resolved per family (spec 5.3 step 2). */
export type LocalIdResolution =
  | { readonly kind: "local-id"; readonly value: bigint } // externalIDtoLocalID (idr-*)
  | { readonly kind: "transaction-id"; readonly value: bigint } // disputeIDtoTransactionID (escrow-v1)
  | { readonly kind: "not-applicable" } // governor, view-only
  | { readonly kind: "unresolved"; readonly reason: "reverted" | "rpc-error" };

/** `appealCost(id, 0x)` and `appealPeriod(id)`, read only in periods 3 and 4 (spec 5.3 step 7). */
export interface AppealInfo {
  readonly appealCost: bigint;
  readonly appealPeriodStart: UnixSeconds;
  readonly appealPeriodEnd: UnixSeconds;
}

/** The per-dispute reads of spec 5.3 without the dead ones (D-11). Each degrades on its own (D-36). */
export interface DisputeReads {
  readonly dispute: ArbitratorDispute;
  readonly binding: ArbitratedBinding;
  /** `getDispute(id).votesLengths`; `numberOfVotes` is the first round's count (spec 5.8). */
  readonly votesLengths: Outcome<readonly bigint[]>;
  readonly currentRuling: Outcome<bigint>;
  readonly appealDecisions: Outcome<readonly AppealDecisionEvent[]>;
  /** Present only when the period is 3 or 4. */
  readonly appealInfo: Outcome<AppealInfo> | null;
  readonly localId: LocalIdResolution;
}

/** One court (spec 6.1, D-19). A failed policy fetch leaves `name` null ("name unavailable"), never blocks the others. */
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

/** Every period the dispute passes through: commit only for hidden-vote courts, execution always (D-39). */
export interface Timeline {
  readonly columns: readonly TimelineColumn[];
}

/** Decision alert (spec 5.9). `appealHint`: "Go to arbitrable application to appeal" when view-only. */
export type Decision =
  | { readonly kind: "none" }
  | { readonly kind: "jury-decision"; readonly ruling: bigint; readonly rulingText: string; readonly appealHint: boolean }
  | { readonly kind: "winner"; readonly ruling: bigint; readonly rulingText: string; readonly wonBy: "default" | "jury" };

export type Compatibility = "full" | "view-only";

/** Everything the case page renders above the accordion (04 §1 case-page snapshot). */
export type DisputeView =
  | { readonly exists: false; readonly reason: "not-found" | "no-arbitrator" }
  | { readonly exists: false; readonly reason: "unavailable"; readonly error: Unavailable } // lookup failed in transport, not "does not exist" (D-36, D-53)
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

/** One card of the Ongoing page (spec 3, D-37). The title comes from the meta-evidence pipeline, joined in `web`. */
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

/** Inputs of the arbitrator reads. */
export interface DisputeReadContext {
  readonly chainId: ChainId;
  /** `undefined` when the chain has no RPC configured (D-56). */
  readonly client: ReadClient | undefined;
  readonly signal?: AbortSignal;
}

/** Inputs of the court list (Create page and case page). */
export interface CourtsContext extends DisputeReadContext {
  readonly fetcher: Fetcher;
  readonly env: Env;
}
