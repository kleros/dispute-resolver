import type { ReadClientOptions, RequestBudget } from "../rpc/types";
import type { Address, ChainId, GetReadClient, Hex } from "../types";
import type { RulingOptions } from "../rulings/types";

/** A Reality.eth question as read on-chain (today's `fetchRealityQuestion` result, unchanged). */
export interface RealityQuestion {
  readonly questionId: Hex;
  /** Decimal string. */
  readonly templateId: string;
  readonly templateText: string;
  /** Parameters separated by U+241F. */
  readonly questionText: string;
  readonly reality: Address;
  readonly realityChainId: ChainId;
}

/** A known-questions map entry, keyed by `"<arbitrator chain>:<lowercase proxy>:<dispute ID>"` (generated file). */
export interface KnownDisputeQuestion {
  readonly questionId: Hex;
  readonly questionBlock: number;
  readonly templateId: number;
}

/**
 * Persistent cache of looked-up questions, implemented in `web` over localStorage under today's key
 * `@@kleros/court/reality-question/v1/{chain}/{proxy}/{disputeId}`. Values read back are `unknown` and validated by
 * core (`isValidCachedQuestion`) before use; invalid entries are removed.
 */
export interface RealityQuestionCache {
  get(key: string): unknown;
  set(key: string, question: RealityQuestion): void;
  remove(key: string): void;
}

/** Why safe template population failed (today's reasons, unchanged). */
export type SafePopulateReason =
  | "invalid-input"
  | "invalid-template"
  | "param-count-mismatch"
  | "unsupported-placeholder"
  | "invalid-outcomes"
  | "invalid-value"
  | "invalid-json"
  | "duplicate-keys"
  | "key-mismatch"
  | "type-mismatch";

/** A populated Reality question JSON; untrusted beyond its structure. */
export type PopulatedQuestion = Readonly<Record<string, unknown>>;

export type SafePopulateResult =
  | { readonly ok: true; readonly question: PopulatedQuestion }
  | { readonly ok: false; readonly reason: SafePopulateReason; readonly question?: PopulatedQuestion; readonly bestEffort?: boolean };

/** Status of a Reality-derived option set (spec 9.1, 5.10). */
export type RealityStatus = "verified" | "malformed" | "unresolvable" | "unverified";

/**
 * `realityQuestion` of the meta-evidence. Registered proxies get every field from the on-chain derivation; unregistered
 * Reality scripts get only `status` ("unverified" or "unresolvable", A4).
 */
export interface RealityQuestionInfo {
  readonly status: RealityStatus;
  readonly reason?: SafePopulateReason;
  readonly divergent?: boolean;
  readonly questionId?: Hex;
  readonly templateId?: string;
  readonly title?: string;
}

/** The output of `deriveRealityRulingOptions`. `question` is set only for entries with a `questionOverride`. */
export interface DerivedRealityOptions {
  readonly rulingOptions: RulingOptions;
  readonly realityQuestion: RealityQuestionInfo;
  readonly question?: string;
}

/** Tunables of the lookup, today's `LOOKUP_LIMITS`. */
export interface RealityLookupLimits {
  readonly requestTimeoutMs: number;
  readonly deadlineMs: number;
  readonly requestBudget: number;
  readonly retryDelaysMs: readonly number[];
  readonly windowSize: number;
  readonly minWindowSize: number;
  readonly windowShrinkFactor: number;
  readonly concurrency: number;
}

/**
 * Builds the read clients of one lookup around its `budget`: every attempt of every request, retries included, must spend
 * it first (`rpc.createReadClient` with `options.budget` does), so the lookup's request count and deadline bound what is
 * actually sent (spec 9.1, A5). `options` overrides the transport policy, as `retryCount: 0` does for the one request a
 * lookup does not retry.
 */
export type LookupReadClients = (budget: RequestBudget, options?: ReadClientOptions) => GetReadClient;
