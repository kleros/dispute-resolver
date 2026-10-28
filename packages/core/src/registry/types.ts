import type { Address, RegistryKey } from "../types";
import type { CidPath } from "../uri/types";

/** Why no generic rule covers the entry. Non-empty. */
export interface Justified {
  readonly justification: string;
}

export interface RealityProxyEntry extends Justified {
  readonly proxy: Address;
  readonly kind: "single-chain" | "cross-chain";
  /** Reality.eth contract holding the question. */
  readonly reality: Address;
  /** Home chain of the question; must have an RPC configured. */
  readonly realityChainId: number;
  readonly proxyDeployBlock: number;
  readonly realityDeployBlock: number;
  /** Cross-chain only: the proxy exposes `arbitrationCreatedBlock(uint256)`. */
  readonly hasArbitrationCreatedBlock: boolean;
  /** Reality v3 reserved answer "Answered Too Soon" is offered. */
  readonly answeredTooSoon: boolean;
  /** Label language the arbitrable's own script used. */
  readonly localizedLang: "es" | null;
  readonly questionOverride: "title" | "title-description" | null;
  /** `false` for a proxy with no appeal function: KlerosLiquid takes an appeal only from the arbitrable itself. */
  readonly appealable?: false;
}

export interface BehaviorOverride extends Justified {
  /** Unslashed: funding round = appeal count + 1, in every period, for both event types. */
  readonly roundIndexOffset?: 1;
  /** Unslashed: option 0 is not fundable; with ruling 0, every option is costed and timed as a winner. */
  readonly refuseToArbitrateFundable?: false;
}

/** What an arbitrable does when it is ruled and only one ruling of the last round is fully funded. */
export type Settlement =
  | "sole-funded-wins" // rule() replaces the jury's ruling with the only fully funded one
  | "jury-stands" // rule() executes the jury's ruling whatever was funded
  | "unknown";

/** The probed families a verified entry can name; `families` checks it against the detection's write family. */
export type VerifiedFamily = "escrow-v1" | "governor" | "idr-v2" | "idr-v1" | "idr-legacy";

/**
 * A contract whose deployed code was read. It changes how the appeal rules are worded and nothing else: never a family,
 * a capability, a read, a write or an address. Only plain contracts are listed, since an upgrade could change the rules.
 */
export interface VerifiedArbitrable extends Justified {
  readonly family: VerifiedFamily;
  readonly settlement: Exclude<Settlement, "unknown">;
  /** Its withdraw code was read too: a round that ends without an appeal returns every contribution in full. */
  readonly refundsWithoutAppeal?: true;
}

/** Addresses lowercase, keys unique. */
export interface Registry {
  readonly realityProxies: Readonly<Record<RegistryKey, RealityProxyEntry>>;
  readonly overrides: Readonly<Record<RegistryKey, BehaviorOverride>>;
  readonly verifiedArbitrables: Readonly<Record<RegistryKey, VerifiedArbitrable>>;
  /** Arbitrator chain → canonical CID paths, matched exactly after normalization. */
  readonly dynamicScriptAllowlist: Readonly<Record<number, readonly CidPath[]>>;
  /** Looked up by the meta-evidence's `displayChainId` of `arbitrableChainID`. Evidence-display iframe flags only. */
  readonly displayAllowlist: Readonly<Record<number, readonly Address[]>>;
  /** Written into meta-evidence by the Create page. */
  readonly defaultScriptCid: string;
  /** Hosts whose links are suppressed as self-links. */
  readonly canonicalHosts: readonly string[];
}
