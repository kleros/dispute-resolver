import type { Address, ChainId, Hex } from "../types";
import type { RealityProxyEntry } from "../registry/types";

/** The behavioral class of an arbitrable (06 §1), in detection order. */
export type Family = "reality-proxy" | "escrow-v1" | "governor" | "idr-v2" | "idr-v1" | "idr-legacy" | "view-only";

/** Families decided by bytecode probes alone; a registered Reality proxy also gets one of these for its write paths. */
export type ProbedFamily = Exclude<Family, "reality-proxy">;

/** How the arbitrable's own dispute ID is found from the arbitrator dispute ID (spec 5.3 step 2). */
export type LocalIdSource = "externalIDtoLocalID" | "disputeIDtoTransactionID" | "none";

/** Evidence submission dialect. */
export type EvidenceCapability =
  | { readonly kind: "local-id" } // submitEvidence(uint256 localId, string uri): idr-*, escrow-v1 (transaction ID)
  | { readonly kind: "uri-only" } // submitEvidence(string uri): governors that have it
  | { readonly kind: "none" }; // view-only, kleros.eth governor (06 §3 invariant 6)

/** Appeal funding dialect (06 §1 rows 2–6, D-46, D-47). */
export type AppealCapability =
  | { readonly kind: "idr"; readonly fundAppeal: "fundAppeal(uint256,uint256)" | "fundAppeal(uint256,uint8)" }
  | { readonly kind: "governor" } // fundAppeal(uint256 listIndex)
  | { readonly kind: "escrow-pay-cost" } // appeal(uint256 transactionID) paying the arbitrator's appeal cost
  | { readonly kind: "none" };

/** Withdrawal dialect (D-46, D-49). */
export type WithdrawCapability =
  | { readonly kind: "idr-v2" } // withdrawFeesAndRewardsForAllRounds(uint256,address,uint256)
  | { readonly kind: "idr-v1" } // withdrawFeesAndRewardsForAllRounds(uint256,address,uint256[])
  | { readonly kind: "governor" } // withdrawFeesAndRewards(address,uint256,uint256,uint256)
  | { readonly kind: "unsupported" } // idr-legacy: shown as "not supported through the resolver"
  | { readonly kind: "none" }; // escrow-v1, view-only: no withdraw panel

/** What the app may do with an arbitrable. Derived from the probed family only, never from an address list. */
export interface Capabilities {
  readonly localId: LocalIdSource;
  readonly evidence: EvidenceCapability;
  readonly appeal: AppealCapability;
  readonly withdraw: WithdrawCapability;
}

/** The result of family detection for one arbitrable on one arbitrator chain. */
export interface FamilyDetection {
  readonly chainId: ChainId;
  readonly arbitrable: Address;
  /** First matching row of 06 §1. */
  readonly family: Family;
  /** Rows 2–7 evaluated on the bytecode; equals `family` except for registered Reality proxies (rows 4–6 only apply to them). */
  readonly writeFamily: ProbedFamily;
  readonly capabilities: Capabilities;
  readonly realityProxy: RealityProxyEntry | null;
  /** The EIP-1967 implementation whose code was scanned, or `null` when the arbitrable's own code was scanned. */
  readonly implementation: Address | null;
  /** Probe selectors found in the scanned code (for tests and diagnostics). */
  readonly selectors: readonly Hex[];
}

/** Session-only cache of detections keyed by chain and address (C11): never persisted. */
export interface FamilyCache {
  get(chainId: ChainId, address: Address): Promise<FamilyDetection> | undefined;
  set(chainId: ChainId, address: Address, detection: Promise<FamilyDetection>): void;
  delete(chainId: ChainId, address: Address): void;
}
