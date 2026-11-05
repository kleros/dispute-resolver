import type {
  Address,
  AppealDecisionEvent,
  AppealPanel,
  ArbitratedBinding,
  ChainConfig,
  Court,
  Decision,
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
  Outcome,
  RealityQuestionCache,
  Registry,
  ScriptRunner,
  SimulationResult,
  Unavailable,
  WriteCall,
} from "@dispute-resolver/core";

export type SectionData<T> = { readonly status: "loading" } | { readonly status: "ready"; readonly value: T } | { readonly status: "unavailable"; readonly error: Unavailable };

export interface WriteReceipt {
  readonly transactionHash: Hex;
  readonly status: "success" | "reverted";
  readonly blockNumber: bigint;
  readonly logs: readonly { readonly address: string; readonly topics: readonly Hex[] }[];
  /**
   * Set when the awaited transaction was replaced and this is the receipt of the replacement, with viem's
   * `ReplacementReason`. Only `repriced` executed the awaited call.
   */
  readonly replacement?: { readonly reason: "cancelled" | "replaced" | "repriced" };
}

export interface CoreDeps {
  readonly env: Env;
  readonly getReadClient: GetReadClient;
  readonly fetcher: Fetcher;
  readonly runner: ScriptRunner;
  readonly familyCache: FamilyCache;
  readonly realityCache: RealityQuestionCache;
  readonly gateway: GatewayOrigin;
  readonly registry: Registry;
  waitForReceipt(chainId: number, hash: Hex): Promise<WriteReceipt>;
  /** Checks a write against its contract through the call chain's read RPC, as `from` would send it; never the wallet's transport. */
  simulate(call: WriteCall, from: Address): Promise<SimulationResult>;
}

export type MetaEvidenceBudget = "case" | "ongoing";

export type OngoingTitle = { readonly kind: "title"; readonly text: string } | { readonly kind: "missing" };

export interface OngoingData {
  readonly list: SectionData<OngoingList>;
  readonly courts: SectionData<readonly Court[]>;
}

/** The write target always comes from the arbitrator, never from the meta-evidence. */
export interface CaseWriteContext {
  readonly binding: ArbitratedBinding;
  readonly family: FamilyDetection;
  readonly localId: LocalIdResolution;
  readAppealCost(): Promise<Outcome<bigint>>;
}

export interface CaseDispute {
  readonly status: "dispute";
  readonly chainId: number;
  readonly disputeId: bigint;
  readonly lookup: SectionData<DisputeLookup>;
  readonly view: SectionData<DisputeView>;
  readonly family: SectionData<FamilyDetection>;
  readonly metaEvidence: SectionData<MetaEvidenceResult>;
  readonly disputeEvent: SectionData<DisputeEventResult>;
  readonly evidence: SectionData<EvidenceList>;
  readonly appealDecisions: SectionData<readonly AppealDecisionEvent[]>;
  readonly courts: SectionData<readonly Court[]>;
  readonly appealPanel: SectionData<AppealPanel>;
  /** The jury's decision and, in execution, the winner; it degrades on its own, never the header or the timeline. */
  readonly decision: SectionData<Decision>;
  readonly write: SectionData<CaseWriteContext>;
}

export type FoundLookup = Extract<DisputeLookup, { status: "found" }>;

export type CaseData = { readonly status: "no-id"; readonly chainId: number } | CaseDispute;

export interface CaseSectionProps {
  readonly dispute: CaseDispute;
  readonly chain: ChainConfig;
}

export type RefreshScope = "evidence" | "appeal" | "withdraw";
