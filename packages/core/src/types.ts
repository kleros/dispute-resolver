/**
 * Cross-cutting primitives of `@dispute-resolver/core`, and the barrel that re-exports every module's types.
 *
 * This file is a barrel, not a layer: modules import primitives from `../types` and other modules' types only through
 * `../<module>/types`, never through this file. See MODULES.md.
 */
import type { Abi, ContractFunctionArgs, ContractFunctionName, PublicClient } from "viem";

/** An EVM chain ID. Only integers that name a configured chain are accepted from untrusted input (`chains`). */
// eslint-disable-next-line sonarjs/redundant-type-aliases -- the domain name is the contract of 06 §2 and documents intent at every use.
export type ChainId = number;

/** An EVM address, always lowercase inside core (registry invariant 1, 06 §2). */
export type Address = `0x${Lowercase<string>}`;

/** Hex data: bytecode, calldata, selectors, storage words, transaction hashes. */
export type Hex = `0x${string}`;

/** `"<arbitrator chain ID>:<lowercase arbitrable>"`, the key of every registry table (06 §2). */
export type RegistryKey = `${ChainId}:${Address}`;

/** Unix time in seconds. */
// eslint-disable-next-line sonarjs/redundant-type-aliases -- distinguishes seconds from milliseconds and block numbers.
export type UnixSeconds = number;

/**
 * The deployment environment, passed in by the caller. Core never reads `process.env` or `import.meta.env`.
 * Keys keep today's `REACT_APP_*` names (ADR 0002).
 */
export type Env = Readonly<Record<string, string | undefined>>;

/**
 * The subset of a viem `PublicClient` core reads through. Built only from the configured per-chain read RPC (`rpc`),
 * never from a wallet (A13). `request` is the raw JSON-RPC call, for reads whose viem action would hide a missing
 * result (`getCode` maps both `"0x"` and no result to `undefined`). Tests build one with
 * `createPublicClient({ transport: custom({ request }) })`.
 */
export type ReadClient = Pick<PublicClient, "readContract" | "getLogs" | "getContractEvents" | "getCode" | "getStorageAt" | "getBlockNumber" | "getBlock" | "call" | "request">;

/** Returns the read client of a chain, or `undefined` when the chain has no RPC configured (D-56, D-18). */
export type GetReadClient = (chainId: ChainId) => ReadClient | undefined;

/** Options core passes to an injected fetch. */
export interface FetchInit {
  readonly signal?: AbortSignal;
  readonly headers?: Readonly<Record<string, string>>;
}

/** The part of a fetch `Response` core reads. Bodies are `unknown` until a Zod schema parses them. */
export interface FetchResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

/** An injected fetch. The global `fetch` is assignable to it. */
export type Fetcher = (url: string, init?: FetchInit) => Promise<FetchResponse>;

/**
 * Parameters given to a dynamic script (spec 9.5), validated before the run: both chain IDs are integers naming a
 * configured chain (B5), and the RPC URLs are the public per-chain setting of D-35, `null` when the chain has none.
 */
export interface ScriptParameters {
  readonly disputeID: string;
  readonly arbitrableContractAddress: Address;
  readonly arbitratorChainID: ChainId;
  readonly arbitrableChainID: ChainId;
  readonly arbitratorJsonRpcUrl: string | null;
  readonly arbitrableJsonRpcUrl: string | null;
}

/** `reality` runs the script with the duplicate-key JSON guard installed (A4); `standard` runs it without. */
export type ScriptKind = "reality" | "standard";

/** One dynamic-script run, handed to the runner of ADR 0004. */
export interface ScriptRunRequest {
  readonly scriptText: string;
  readonly params: ScriptParameters;
  readonly kind: ScriptKind;
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
}

/** The runner's answer. It never rejects: a script that throws, never reports or is aborted settles as `failed`. */
export type ScriptResult =
  | { readonly status: "ok"; readonly value: unknown; readonly jsonDuplicateKeys: boolean }
  | { readonly status: "failed"; readonly reason: "timeout" | "aborted" | "script-error" | "runner-error"; readonly message: string };

/** Implemented in `web` by the runner host (ADR 0004). Core only calls it. */
export interface ScriptRunner {
  run(request: ScriptRunRequest): Promise<ScriptResult>;
}

/** A dispute's period on the arbitrator: evidence, commit, vote, appeal, execution. */
export type Period = 0 | 1 | 2 | 3 | 4;

/** Why a section of data could not be produced (D-36: degrade with a reason, never fake data). */
export type UnavailableCode =
  | "no-rpc" // the chain has no read RPC configured (D-56) or is not configured at all (D-18)
  | "rpc-error" // transport failure, timeout or budget exhausted
  | "reverted" // the contract reverted
  | "not-found" // an event or record that must exist was not found, or was found more than once
  | "invalid-data" // the data exists but fails validation
  | "unsupported"; // the contract does not expose what is needed

export interface Unavailable {
  readonly code: UnavailableCode;
  readonly message: string;
}

/** A value or the reason it is unavailable. Every independently degradable read returns one. */
export type Outcome<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: Unavailable };

/** What a write call does, so the UI can label pending, success and failure states (D-07). */
export type WriteKind = "create-dispute" | "submit-evidence" | "fund-appeal" | "escrow-appeal" | "withdraw";

type WriteFunctionName<TAbi extends Abi> = ContractFunctionName<TAbi, "payable" | "nonpayable">;

/**
 * A pure description of a transaction. Core never signs; `web` hands it to wagmi after the chain-match guard of
 * `writes` (B3, D-48).
 */
export interface WriteCall<TAbi extends Abi = Abi, TFunctionName extends WriteFunctionName<TAbi> = WriteFunctionName<TAbi>> {
  readonly kind: WriteKind;
  readonly chainId: ChainId;
  readonly address: Address;
  readonly abi: TAbi;
  readonly functionName: TFunctionName;
  readonly args: ContractFunctionArgs<TAbi, "payable" | "nonpayable", TFunctionName>;
  readonly value: bigint;
}

// Module-owned types, re-exported so `index.ts` can expose every public type from one place.
export type * from "./chains/types";
export type * from "./abi/types";
export type * from "./uri/types";
export type * from "./rulings/types";
export type * from "./registry/types";
export type * from "./rpc/types";
export type * from "./families/types";
export type * from "./reality/types";
export type * from "./metaEvidence/types";
export type * from "./evidence/types";
export type * from "./disputes/types";
export type * from "./appeals/types";
export type * from "./create/types";
export type * from "./writes/types";
