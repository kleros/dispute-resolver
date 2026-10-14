import type { Address, ChainId, RegistryKey } from "../types";
import type { CidPath } from "../uri/types";

/** Every data entry says why no generic rule covers it (ADR 0003). Non-empty. */
export interface Justified {
  readonly justification: string;
}

/** A registered Reality.eth proxy (06 §2); fields unchanged from today's `REALITY_PROXIES` plus `justification`. */
export interface RealityProxyEntry extends Justified {
  readonly proxy: Address;
  readonly kind: "single-chain" | "cross-chain";
  /** Reality.eth contract holding the question. */
  readonly reality: Address;
  /** Home chain of the question; must have an RPC configured (06 §3 invariant 3). */
  readonly realityChainId: ChainId;
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

/** A per-contract behavior change no probe can detect (06 §2). One entry today: Unslashed on mainnet. */
export interface BehaviorOverride extends Justified {
  /** Unslashed: funding round = appeal count + 1, in every period, for both event types (D-30). */
  readonly roundIndexOffset?: 1;
  /** Unslashed: option 0 is not fundable; with ruling 0, every option is costed and timed as a winner (spec 10.1). */
  readonly refuseToArbitrateFundable?: false;
}

/** The registry (06 §2). Addresses lowercase, keys unique (06 §3). */
export interface Registry {
  /** 29 entries today, chains 1 and 100. */
  readonly realityProxies: Readonly<Record<RegistryKey, RealityProxyEntry>>;
  /** 1 entry today. */
  readonly overrides: Readonly<Record<RegistryKey, BehaviorOverride>>;
  /** Arbitrator chain → canonical CID paths, matched exactly after normalization (A1). */
  readonly dynamicScriptAllowlist: Readonly<Record<ChainId, readonly CidPath[]>>;
  /**
   * Keyed and populated exactly as today's `arbitrableWhitelist`; the lookup key is the validated meta-evidence
   * `arbitrableChainID`, else the arbitrator chain (B6, D-34). Evidence-display iframe flags only.
   */
  readonly displayAllowlist: Readonly<Record<ChainId, readonly Address[]>>;
  /** "QmZZHwVaXWtvChdFPG4UeXStKaC9aHamwQkNTEAfRmT2Fj", written into meta-evidence by the Create page. */
  readonly defaultScriptCid: string;
  /** ["resolve.kleros.io"]; self-link suppression (D-28). */
  readonly canonicalHosts: readonly string[];
}

/** Evidence-display iframe sandbox tier (A8, C5). `relaxed` = `allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox`. */
export type DisplaySandboxTier = "strict" | "relaxed";
