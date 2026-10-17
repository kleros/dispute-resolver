// Parity snapshot shapes of docs/parity/04-golden-cases.md §1, as both extractors write them. A field that is `null` is
// absent from the rendered screen. Amounts are wei as decimal strings, times are Unix seconds, addresses keep the case the
// app rendered (the comparison ignores it). A field one app cannot show at all is listed in `unobservable` with the reason,
// and the comparison reports it as such instead of passing or failing it.

export type AppName = "production" | "new";

export type TimelineState = "concluded" | "current" | "upcoming";

export interface TimelineColumn {
  readonly name: string;
  readonly state: TimelineState;
}

export interface RulingOptionsSnapshot {
  readonly type: string;
  readonly titles: readonly string[];
  /** Reserved ruling codes (as the app wrote them) to their titles. */
  readonly reserved: Readonly<Record<string, string>>;
  readonly precision: number | null;
}

export type DecisionKind = "none" | "jury-decision" | "winner";

export interface DecisionSnapshot {
  readonly kind: DecisionKind;
  readonly rulingText: string;
  readonly wonBy: "default" | "jury" | null;
}

export interface AppealCardSnapshot {
  readonly title: string;
  /** The ruling code in decimal, or `null` for the free-input card. */
  readonly code: string | null;
  readonly fundedPercent: number | null;
  readonly remainingWei: string | null;
  /** Unix seconds; production renders only a countdown, so its value is the snapshot time plus the countdown. */
  readonly deadline: number | null;
}

export interface AppealPanelSnapshot {
  readonly kind: string;
  readonly cards: readonly AppealCardSnapshot[];
  /** Set only for `withdraw`, and only when the app shows an amount (production: the "Withdraw X" button, or zero). */
  readonly withdrawableWei: string | null;
}

export interface EvidenceSnapshot {
  readonly title: string;
  readonly descriptionText: string;
  /** The full address, or production's truncated `0x1234...abcd` form when its state could not be read. */
  readonly submitter: string;
  readonly timestamp: number | null;
  readonly attachmentHref: string | null;
}

export interface LinksSnapshot {
  readonly court: string | null;
  readonly arbitrableApp: string | null;
  readonly metaEvidenceFile: string | null;
}

export interface EvidenceDisplaySnapshot {
  readonly present: true;
  readonly srcOrigin: string;
  readonly srcPath: string;
  /** The frame parameters; every URL in them is its host and a fingerprint of the whole URL, so no key reaches a report. */
  readonly params: Readonly<Record<string, string>>;
  readonly sandbox: readonly string[];
  /** What the frame showed once the page settled; not compared, the `evidenceDisplay` highlight checks it (06 §5 item 2). */
  readonly rendered: EvidenceDisplayRendering;
}

export interface EvidenceDisplayRendering {
  /**
   * The origin and path of the document the frame holds: the `src` when it loaded, the browser's error page
   * (`chrome-error://chromewebdata/`) when it did not, `null` when the frame has no document.
   */
  readonly documentUrl: string | null;
  /** The frame body's visible text, whitespace collapsed, every URL as its host and a fingerprint, cut at 300 characters. */
  readonly text: string;
}

/** The fields of the Case snapshot the comparison walks, in report order. */
export const CASE_FIELDS = [
  "exists",
  "arbitrable",
  "family",
  "compatibility",
  "title",
  "question",
  "descriptionText",
  "rulingOptions",
  "period",
  "lastPeriodChange",
  "timeline",
  "numberOfVotes",
  "courtName",
  "decision.kind",
  "decision.rulingText",
  "decision.wonBy",
  "realityNotice",
  "appealPanel.kind",
  "appealPanel.cards",
  "appealPanel.withdrawableWei",
  "evidence",
  "hiddenEvidenceCount",
  "links.court",
  "links.arbitrableApp",
  "links.metaEvidenceFile",
  "evidenceDisplay",
] as const;

export type CaseField = (typeof CASE_FIELDS)[number];

export const ONGOING_FIELDS = ["state", "disputes"] as const;
export type OngoingField = (typeof ONGOING_FIELDS)[number];

export const CREATE_FIELDS = ["available", "courts", "defaultCost", "questionTypes", "optionRange", "validation.requiredFields"] as const;
export type CreateField = (typeof CREATE_FIELDS)[number];

export type SnapshotField = CaseField | OngoingField | CreateField;

interface SnapshotBase {
  readonly app: AppName;
  /** The page the snapshot was taken on, as the app's origin and the screen path (`recordedPageUrl`). */
  readonly url: string;
  /** Unix seconds when the snapshot was taken; time fields are compared relative to it. */
  readonly takenAt: number;
  /** Whether the page settled within its budget; an unsettled snapshot is still compared, and fails the settle check. */
  readonly settled: boolean;
  readonly unobservable: Readonly<Partial<Record<SnapshotField, string>>>;
}

export interface CaseSnapshot extends SnapshotBase {
  readonly screen: "case";
  /**
   * The account the page used: production's is the announced one once its header left the no-account state, the new
   * app's is the one its header shows as connected. `null` when the case ran without one or the app did not apply it.
   */
  readonly account: string | null;
  /** The page state: `dispute`, `not-found`, `loading` (timed out) and, on the new app, its other states. */
  readonly state: string;
  readonly exists: boolean;
  readonly arbitrable: string | null;
  readonly family: string | null;
  readonly compatibility: "full" | "view-only" | null;
  readonly title: string | null;
  readonly question: string | null;
  readonly descriptionText: string | null;
  readonly rulingOptions: RulingOptionsSnapshot | null;
  readonly period: number | null;
  readonly lastPeriodChange: number | null;
  readonly timeline: readonly TimelineColumn[] | null;
  readonly numberOfVotes: number | null;
  readonly courtName: string | null;
  readonly decision: DecisionSnapshot | null;
  readonly realityNotice: string | null;
  readonly appealPanel: AppealPanelSnapshot;
  readonly evidence: readonly EvidenceSnapshot[] | null;
  readonly hiddenEvidenceCount: number | null;
  readonly links: LinksSnapshot;
  readonly evidenceDisplay: EvidenceDisplaySnapshot | null;
  /** Whether the meta-evidence section loaded; the bad-dispute cases (D-36) read it. */
  readonly metaEvidenceLoaded: boolean;
  /**
   * The reason the meta-evidence section shows when it degraded (D-36: "unavailable" with the reason), or `null` when it
   * shows none. Production's is its "Failed to load metaevidence" text. Not compared: the bad-dispute checks read it.
   */
  readonly metaEvidenceFailure: string | null;
}

export interface OngoingDisputeSnapshot {
  readonly id: string;
  readonly title: string;
  readonly courtName: string;
  readonly period: number | null;
  readonly countdownPresent: boolean;
  /**
   * Production only: when the dispute's period ends by its own countdown (Unix seconds), its snapshot time once the
   * countdown is gone because the period's time is up, `null` when unknown and on the new app. Not compared: it decides
   * whether a period difference is a change between the two runs (04 §1).
   */
  readonly periodEndsAt: number | null;
}

export interface OngoingSnapshot extends SnapshotBase {
  readonly screen: "ongoing";
  readonly chain: number;
  readonly state: string;
  readonly disputes: readonly OngoingDisputeSnapshot[];
}

export interface CreateSnapshot extends SnapshotBase {
  readonly screen: "create";
  readonly chain: number;
  readonly available: boolean;
  readonly courts: readonly string[];
  readonly defaultCost: string | null;
  readonly questionTypes: readonly string[];
  readonly optionRange: readonly [number, number] | null;
  readonly validation: { readonly requiredFields: readonly string[] };
}

export type Snapshot = CaseSnapshot | OngoingSnapshot | CreateSnapshot;
