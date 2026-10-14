import type { Address, AppealPanel, ChainId, Family, Period, RealityNoticeKind, TimelineColumnName, UnixSeconds } from "@dispute-resolver/core";

export type { DataAttributeName, TestId } from "./ids";

/** `case-page` `data-state` (§12.1); `exists` in the parity snapshot is `state === "dispute"`. */
export type CasePageState = "dispute" | "not-found" | "no-arbitrator" | "unavailable" | "no-id" | "loading";

/** `case-page` `data-compatibility` (04 §1): the case-page "View mode only" banner is `view-only`. */
export type CaseCompatibility = "full" | "view-only";

/** `ongoing-page` `data-state` (§12.2). */
export type OngoingState = "list" | "empty" | "no-arbitrator" | "failed" | "loading";

/** `case-decision` `data-kind` (04 §1). */
export type DecisionKind = "none" | "jury-decision" | "winner";

/** `case-decision` `data-won-by` (04 §1): who decided a `winner`. */
export type DecisionWonBy = "default" | "jury";

/** `timeline-column` `data-state` (04 §1). */
export type TimelineColumnState = "concluded" | "current" | "upcoming";

/** `appeal-panel` `data-kind`: 04 §1's six kinds plus `handled-by-arbitrable` and `withdraw-unsupported` (§12.1). */
export type AppealPanelKind = AppealPanel["kind"];

/** The inputs of the `case-page` hook. Optional fields are absent from the element when they are `null` or `undefined`. */
export interface CasePageHook {
  readonly state: CasePageState;
  readonly arbitrable?: Address | null;
  /** `unknown` when no family was detected (a bad dispute still renders). */
  readonly family?: Family | "unknown" | null;
  readonly compatibility?: CaseCompatibility | null;
  readonly period?: Period | null;
  readonly lastPeriodChange?: UnixSeconds | null;
  readonly realityNotice?: RealityNoticeKind | null;
}

/** The ruling options as the extractor reads them (`titles` and `reserved` are always present in the snapshot). */
export interface RulingOptionsHook {
  readonly type: string;
  readonly titles?: readonly string[];
  readonly reserved?: Readonly<Record<string, string>>;
  readonly precision?: number;
}

export interface TimelineColumnHook {
  readonly name: TimelineColumnName;
  readonly state: TimelineColumnState;
}

export interface DecisionHook {
  readonly kind: DecisionKind;
  readonly wonBy?: DecisionWonBy | null;
}

export interface AppealPanelHook {
  readonly kind: AppealPanelKind;
  /** Written only for `withdraw`, whatever else is passed. */
  readonly withdrawableWei?: bigint | null;
}

export interface AppealCardHook {
  /** The ruling code. */
  readonly code: bigint;
  readonly fundedPercent: number;
  readonly remainingWei: bigint;
  readonly deadline?: UnixSeconds | null;
}

export interface EvidenceItemHook {
  /** The submitter address as the evidence event reports it. */
  readonly submitter: string;
  readonly timestamp: UnixSeconds;
}

export interface OngoingPageHook {
  readonly chain: ChainId;
  readonly state: OngoingState;
}

export interface OngoingCardHook {
  readonly disputeId: bigint;
  readonly period: Period;
}

export interface CreatePageHook {
  readonly chain: ChainId;
  readonly available: boolean;
}

export interface OptionRangeHook {
  readonly min: number;
  readonly max: number;
}

/** A Create form field wrapper: `data-field` is the field name, `data-required="true"` only on required fields. */
export interface FieldHook {
  readonly field: string;
  readonly required: boolean;
}
