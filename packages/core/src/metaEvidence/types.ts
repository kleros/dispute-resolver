import type { Address, Env, Fetcher, ScriptKind, ScriptRunner, Unavailable } from "../types";
import type { RealityQuestionCache, RealityQuestionInfo } from "../reality/types";
import type { Registry } from "../registry/types";
import type { FallbackOutcomes, RulingOptions } from "../rulings/types";
import type { CanonicalIpfsPath } from "../uri/types";

/**
 * A chain ID field read from untrusted meta-evidence. `absent` covers a missing key and every falsy value. `valid` names
 * a configured chain. `unsupported` is a safe positive integer the chain table lacks (Optimism's 10): the evidence
 * display is told that number, with no RPC for it. `invalid` is any other present value: the evidence display falls
 * back to the arbitrator chain. A script is run for neither.
 */
export type ChainIdField =
  | { readonly status: "absent" }
  | { readonly status: "valid"; readonly chainId: number }
  | { readonly status: "unsupported"; readonly chainId: number }
  | { readonly status: "invalid" };

export interface MetaEvidence {
  readonly title: string;
  readonly description: string;
  readonly question: string | null;
  readonly category: string | null;
  /**
   * `null` when the merged JSON has neither a truthy `title` nor `rulingOptions`: no question type label or voting
   * options, and the fallbacks for ruling text and appeal cards.
   */
  readonly rulingOptions: RulingOptions | null;
  readonly fallbackOutcomes: FallbackOutcomes;
  /** Raw untrusted references; turned into links only through `uri`. */
  readonly fileURI: string | null;
  /** Legacy `evidenceDisplayInterfaceURL` is renamed to this key before validation. */
  readonly evidenceDisplayInterfaceURI: string | null;
  readonly arbitrableInterfaceURI: string | null;
  /** `{address: name}`; entries whose key is not an address are dropped. */
  readonly aliases: Readonly<Record<string, string>>;
  readonly dynamicScriptURI: string | null;
  readonly arbitratorChainID: ChainIdField;
  readonly arbitrableChainID: ChainIdField;
  /** `_v`: "0" or absent selects JSON query encoding of the display parameters, anything else `URLSearchParams`. */
  readonly displayParamsVersion: string | null;
  /** Derived, never read from the JSON: set by the Reality derivation (registered proxies) or the script mapping. */
  readonly realityQuestion: RealityQuestionInfo | null;
}

/** Why a meta-evidence was replaced by the INVALID placeholder. Never cached. */
export type MetaEvidenceRejection = "uri-not-content-addressed" | "script-uri-not-content-addressed" | "script-not-allowlisted";

/** Why loading failed. Cached briefly in memory only, never persisted. */
export type MetaEvidenceFailure = "locator-error" | "fetch-error" | "not-json" | "schema-invalid" | "script-failed" | "reality-lookup-failed" | "budget-exhausted";

/**
 * What happened to the dynamic script of an accepted meta-evidence. `script-chain-unavailable`: a chain ID the script
 * would be given is invalid or not a configured chain, so the static meta-evidence is used as fetched.
 */
export type ScriptOutcome =
  | { readonly ran: false; readonly reason: "no-script" | "registered-reality-proxy" | "script-fetch-failed" | "script-chain-unavailable" }
  | { readonly ran: true; readonly kind: ScriptKind; readonly jsonDuplicateKeys: boolean };

/** Why the arbitrable's `MetaEvidence` event did not decide the URI, so the locator did. */
export type OnChainFallbackReason = "dispute-event-not-found" | "dispute-event-ambiguous" | "meta-evidence-event-not-found";

/**
 * The URI the arbitrable recorded in its `MetaEvidence` event for the dispute's meta-evidence ID: the raw,
 * untrusted string of the latest emission, or why there is none. Built by the caller (web), which owns the chain reads.
 */
export type OnChainMetaEvidence =
  | { readonly status: "found"; readonly uri: string }
  | { readonly status: "not-found"; readonly reason: OnChainFallbackReason }
  | { readonly status: "unavailable"; readonly error: Unavailable };

/**
 * Reads the on-chain meta-evidence URI of the loaded dispute. Called once per load with the reader's own signal, which
 * aborts at `ON_CHAIN_WAIT_MS`, when the load ends and when the load's budget or caller aborts. A rejection or an abort is
 * `unavailable`.
 */
export type OnChainMetaEvidenceReader = (signal: AbortSignal) => Promise<OnChainMetaEvidence>;

/** What the meta-evidence locator answered next to a found event: compared by canonical path, never used. */
export type LocatorComparison = "agrees" | "disagrees" | "missing" | "unavailable";

/**
 * Which source decided an accepted meta-evidence. `event`: the arbitrable's `MetaEvidence` event won, with the locator's
 * answer for comparison and its canonical path when it had one. `locator`: the locator decided, with why the event did
 * not (`not-read` when the load had no on-chain reader).
 */
export type MetaEvidenceSource =
  | { readonly kind: "event"; readonly locator: LocatorComparison; readonly locatorPath: CanonicalIpfsPath | null }
  | { readonly kind: "locator"; readonly event: "not-read" | OnChainFallbackReason | "unavailable" };

export type MetaEvidenceResult =
  | {
      readonly status: "ok";
      readonly metaEvidence: MetaEvidence;
      readonly uri: CanonicalIpfsPath;
      readonly fileUrl: string;
      readonly script: ScriptOutcome;
      readonly source: MetaEvidenceSource;
    }
  | { readonly status: "invalid"; readonly metaEvidence: MetaEvidence; readonly reason: MetaEvidenceRejection }
  | { readonly status: "missing" } // the locator, in charge, returned no `metaEvidenceUri`
  | { readonly status: "failed"; readonly reason: MetaEvidenceFailure; readonly error: Unavailable };

export type MetaEvidenceCachePolicy = "persist" | "memory-brief" | "never";

export type RealityNoticeKind = "none" | "unresolvable" | "unverified" | "divergent" | "malformed";

export interface RealityNotice {
  readonly kind: RealityNoticeKind;
  readonly title: string | null;
}

export interface MetaEvidenceContext {
  readonly arbitratorChainId: number;
  readonly disputeId: bigint;
  /** From the arbitrator (`disputes(id).arbitrated`), never from meta-evidence. */
  readonly arbitrable: Address;
  /** Also the source of the Reality lookup's read RPCs: its clients are built per lookup around its budget. */
  readonly env: Env;
  readonly fetcher: Fetcher;
  readonly runner: ScriptRunner;
  readonly realityCache?: RealityQuestionCache;
  readonly registry?: Registry;
  readonly budgetMs: number;
  /** The on-chain meta-evidence URI: when it is found it wins over the locator's. Absent, the locator decides. */
  readonly onChain?: OnChainMetaEvidenceReader;
  readonly signal?: AbortSignal;
}
