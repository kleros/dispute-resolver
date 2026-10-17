import type { ReactNode } from "react";
import type { Config } from "wagmi";
import type { Address, ChainConfig, ChainId, Hex, WriteBuild, WriteRefusal } from "@dispute-resolver/core";
import type { WriteReceipt } from "../data";
import type { AppConfig } from "../env";

/** `appkit` with a WalletConnect project ID; `unconfigured` (read-only, Connect disabled) without one (ARCHITECTURE.md §2.3). */
export type WalletMode = "appkit" | "unconfigured";

/** The parts of the AppKit modal the app uses: only its Connect and Networks views (ARCHITECTURE.md §2.3, §11.2). */
export interface WalletModal {
  /** Makes `chainId` the modal's active network, so a WalletConnect session starts on it, then opens the Connect view. */
  openConnect(chainId: ChainId | undefined): Promise<void>;
  /** Opens the Networks view, which asks the connected wallet to change chain; the app follows (D-55). */
  openNetworks(): Promise<void>;
  /** Resolves once AppKit has finished initializing (connectors synced, remote project settings applied). */
  ready(): Promise<void>;
  /**
   * Resolves once AppKit is ready: `true` when its connector registry holds the embedded-wallet (`AUTH`) connector, which
   * AppKit adds when the Reown dashboard enables social login or email (K-01). The app then never opens the Connect
   * view and stays read-only (K-03).
   */
  hasEmbeddedWallet(): Promise<boolean>;
}

/** The wagmi config and, with a WalletConnect project ID, the AppKit modal (ARCHITECTURE.md §2.3). */
export type WalletSetup = { readonly mode: "appkit"; readonly wagmiConfig: Config; readonly modal: WalletModal } | { readonly mode: "unconfigured"; readonly wagmiConfig: Config };

/** The setup of the `appkit` mode, which `createAppKitSetup` returns. */
export type AppKitWalletSetup = Extract<WalletSetup, { readonly mode: "appkit" }>;

/** What the wallet hooks read: the setup and whether AppKit is still loading (ARCHITECTURE.md §2.3). */
export interface WalletSetupState {
  readonly setup: WalletSetup;
  /** `true` while AppKit's chunk loads: no connector exists yet, so nothing reconnects. */
  readonly pending: boolean;
  /**
   * `true` while `pending` when wagmi's storage holds a connection that AppKit's config will reconnect: `useWallet`
   * then reports `connecting`, as wagmi does while it reconnects, so a returning wallet lands on its own chain (§3.1).
   * Without a stored connection the wallet is `disconnected` at once and routing does not wait for AppKit.
   */
  readonly pendingReconnect: boolean;
}

export interface WalletProviderProps {
  readonly config: AppConfig;
  readonly children?: ReactNode;
}

export type WalletState =
  | { readonly status: "disconnected"; readonly mode: WalletMode }
  | { readonly status: "connecting"; readonly mode: WalletMode }
  | {
      readonly status: "connected";
      readonly mode: WalletMode;
      /** Lowercased through `toRegistryAddress`. */
      readonly address: Address;
      readonly chainId: number;
      /** The wallet's chain is one of the configured chains. */
      readonly isConfiguredChain: boolean;
    };

/** Every state of one write (D-07, B3, D-48). `pending` is "waiting for the wallet". */
export type WriteStatus =
  | { readonly phase: "idle" }
  | { readonly phase: "refused"; readonly refusal: WriteRefusal }
  | { readonly phase: "needs-wallet"; readonly pageChainId?: ChainId }
  | { readonly phase: "wrong-chain"; readonly walletChainId: number; readonly pageChainId: ChainId }
  | { readonly phase: "pending" }
  | { readonly phase: "submitted"; readonly hash: Hex; readonly explorerUrl: string | null }
  | { readonly phase: "mined"; readonly hash: Hex; readonly explorerUrl: string | null; readonly receipt: WriteReceipt }
  | { readonly phase: "failed"; readonly hash: Hex | null; readonly explorerUrl: string | null; readonly message: string }
  | { readonly phase: "rejected" };

/** How a write ended. Nothing is signed for `refused`, `needs-wallet` and `wrong-chain`. */
export type WriteOutcome = Extract<WriteStatus, { readonly phase: "refused" | "needs-wallet" | "wrong-chain" | "mined" | "failed" | "rejected" }>;

export interface WriteOptions {
  /** The chain of the page the action is on; the wallet must be on it (B3, D-48). */
  readonly pageChainId: ChainId;
  /** Runs after the receipt is mined, before the status becomes `mined` (D-07: refresh only once mined). */
  readonly onMined?: (receipt: WriteReceipt) => Promise<void> | void;
}

/** `useWrite()` (ARCHITECTURE.md §6.1). */
export interface WriteController {
  readonly status: WriteStatus;
  execute(build: WriteBuild, options: WriteOptions): Promise<WriteOutcome>;
  reset(): void;
}

export interface WriteSequenceStatus {
  /** Zero-based index of the write in progress. */
  readonly index: number;
  readonly total: number;
  readonly current: WriteStatus;
}

/** `useWriteSequence()`: withdrawals in sequence, one transaction per item (D-51, ARCHITECTURE.md §6.2). */
export interface WriteSequenceController {
  readonly status: WriteSequenceStatus | null;
  /** Stops at the first outcome other than `mined` and returns it; returns the last `mined` outcome otherwise. */
  execute(builds: readonly WriteBuild[], options: WriteOptions): Promise<WriteOutcome>;
  reset(): void;
}

/** Props of `WalletControl` (ARCHITECTURE.md §11.2). */
export interface WalletControlProps {
  /** The header's resolved chain: Connect starts on it and the account menu links to its explorer. */
  readonly chain: ChainConfig;
}

/** Props of `ChainIndicator` (ARCHITECTURE.md §11.2). */
export interface ChainIndicatorProps {
  /** The header's resolved chain (ARCHITECTURE.md §3.2), whose name is shown. */
  readonly chain: ChainConfig;
  /** `true` when `chain` is the page chain named by the URL; only then is a wallet on another chain offered the switch (D-48). */
  readonly isPageChain: boolean;
}

/** Props of `SmartContractWalletWarning` (A14). */
export interface SmartContractWalletWarningProps {
  /** The chain whose code is read for the connected account: the resolved chain of the header. */
  readonly chainId: ChainId;
}

/** Props of `WriteStatusNotice` (ARCHITECTURE.md §6.1). */
export interface WriteStatusNoticeProps {
  readonly status: WriteStatus;
  /** For a sequence (D-51): which transaction the status belongs to, shown as "n of total". */
  readonly progress?: Pick<WriteSequenceStatus, "index" | "total">;
  readonly className?: string;
}
