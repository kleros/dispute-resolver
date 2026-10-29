import type { Address, Env, Fetcher, Outcome, Period, ReadClient, Unavailable } from "../types";
import type { FamilyDetection, RulingNoun } from "../families/types";
import type { RealityNotice } from "../metaEvidence/types";

declare const arbitratorBinding: unique symbol;

/**
 * Read from the arbitrator (`disputes(id).arbitrated`). Every write builder takes it instead of a bare address, so
 * meta-evidence cannot choose the arbitrable.
 */
export interface ArbitratedBinding {
  readonly [arbitratorBinding]: true;
  readonly chainId: number;
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
  readonly lastPeriodChange: number;
  readonly ruled: boolean;
}

export type DisputeLookup =
  | { readonly status: "found"; readonly dispute: ArbitratorDispute; readonly binding: ArbitratedBinding }
  | { readonly status: "not-found" }
  | { readonly status: "no-arbitrator" }
  | { readonly status: "unavailable"; readonly error: Unavailable };

export interface AppealDecisionEvent {
  readonly blockNumber: bigint;
  readonly appealedAt: number;
}

export type LocalIdResolution =
  | { readonly kind: "local-id"; readonly value: bigint }
  | { readonly kind: "transaction-id"; readonly value: bigint }
  | { readonly kind: "not-applicable" }
  | { readonly kind: "unresolved"; readonly reason: "reverted" | "rpc-error" };

export interface AppealInfo {
  readonly appealCost: bigint;
  readonly appealPeriodStart: number;
  readonly appealPeriodEnd: number;
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
  | { readonly name: TimelineColumnName; readonly state: "current"; readonly deadline: number | null }
  | { readonly name: TimelineColumnName; readonly state: "upcoming"; readonly durationSeconds: bigint | null };

export interface Timeline {
  readonly columns: readonly TimelineColumn[];
}

export type ExecutedRuling =
  | { readonly status: "executed"; readonly ruling: bigint }
  | { readonly status: "not-executed" } // not in execution, or the arbitrator has not executed the ruling; nothing read
  | { readonly status: "none-reported" }
  | { readonly status: "inconsistent" } // different rulings, an undecodable event, or more events than accepted
  | { readonly status: "out-of-range"; readonly ruling: bigint } // above the dispute's number of choices
  | { readonly status: "unread"; readonly error: Unavailable };

export interface RulingFact {
  readonly ruling: bigint;
  readonly rulingText: string;
}

/**
 * Why the decision shows only the court's ruling. In the appeal period: it can be appealed, in the arbitrable's own
 * application, or not at all. In execution: the arbitrator has not executed it, or the arbitrable reported a ruling that
 * is not an option of the dispute, or several.
 */
export type JuryDecisionNote = "appealable" | "appealable-in-arbitrable" | "not-appealable" | "not-executed" | "out-of-range" | "inconsistent";

/**
 * The decision section. `winner` once the ruling was executed: the court's ruling (`jury`), the only ruling fully funded
 * for the appeal (`default`), or another ruling the arbitrable applied (`applied`).
 */
export type Decision =
  | { readonly kind: "none" }
  | { readonly kind: "jury-decision"; readonly court: RulingFact; readonly note: JuryDecisionNote }
  | { readonly kind: "winner"; readonly winner: RulingFact; readonly court: RulingFact; readonly wonBy: "jury" | "default" | "applied"; readonly noun: RulingNoun };

export type Compatibility = "full" | "view-only";

export type DisputeView =
  | { readonly exists: false; readonly reason: "not-found" | "no-arbitrator" }
  | { readonly exists: false; readonly reason: "unavailable"; readonly error: Unavailable }
  | {
      readonly exists: true;
      readonly chainId: number;
      readonly disputeId: bigint;
      readonly arbitrable: Address;
      readonly family: Outcome<FamilyDetection>;
      readonly compatibility: Compatibility;
      readonly period: Period;
      readonly lastPeriodChange: number;
      readonly timeline: Outcome<Timeline>;
      readonly numberOfVotes: Outcome<number>;
      readonly court: Outcome<Court>;
      readonly realityNotice: RealityNotice;
    };

export interface OngoingDispute {
  readonly id: bigint;
  readonly arbitrated: Address;
  readonly period: Period;
  readonly subcourtId: bigint;
  readonly lastPeriodChange: number;
  /** `lastPeriodChange + timesPerPeriod[period]`, or null when the court is unknown or the period is 4. */
  readonly countdownTarget: number | null;
}

export type OngoingList =
  | { readonly status: "no-arbitrator" }
  | { readonly status: "ok"; readonly disputes: readonly OngoingDispute[]; readonly failedIds: readonly bigint[] }
  | { readonly status: "failed"; readonly error: Unavailable };

export interface DisputeReadContext {
  readonly chainId: number;
  /** `undefined` when the chain has no RPC configured. */
  readonly client: ReadClient | undefined;
  readonly signal?: AbortSignal;
}

export interface CourtsContext extends DisputeReadContext {
  readonly fetcher: Fetcher;
  readonly env: Env;
}
