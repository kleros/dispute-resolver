import type { Address, Env, Fetcher, Outcome, Period, ReadClient, Unavailable } from "../types";
import type { AppealRoute, FamilyDetection, RulingNoun } from "../families/types";
import type { RealityNotice } from "../metaEvidence/types";
import type { Settlement } from "../registry/types";

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

/** A revert of `disputes(id)` is `not-found`; a transport error is `unavailable`, not "does not exist". */
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
  | { readonly kind: "local-id"; readonly value: bigint } // externalIDtoLocalID (idr-*)
  | { readonly kind: "transaction-id"; readonly value: bigint } // disputeIDtoTransactionID (escrow-v1)
  | { readonly kind: "not-applicable" } // governor, view-only
  | { readonly kind: "unresolved"; readonly reason: "reverted" | "rpc-error" };

export interface AppealInfo {
  readonly appealCost: bigint;
  readonly appealPeriodStart: number;
  readonly appealPeriodEnd: number;
}

/** `getVoteCounter(id, round)` of KlerosLiquid: the counts per choice, 0 included, of one round. */
export interface VoteCounter {
  readonly winningChoice: bigint;
  readonly counts: readonly bigint[];
  readonly tied: boolean;
}

/** Why the court's ruling is 0: a tie at the top, a round nobody voted in, or a majority for refusing. */
export type ZeroRulingReason = "tie" | "no-votes" | "refused";

export interface DisputeReads {
  readonly dispute: ArbitratorDispute;
  readonly binding: ArbitratedBinding;
  readonly votesLengths: Outcome<readonly bigint[]>;
  readonly currentRuling: Outcome<bigint>;
  /**
   * The last round's vote counter, read in the appeal and execution periods when the current ruling is 0 and the
   * dispute has at most 256 choices. `null` when it is not read.
   */
  readonly lastRoundVotes: Outcome<VoteCounter> | null;
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

/**
 * What the arbitrable reports it executed, from its ERC-792 `Ruling` events for the dispute. It is the arbitrable's
 * own claim: read only once the arbitrator says the ruling was executed, and only from the arbitrable the arbitrator names.
 */
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

/** The court's ruling. `zeroReason` is set only for a ruling of 0 whose last round's vote counter was read. */
export interface JuryRuling extends RulingFact {
  readonly zeroReason: ZeroRulingReason | null;
}

/** Why the executed ruling could not be taken from the arbitrable's report. */
export type ExecutionNote = Exclude<ExecutedRuling["status"], "executed" | "not-executed">;

/**
 * The decision section. In the appeal period, the jury's ruling and how it can be appealed. In execution, a winner when
 * one can be named: `wonBy` is `jury` or `default` only on a contract whose rules were verified (`default` where they let
 * the only fully funded ruling win), and `reported` whenever the executed ruling is the arbitrable's own unverified
 * claim, even one equal to the jury's; `verified` says whether the contract's rules were read. Otherwise the jury's
 * ruling, with why no winner is named.
 */
export type Decision =
  | { readonly kind: "none" }
  | {
      readonly kind: "jury-decision";
      readonly jury: JuryRuling;
      /** `null` when the family is unknown. */
      readonly route: AppealRoute | null;
      readonly verified: boolean;
      readonly settlement: Settlement;
      readonly noun: RulingNoun;
    }
  | {
      readonly kind: "winner";
      readonly winner: RulingFact;
      readonly jury: JuryRuling;
      readonly wonBy: "jury" | "default" | "reported";
      readonly verified: boolean;
      /** `pending`: the arbitrator has not executed the ruling; `unconfirmed`: it has, but the arbitrable's report is missing. */
      readonly execution: "executed" | "pending" | "unconfirmed";
      readonly note: ExecutionNote | null;
      readonly noun: RulingNoun;
    }
  | { readonly kind: "jury-ruling"; readonly jury: JuryRuling; readonly execution: "pending" | ExecutionNote; readonly noun: RulingNoun };

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
