import type { ReadClientOptions, RequestBudget } from "../rpc/types";
import type { Address, ChainId, GetReadClient, Hex } from "../types";
import type { RulingOptions } from "../rulings/types";

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

/** Keyed by `"<arbitrator chain>:<lowercase proxy>:<dispute ID>"`. */
export interface KnownDisputeQuestion {
  readonly questionId: Hex;
  readonly questionBlock: number;
  readonly templateId: number;
}

/** Values read back are untrusted: core validates them with `isValidCachedQuestion` before use. */
export interface RealityQuestionCache {
  get(key: string): unknown;
  set(key: string, question: RealityQuestion): void;
  remove(key: string): void;
}

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

export type RealityStatus = "verified" | "malformed" | "unresolvable" | "unverified";

/** Unregistered Reality scripts get only `status` ("unverified" or "unresolvable"). */
export interface RealityQuestionInfo {
  readonly status: RealityStatus;
  readonly reason?: SafePopulateReason;
  readonly divergent?: boolean;
  readonly questionId?: Hex;
  readonly templateId?: string;
  readonly title?: string;
}

/** `question` is set only for entries with a `questionOverride`. */
export interface DerivedRealityOptions {
  readonly rulingOptions: RulingOptions;
  readonly realityQuestion: RealityQuestionInfo;
  readonly question?: string;
}

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
 * Every attempt of every request, retries included, must spend `budget` first (`rpc.createReadClient` with
 * `options.budget` does), so the lookup's request count and deadline bound what is actually sent.
 */
export type LookupReadClients = (budget: RequestBudget, options?: ReadClientOptions) => GetReadClient;
