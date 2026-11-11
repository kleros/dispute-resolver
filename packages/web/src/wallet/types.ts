import type { ReactNode } from "react";
import type { Config } from "wagmi";
import type { Address, ChainConfig, Hex, WriteBuild, WriteRefusal } from "@dispute-resolver/core";
import type { WriteReceipt } from "../data";
import type { AppConfig } from "../env";

/** `unconfigured` means no WalletConnect project ID: the app is read-only and Connect is disabled. */
export type WalletMode = "appkit" | "unconfigured";

export interface WalletModal {
  /** Makes `chainId` the modal's active network, so a WalletConnect session starts on it, then opens the Connect view. */
  openConnect(chainId: number | undefined): Promise<void>;
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
  /** Only while a remembered connection is restored; a connection the user starts stays `disconnected` until it settles. */
  | { readonly status: "connecting" }
  | {
      readonly status: "connected";
      /** Lowercased through `toRegistryAddress`. */
      readonly address: Address;
      readonly chainId: number;
    };

/** The refusal of a write without a connected wallet, as `WriteGuardNotice` and `WriteGuardAction` render it. */
export interface NeedsWalletGuard {
  readonly phase: "needs-wallet";
  readonly pageChainId: number;
}

/** The refusal of a write from a wallet on another chain than the page's, as `WriteGuardNotice` and `WriteGuardAction` render it. */
export interface WrongChainGuard {
  readonly phase: "wrong-chain";
  readonly walletChainId: number;
  readonly pageChainId: number;
}

/**
 * `checking` is the call checked against the contract through the read RPC before the wallet opens; the three phases
 * after it end a write that check stopped, with nothing sent. `pending` is "waiting for the wallet".
 */
export type WriteStatus =
  | { readonly phase: "idle" }
  | { readonly phase: "refused"; readonly refusal: WriteRefusal }
  | NeedsWalletGuard
  | WrongChainGuard
  | { readonly phase: "checking" }
  /** `reason`: a known contract's own reason as plain text; `null` for any other contract, or when it gave none. */
  | { readonly phase: "refused-by-contract"; readonly reason: string | null }
  | { readonly phase: "insufficient-funds" }
  | { readonly phase: "account-changed" }
  | { readonly phase: "pending" }
  /** `cannotConfirmYet`: the receipt waiter cannot confirm yet; the wait goes on. */
  | { readonly phase: "submitted"; readonly hash: Hex; readonly explorerUrl: string | null; readonly cannotConfirmYet?: true }
  | { readonly phase: "mined"; readonly hash: Hex; readonly explorerUrl: string | null; readonly receipt: WriteReceipt }
  /** Sent, but its receipt cannot be awaited on this chain: not a failure, since the transaction may well be mined. */
  | { readonly phase: "unconfirmed"; readonly hash: Hex; readonly explorerUrl: string | null }
  | { readonly phase: "failed"; readonly hash: Hex | null; readonly explorerUrl: string | null; readonly message: string }
  | { readonly phase: "rejected" };

/** How a write ended. Nothing is signed for `refused`, `needs-wallet`, `wrong-chain` and the three ends of the check. */
export type WriteOutcome = Extract<
  WriteStatus,
  {
    readonly phase: "refused" | "needs-wallet" | "wrong-chain" | "refused-by-contract" | "insufficient-funds" | "account-changed" | "mined" | "unconfirmed" | "failed" | "rejected";
  }
>;

/**
 * How a write names itself in its toast. `doing`: lowercase phrase, no full stop ("funding “Red” with 336 xDai").
 * `done`: the mined sentence with its full stop, or read from the receipt inside the write's own chain.
 */
export interface WriteWording {
  readonly doing: string;
  readonly done: string | ((receipt: WriteReceipt) => string);
}

export interface WriteOptions {
  readonly pageChainId: number;
  /** Runs after the receipt is mined, before the status becomes `mined`. */
  readonly onMined?: (receipt: WriteReceipt) => Promise<void> | void;
  readonly wording: WriteWording;
}

/** What one transaction needs from the options: `performWrite` and `refreshAfter` take this. */
export type WriteRun = Pick<WriteOptions, "pageChainId" | "onMined">;

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

/** The position of a status in a sequence, for "(1 of 2)". */
export type WriteProgress = Pick<WriteSequenceStatus, "index" | "total">;

/** One press of a write action as the observer follows it: every status in order, the outcome last. */
export interface WriteAttempt {
  report(status: WriteStatus, wording: WriteWording, progress?: WriteProgress): void;
}

/** Starts an attempt. `source` is stable per write control, so a new press can replace that control's last refusal. */
export type WriteObserver = (source: string) => WriteAttempt;

export interface WriteSequenceOptions {
  readonly pageChainId: number;
  /** Runs once, after the last mined receipt or at a stop that follows at least one. */
  readonly onMined?: (receipt: WriteReceipt) => Promise<void> | void;
  /** The wording of build `index`. */
  readonly wording: (index: number) => WriteWording;
}

export interface WriteSequenceController {
  readonly status: WriteSequenceStatus | null;
  /** Stops at the first outcome other than `mined` and returns it; returns the last `mined` outcome otherwise. */
  execute(builds: readonly WriteBuild[], options: WriteSequenceOptions): Promise<WriteOutcome>;
  reset(): void;
}

export interface WalletControlProps {
  readonly chain: ChainConfig;
}

export interface SmartContractWalletWarningProps {
  readonly chainId: number;
}

export interface WriteGuardNoticeProps {
  readonly guard: NeedsWalletGuard | WrongChainGuard;
  readonly className?: string;
}

export interface WriteGuardActionProps {
  readonly guard: NeedsWalletGuard | WrongChainGuard;
  /** Called once, when the wallet can sign on the guard's page chain. */
  readonly onResolved: () => void;
}
