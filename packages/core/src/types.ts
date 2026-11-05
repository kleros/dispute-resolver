/**
 * Cross-cutting primitives of `@dispute-resolver/core`, and the barrel that re-exports every module's types.
 *
 * This file is a barrel, not a layer: modules import primitives from `../types` and other modules' types only through
 * `../<module>/types`, never through this file.
 */
import type { Abi, ContractFunctionArgs, ContractFunctionName, PublicClient } from "viem";

/** An EVM address, always lowercase inside core. */
export type Address = `0x${Lowercase<string>}`;

export type Hex = `0x${string}`;

/** `"<arbitrator chain ID>:<lowercase arbitrable>"`, the key of every registry table. */
export type RegistryKey = `${number}:${Address}`;

/**
 * The deployment environment, passed in by the caller. Core never reads `process.env` or `import.meta.env`.
 * Keys keep the `REACT_APP_*` names the deployments already set.
 */
export type Env = Readonly<Record<string, string | undefined>>;

/**
 * The subset of a viem `PublicClient` core reads through. Built only from the configured per-chain read RPC (`rpc`),
 * never from a wallet. `request` is the raw JSON-RPC call, for reads whose viem action would hide a missing
 * result (`getCode` maps both `"0x"` and no result to `undefined`). `simulateContract` and `getBalance` serve the check
 * before a write, never a signature. Tests build one with
 * `createPublicClient({ transport: custom({ request }) })`.
 */
export type ReadClient = Pick<
  PublicClient,
  "readContract" | "getLogs" | "getCode" | "getStorageAt" | "getBlockNumber" | "getBlock" | "getBalance" | "simulateContract" | "request"
>;

export type GetReadClient = (chainId: number) => ReadClient | undefined;

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
 * Parameters given to a dynamic script, validated before the run: both chain IDs are integers naming a configured
 * chain, and the RPC URLs are the public per-chain setting, `null` when the chain has none.
 */
export interface ScriptParameters {
  readonly disputeID: string;
  readonly arbitrableContractAddress: Address;
  readonly arbitratorChainID: number;
  readonly arbitrableChainID: number;
  readonly arbitratorJsonRpcUrl: string | null;
  readonly arbitrableJsonRpcUrl: string | null;
}

/** `reality` runs the script with the duplicate-key JSON guard installed; `standard` runs it without. */
export type ScriptKind = "reality" | "standard";

export interface ScriptRunRequest {
  readonly scriptText: string;
  readonly params: ScriptParameters;
  readonly kind: ScriptKind;
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
}

/**
 * The runner's answer. It never rejects: a script that throws, never reports or is aborted settles as `failed`. A
 * `runner-error` means the runner cannot run this request (refused parameters, no frame, a malformed reply) and is never
 * retried; `not-started` means the runner did not acknowledge the run in time, which a slow connection causes as well as
 * a blocker, so core retries it like any other transient failure.
 */
export type ScriptResult =
  | { readonly status: "ok"; readonly value: unknown; readonly jsonDuplicateKeys: boolean }
  | { readonly status: "failed"; readonly reason: "timeout" | "aborted" | "script-error" | "not-started" | "runner-error"; readonly message: string };

/** Implemented in `web` by the runner host. Core only calls it. */
export interface ScriptRunner {
  run(request: ScriptRunRequest): Promise<ScriptResult>;
}

/** A dispute's period on the arbitrator: evidence, commit, vote, appeal, execution. */
export type Period = 0 | 1 | 2 | 3 | 4;

/** Why a section of data could not be produced: sections degrade with a reason, never with fake data. */
export type UnavailableCode =
  | "no-rpc" // the chain has no read RPC configured or is not configured at all
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

export type WriteKind = "create-dispute" | "submit-evidence" | "fund-appeal" | "escrow-appeal" | "withdraw";

type WriteFunctionName<TAbi extends Abi> = ContractFunctionName<TAbi, "payable" | "nonpayable">;

/**
 * A pure description of a transaction. Core never signs; `web` hands it to wagmi after the chain-match guard of
 * `writes`.
 */
export interface WriteCall<TAbi extends Abi = Abi, TFunctionName extends WriteFunctionName<TAbi> = WriteFunctionName<TAbi>> {
  readonly kind: WriteKind;
  readonly chainId: number;
  readonly address: Address;
  readonly abi: TAbi;
  readonly functionName: TFunctionName;
  readonly args: ContractFunctionArgs<TAbi, "payable" | "nonpayable", TFunctionName>;
  readonly value: bigint;
}

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
