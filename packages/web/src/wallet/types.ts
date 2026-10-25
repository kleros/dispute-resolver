import type { ReactNode } from "react";
import type { Config } from "wagmi";
import type { Address, ChainConfig, ChainId, Hex, WriteBuild, WriteRefusal } from "@dispute-resolver/core";
import type { WriteReceipt } from "../data";
import type { AppConfig } from "../env";

/** `unconfigured` means no WalletConnect project ID: the app is read-only and Connect is disabled. */
export type WalletMode = "appkit" | "unconfigured";

export interface WalletModal {
  /** Makes `chainId` the modal's active network, so a WalletConnect session starts on it, then opens the Connect view. */
  openConnect(chainId: ChainId | undefined): Promise<void>;
  /** Resolves once AppKit has finished initializing (connectors synced, remote project settings applied). */
  ready(): Promise<void>;
  /**
   * Resolves once AppKit is ready: `true` when its connector registry holds the embedded-wallet (`AUTH`) connector, which
   * AppKit adds when the Reown dashboard enables social login or email. The app then never opens the Connect view and
   * stays read-only.
   */
  hasEmbeddedWallet(): Promise<boolean>;
}

export type WalletSetup = { readonly mode: "appkit"; readonly wagmiConfig: Config; readonly modal: WalletModal } | { readonly mode: "unconfigured"; readonly wagmiConfig: Config };

export type AppKitWalletSetup = Extract<WalletSetup, { readonly mode: "appkit" }>;

export interface WalletSetupState {
  readonly setup: WalletSetup;
  /** `true` while AppKit's chunk loads: no connector exists yet, so nothing reconnects. */
  readonly pending: boolean;
  /**
   * `true` while `pending` when wagmi's storage holds a connection that AppKit's config will reconnect: `useWallet`
   * then reports `connecting`, as wagmi does while it reconnects, so a returning wallet lands on its own chain.
   * Without a stored connection the wallet is `disconnected` at once and routing does not wait for AppKit.
   */
  readonly pendingReconnect: boolean;
}

export interface WalletProviderProps {
  readonly config: AppConfig;
  readonly children?: ReactNode;
}

export type WalletState =
  | { readonly status: "disconnected" }
  | { readonly status: "connecting" }
  | {
      readonly status: "connected";
      /** Lowercased through `toRegistryAddress`. */
      readonly address: Address;
      readonly chainId: number;
    };

/** The refusal of a write without a connected wallet, as `WriteStatusNotice` renders it. */
export interface NeedsWalletGuard {
  readonly phase: "needs-wallet";
  readonly pageChainId: ChainId;
}

/** The refusal of a write from a wallet on another chain than the page's, as `WriteStatusNotice` renders it. */
export interface WrongChainGuard {
  readonly phase: "wrong-chain";
  readonly walletChainId: number;
  readonly pageChainId: ChainId;
}

/** `pending` is "waiting for the wallet". */
export type WriteStatus =
  | { readonly phase: "idle" }
  | { readonly phase: "refused"; readonly refusal: WriteRefusal }
  | NeedsWalletGuard
  | WrongChainGuard
  | { readonly phase: "pending" }
  | { readonly phase: "submitted"; readonly hash: Hex; readonly explorerUrl: string | null }
  | { readonly phase: "mined"; readonly hash: Hex; readonly explorerUrl: string | null; readonly receipt: WriteReceipt }
  | { readonly phase: "failed"; readonly hash: Hex | null; readonly explorerUrl: string | null; readonly message: string }
  | { readonly phase: "rejected" };

/** How a write ended. Nothing is signed for `refused`, `needs-wallet` and `wrong-chain`. */
export type WriteOutcome = Extract<WriteStatus, { readonly phase: "refused" | "needs-wallet" | "wrong-chain" | "mined" | "failed" | "rejected" }>;

export interface WriteOptions {
  /** The chain of the page the action is on; the wallet must be on it. */
  readonly pageChainId: ChainId;
  /** Runs after the receipt is mined, before the status becomes `mined`. */
  readonly onMined?: (receipt: WriteReceipt) => Promise<void> | void;
}

export interface WriteController {
  readonly status: WriteStatus;
  execute(build: WriteBuild, options: WriteOptions): Promise<WriteOutcome>;
  reset(): void;
}

export interface WriteSequenceStatus {
  readonly index: number;
  readonly total: number;
  readonly current: WriteStatus;
}

export interface WriteSequenceController {
  readonly status: WriteSequenceStatus | null;
  /** Stops at the first outcome other than `mined` and returns it; returns the last `mined` outcome otherwise. */
  execute(builds: readonly WriteBuild[], options: WriteOptions): Promise<WriteOutcome>;
  reset(): void;
}

export interface WalletControlProps {
  /** The header's resolved chain: Connect starts on it and the account menu links to its explorer. */
  readonly chain: ChainConfig;
}

export interface SmartContractWalletWarningProps {
  /** The chain whose code is read for the connected account: the resolved chain of the header. */
  readonly chainId: ChainId;
}

export interface WriteStatusNoticeProps {
  readonly status: WriteStatus;
  /** For a sequence: which transaction the status belongs to, shown as "n of total". */
  readonly progress?: Pick<WriteSequenceStatus, "index" | "total">;
  /** The notice says why an action is locked before anything was tried, rather than reporting a refused write. */
  readonly beforeAttempt?: boolean;
  readonly className?: string;
}
