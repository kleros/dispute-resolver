import type { Address, Outcome, Period, ReadClient, Unavailable, UnixSeconds } from "../types";
import type { AppealInfo, ArbitratedBinding, LocalIdResolution } from "../disputes/types";
import type { FamilyDetection } from "../families/types";
import type { BehaviorOverride } from "../registry/types";
import type { FallbackOutcomes, RulingOptions, VariableQuestionType } from "../rulings/types";

/** Appeal multipliers, all in the arbitrable's own basis. */
export interface Multipliers {
  readonly winnerStakeMultiplier: bigint;
  readonly loserStakeMultiplier: bigint;
  /** A governor without a getter has `denominator / 2`, which KlerosGovernor fixes. */
  readonly loserAppealPeriodMultiplier: bigint;
  /** A governor without a getter has 10000, which KlerosGovernor fixes. */
  readonly denominator: bigint;
  /** Governors only: what every list pays when the current ruling is 0. Absent when the governor has no getter. */
  readonly sharedMultiplier?: bigint;
}

export interface SideRequirement {
  readonly total: bigint;
  readonly deadline: UnixSeconds;
}

export interface AppealAmounts {
  readonly winner: SideRequirement;
  readonly loser: SideRequirement;
  /** Every governor list when the current ruling is 0; present when the multipliers carry `sharedMultiplier`. */
  readonly shared?: SideRequirement;
}

export interface RulingAmount {
  readonly ruling: bigint;
  readonly amount: bigint;
}

/**
 * Funding of one round. For the IDisputeResolver families, sums of `Contribution` events and the `RulingFunded`
 * rulings; for governors, the round's `getRoundInfo`.
 */
export interface RoundFunding {
  readonly round: bigint;
  /** Total contributed per ruling, all contributors. */
  readonly contributions: readonly RulingAmount[];
  /** Rulings with a `RulingFunded` event in this round; "won by default" uses its length. */
  readonly fundedRulings: readonly bigint[];
}

export interface AppealContext {
  readonly client: ReadClient;
  readonly binding: ArbitratedBinding;
  readonly family: FamilyDetection;
  readonly localId: LocalIdResolution;
  readonly override: BehaviorOverride | undefined;
  /**
   * The evidence group of the dispute's ERC-1497 `Dispute` event (`evidence.readDisputeEvent`). A governor emits its
   * session index there, so its round and withdraw reads need it; other families ignore it. The governor's current
   * session is not a substitute: it moves on once the ruling is executed.
   */
  readonly evidenceGroupId?: bigint;
  readonly signal?: AbortSignal;
}

export type CardOrigin = "refuse" | "reserved" | "option" | "combination" | "contributed-value" | "current-ruling";

export interface CrowdfundingCard {
  readonly origin: CardOrigin;
  readonly title: string;
  /** The ruling code sent to `fundAppeal`. */
  readonly code: bigint;
  /** "Latest jury decision". */
  readonly isWinner: boolean;
  readonly required: bigint;
  readonly contributed: bigint;
  readonly remaining: bigint;
  /** `contributed × 10000 / required / 100`, two decimals, 0 when `required` is 0. */
  readonly fundedPercent: number;
  readonly deadline: UnixSeconds;
}

/** The free-input card of variable-type questions; funded at the loser amount and deadline. */
export interface FreeInputCard {
  readonly type: VariableQuestionType;
  readonly precision: number | undefined;
  readonly required: bigint;
  readonly deadline: UnixSeconds;
}

/** Multiple-select above four options: the user ticks options and funds the resulting combination at the loser amount. */
export interface MultipleSelectComposer {
  readonly titles: readonly string[];
  readonly required: bigint;
  readonly deadline: UnixSeconds;
}

/** One withdrawable entry; the action withdraws them in sequence, one transaction each. */
export type WithdrawItem =
  | { readonly dialect: "idr-v2" | "idr-v1"; readonly ruling: bigint; readonly amount: bigint }
  | { readonly dialect: "governor"; readonly session: bigint; readonly round: bigint; readonly listIndex: bigint; readonly amount: bigint };

export type WithdrawState =
  | { readonly status: "no-account" }
  | { readonly status: "nothing" }
  | { readonly status: "available"; readonly beneficiary: Address; readonly total: bigint; readonly items: readonly WithdrawItem[] }
  | { readonly status: "unavailable"; readonly error: Unavailable };

export type AppealPanel =
  | { readonly kind: "hidden" }
  | { readonly kind: "handled-by-arbitrable" }
  | { readonly kind: "escrow-appeal"; readonly appealCost: bigint; readonly deadline: UnixSeconds }
  | { readonly kind: "escrow-ended" }
  | {
      readonly kind: "crowdfunding";
      readonly dialect: "idr" | "governor";
      readonly cards: readonly CrowdfundingCard[];
      readonly freeInput: FreeInputCard | null;
      readonly composer: MultipleSelectComposer | null;
    }
  | { readonly kind: "fees-unavailable"; readonly error: Unavailable }
  | { readonly kind: "withdraw"; readonly state: WithdrawState }
  | { readonly kind: "withdraw-unsupported" };

/** Everything `buildAppealPanel` needs; every read is already done. `null` means "not read in this period". */
export interface AppealPanelInput {
  readonly family: FamilyDetection;
  readonly period: Period;
  readonly localId: LocalIdResolution;
  readonly override: BehaviorOverride | undefined;
  readonly rulingOptions: RulingOptions;
  readonly fallbackOutcomes: FallbackOutcomes;
  readonly currentRuling: Outcome<bigint>;
  readonly appealInfo: Outcome<AppealInfo> | null;
  readonly multipliers: Outcome<Multipliers> | null;
  /** The current funding round. */
  readonly funding: Outcome<RoundFunding> | null;
  /** Execution period only. */
  readonly withdraw: WithdrawState | null;
}

export interface CrowdfundingSet {
  readonly cards: readonly CrowdfundingCard[];
  readonly freeInput: FreeInputCard | null;
  readonly composer: MultipleSelectComposer | null;
}
