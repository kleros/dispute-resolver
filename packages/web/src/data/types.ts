import type {
  AppealInfo,
  AppealPanel,
  ArbitratedBinding,
  BehaviorOverride,
  ChainConfig,
  ChainId,
  Court,
  DisputeEventResult,
  DisputeLookup,
  DisputeView,
  Env,
  EvidenceList,
  FamilyCache,
  FamilyDetection,
  Fetcher,
  GatewayOrigin,
  GetReadClient,
  Hex,
  LocalIdResolution,
  MetaEvidenceResult,
  OngoingList,
  RealityQuestionCache,
  Registry,
  ScriptRunner,
  Unavailable,
} from "@dispute-resolver/core";

/** What every data hook returns (ARCHITECTURE.md §5.3). Hooks never throw to React. */
export type SectionData<T> = { readonly status: "loading" } | { readonly status: "ready"; readonly value: T } | { readonly status: "unavailable"; readonly error: Unavailable };

/** A mined transaction, read through the configured RPC (A13, ARCHITECTURE.md §6.4). */
export interface WriteReceipt {
  readonly transactionHash: Hex;
  readonly status: "success" | "reverted";
  readonly blockNumber: bigint;
  /** Enough for `disputeIdFromReceipt` (spec 4.5 step 8). */
  readonly logs: readonly { readonly address: string; readonly topics: readonly Hex[] }[];
  /**
   * Set when the awaited transaction was replaced and this is the receipt of the replacement, with viem's
   * `ReplacementReason` and the awaited hash. Only `repriced` executed the awaited call (D-07, D-51).
   */
  readonly replacement?: { readonly reason: "cancelled" | "replaced" | "repriced"; readonly replacedHash: Hex };
}

/** The injected dependencies of every core call, built once by `DataProvider` (ARCHITECTURE.md §5.1). */
export interface CoreDeps {
  readonly env: Env;
  readonly getReadClient: GetReadClient;
  readonly fetcher: Fetcher;
  readonly runner: ScriptRunner;
  readonly familyCache: FamilyCache;
  readonly realityCache: RealityQuestionCache;
  readonly gateway: GatewayOrigin;
  readonly registry: Registry;
  waitForReceipt(chainId: ChainId, hash: Hex): Promise<WriteReceipt>;
}

/** Which meta-evidence budget a caller uses: `CASE_PAGE_BUDGET_MS` or `ONGOING_BUDGET_MS` (D-37, D-38). */
export type MetaEvidenceBudget = "case" | "ongoing";

/** The title of an Ongoing card (spec 3, D-37). A failed load is the hook's `unavailable` state ("title unavailable"). */
export type OngoingTitle = { readonly kind: "title"; readonly text: string } | { readonly kind: "missing" };

export interface OngoingData {
  readonly list: SectionData<OngoingList>;
  readonly courts: SectionData<readonly Court[]>;
}

/** Everything the write builders of core need for this dispute; the target always comes from the arbitrator (A22). */
export interface CaseWriteContext {
  readonly binding: ArbitratedBinding;
  readonly family: FamilyDetection;
  readonly localId: LocalIdResolution;
  readonly override: BehaviorOverride | undefined;
  /** Periods 3 and 4 only. */
  readonly appealInfo: AppealInfo | null;
}

/** One dispute on the case page; every field degrades on its own (D-36). */
export interface CaseDispute {
  readonly status: "dispute";
  readonly chainId: ChainId;
  readonly disputeId: bigint;
  readonly lookup: SectionData<DisputeLookup>;
  readonly view: SectionData<DisputeView>;
  readonly family: SectionData<FamilyDetection>;
  readonly metaEvidence: SectionData<MetaEvidenceResult>;
  readonly disputeEvent: SectionData<DisputeEventResult>;
  readonly evidence: SectionData<EvidenceList>;
  readonly courts: SectionData<readonly Court[]>;
  readonly appealPanel: SectionData<AppealPanel>;
  readonly write: SectionData<CaseWriteContext>;
}

/** `useCase` result: no ID in the URL (D-09) or one dispute. */
export type CaseData = { readonly status: "no-id"; readonly chainId: ChainId } | CaseDispute;

/** Props of every case section component (`case-summary`, `case-appeal`, `case-evidence`). */
export interface CaseSectionProps {
  readonly dispute: CaseDispute;
  readonly chain: ChainConfig;
}

/** What a mined write refreshes (ARCHITECTURE.md §5.6). */
export type RefreshScope = "evidence" | "appeal" | "withdraw";
