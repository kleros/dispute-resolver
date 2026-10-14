import type { Address, ChainId, Env, Fetcher, ScriptKind, ScriptRunner, Unavailable } from "../types";
import type { RealityQuestionCache, RealityQuestionInfo } from "../reality/types";
import type { Registry } from "../registry/types";
import type { FallbackOutcomes, RulingOptions } from "../rulings/types";
import type { CanonicalIpfsPath } from "../uri/types";

/**
 * A chain ID field read from untrusted meta-evidence. `absent` covers a missing key and every falsy value (today's
 * `field || chainID` default, spec 9.5). `invalid` means present but not an integer naming a configured chain (B5, B6):
 * the display allowlist key falls back to the arbitrator chain (D-34), while a script is not run (B5).
 */
export type ChainIdField = { readonly status: "absent" } | { readonly status: "valid"; readonly chainId: ChainId } | { readonly status: "invalid" };

/**
 * Meta-evidence after the dynamic-script merge (A23) and Zod validation (A7, C13, B12). Every rendered field is a
 * string or a validated structure; non-string scalars are coerced with today's sanitize rules or dropped.
 */
export interface MetaEvidence {
  /** "" when the merged JSON has no usable `title` (only `rulingOptions`, or neither: MODULES.md choice 8). */
  readonly title: string;
  readonly description: string;
  readonly question: string | null;
  readonly category: string | null;
  /**
   * Sanitized options when the merged JSON is valid in the sense of spec 9.1 (an object with a truthy `title` or
   * `rulingOptions`); `null`, today's absent `rulingOptions`, when it has neither (MODULES.md choice 8): no question
   * type label or voting options (5.13), and the 5.9 fallbacks for ruling text and appeal cards (5.12 item 5).
   */
  readonly rulingOptions: RulingOptions | null;
  /** First non-empty of `dispute.template.outcomes`, `template.outcomes`, `outcomes`, `question.outcomes` (spec 5.9, 9.2). */
  readonly fallbackOutcomes: FallbackOutcomes;
  /** Raw untrusted references; turned into links only through `uri` (A10, D-26, D-28, D-32). */
  readonly fileURI: string | null;
  /** Legacy `evidenceDisplayInterfaceURL` is renamed to this key before validation (spec 9.1 step 4). */
  readonly evidenceDisplayInterfaceURI: string | null;
  readonly arbitrableInterfaceURI: string | null;
  /** `{address: name}`; entries whose key is not an address are dropped. */
  readonly aliases: Readonly<Record<string, string>>;
  readonly dynamicScriptURI: string | null;
  readonly arbitratorChainID: ChainIdField;
  readonly arbitrableChainID: ChainIdField;
  /** `_v`: "0" or absent selects JSON query encoding of the display parameters, anything else `URLSearchParams` (spec 9.4). */
  readonly displayParamsVersion: string | null;
  /** Derived, never read from the JSON: set by the Reality derivation (registered proxies) or the script mapping (A4). */
  readonly realityQuestion: RealityQuestionInfo | null;
}

/** Why a meta-evidence was replaced by the INVALID placeholder (A2). Never cached. */
export type MetaEvidenceRejection = "uri-not-content-addressed" | "script-uri-not-content-addressed" | "script-not-allowlisted";

/** Why loading failed. Cached briefly in memory only (D-38), never persisted. */
export type MetaEvidenceFailure =
  | "locator-error" // the meta-evidence API failed or answered garbage
  | "fetch-error" // the gateway fetch failed
  | "not-json" // the file is not JSON (mainnet 560 is a PDF, Gnosis 140 is unparseable)
  | "schema-invalid" // the merged JSON is not a plain object
  | "unknown-chain" // a script parameter chain ID is invalid or unconfigured (B5, D-18)
  | "script-failed" // the runner reported failure (timeout, error) within the budget
  | "reality-lookup-failed" // the on-chain Reality lookup failed (A5)
  | "budget-exhausted"; // the overall budget of D-38 ran out

/** What happened to the dynamic script of an accepted meta-evidence. */
export type ScriptOutcome =
  | { readonly ran: false; readonly reason: "no-script" | "registered-reality-proxy" | "script-fetch-failed" }
  | { readonly ran: true; readonly kind: ScriptKind; readonly jsonDuplicateKeys: boolean };

export type MetaEvidenceResult =
  | {
      readonly status: "ok";
      readonly metaEvidence: MetaEvidence;
      readonly uri: CanonicalIpfsPath;
      /** Gateway URL of the meta-evidence file (parity snapshot `links.metaEvidenceFile`). */
      readonly fileUrl: string;
      readonly script: ScriptOutcome;
    }
  | { readonly status: "invalid"; readonly metaEvidence: MetaEvidence; readonly reason: MetaEvidenceRejection }
  | { readonly status: "missing" } // the locator returned no `metaEvidenceUri` (spec 9.1 step 1)
  | { readonly status: "failed"; readonly reason: MetaEvidenceFailure; readonly error: Unavailable };

/** How a result may be cached (A2, B15, D-13, D-38): only `ok` is persisted; rejections are never cached. */
export type MetaEvidenceCachePolicy = "persist" | "memory-brief" | "never";

/** The single notice of spec 5.10, in its fixed priority order. */
export type RealityNoticeKind = "none" | "unresolvable" | "unverified" | "divergent" | "malformed";

export interface RealityNotice {
  readonly kind: RealityNoticeKind;
  /** "Question recorded on-chain: {title}" when set. */
  readonly title: string | null;
}

/** Everything one meta-evidence load needs. All I/O is injected. */
export interface MetaEvidenceContext {
  readonly arbitratorChainId: ChainId;
  readonly disputeId: bigint;
  /** From the arbitrator (`disputes(id).arbitrated`), never from meta-evidence (A22). */
  readonly arbitrable: Address;
  /** Also the source of the Reality lookup's read RPCs: its clients are built per lookup around its budget (spec 9.1, A5). */
  readonly env: Env;
  readonly fetcher: Fetcher;
  readonly runner: ScriptRunner;
  readonly realityCache?: RealityQuestionCache;
  readonly registry?: Registry;
  /** Total budget for locator, fetch, script and Reality lookup together (D-38): `CASE_PAGE_BUDGET_MS` or `ONGOING_BUDGET_MS`. */
  readonly budgetMs: number;
  readonly signal?: AbortSignal;
}
