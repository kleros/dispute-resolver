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
}

export interface BehaviorOverride extends Justified {
  /** Unslashed: funding round = appeal count + 1, in every period, for both event types. */
  readonly roundIndexOffset?: 1;
  /** Unslashed: option 0 is not fundable; with ruling 0, every option is costed and timed as a winner. */
  readonly refuseToArbitrateFundable?: false;
}

/** Addresses lowercase, keys unique. */
export interface Registry {
  readonly realityProxies: Readonly<Record<RegistryKey, RealityProxyEntry>>;
  readonly overrides: Readonly<Record<RegistryKey, BehaviorOverride>>;
  /** Arbitrator chain → canonical CID paths, matched exactly after normalization. */
  readonly dynamicScriptAllowlist: Readonly<Record<number, readonly CidPath[]>>;
  /** Looked up by the validated meta-evidence `arbitrableChainID`, else the arbitrator chain. Evidence-display iframe flags only. */
  readonly displayAllowlist: Readonly<Record<number, readonly Address[]>>;
  /** Written into meta-evidence by the Create page. */
  readonly defaultScriptCid: string;
  /** Hosts whose links are suppressed as self-links. */
  readonly canonicalHosts: readonly string[];
}
