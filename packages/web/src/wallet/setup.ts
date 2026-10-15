import { CHAINS } from "@dispute-resolver/core";
import { createConfig, type Config } from "wagmi";
import { z } from "zod";
import type { AppConfig } from "../env";
import type { createAppKitSetup } from "./appKitSetup";
import { configuredChains } from "./chains";
import { walletTransports } from "./transports";
import type { AppKitWalletSetup, WalletModal, WalletSetup, WalletSetupState } from "./types";

/** `createAppKitSetup`, which lives in its own chunk. */
export type CreateAppKitSetup = typeof createAppKitSetup;

/** Loads the AppKit chunk. */
export type LoadAppKit = () => Promise<CreateAppKitSetup>;

/**
 * The wallet setup over time (ARCHITECTURE.md §2.3), read through `useSyncExternalStore`. Without a WalletConnect
 * project ID it is the read-only setup from the start; with one it starts as a stand-in and becomes the AppKit setup
 * once `load` has fetched AppKit's chunk and created AppKit.
 */
export interface WalletSetupStore {
  readonly getSnapshot: () => WalletSetupState;
  readonly subscribe: (listener: () => void) => () => void;
  /**
   * Loads AppKit and creates it, once: later calls return the same promise. A chunk that failed to load is fetched
   * again on the next call, so a Connect press retries it; resolves at once with the read-only setup without a project ID.
   */
  readonly load: () => Promise<WalletSetup>;
}

const loadAppKit: LoadAppKit = async () => (await import("./appKitSetup")).createAppKitSetup;

/** Reads one item of the browser's storage. It may throw, as blocked storage does. */
export type ReadStoredItem = (key: string) => string | null;

const readLocalStorage: ReadStoredItem = (key) => window.localStorage.getItem(key);

/**
 * Where wagmi persists its connection state: its default storage is `localStorage` under the `wagmi` prefix, its store
 * is persisted as `store`, and the AppKit wagmi adapter creates its config with that default storage.
 */
const WAGMI_STORE_KEY = "wagmi.store";

/** The part of wagmi's persisted store read here: `current`, the connection a reconnect restores, `null` once disconnected. */
const persistedConnection = z.object({ state: z.object({ current: z.string().min(1) }) });

/**
 * `true` when wagmi's storage holds a connection to restore: the same field wagmi's reconnect reads to report
 * `reconnecting` rather than `connecting`. Storage that is empty, malformed or unreadable holds none.
 */
export function hasPersistedConnection(read: ReadStoredItem): boolean {
  try {
    const stored = read(WAGMI_STORE_KEY);
    return stored !== null && persistedConnection.safeParse(JSON.parse(stored) as unknown).success;
  } catch {
    return false;
  }
}

/** A wagmi config with no connector and no EIP-6963 discovery over the configured chains and their read RPCs (D-56). */
function connectorlessConfig(config: AppConfig, persistent: boolean): Config {
  const chains = configuredChains();
  const transports = walletTransports(Object.values(CHAINS), config.env);
  return createConfig({ chains, transports, connectors: [], multiInjectedProviderDiscovery: false, ssr: false, ...(persistent ? {} : { storage: null }) });
}

/** The setup without a WalletConnect project ID: no wallet can connect, so the app runs read-only (K-02). */
export function createReadOnlySetup(config: AppConfig): WalletSetup {
  return { mode: "unconfigured", wagmiConfig: connectorlessConfig(config, true) };
}

/** A modal that loads AppKit first, so a Connect press made while the chunk loads opens the real modal once it is there. */
function deferredModal(load: () => Promise<AppKitWalletSetup>): WalletModal {
  return {
    openConnect: async (chainId) => (await load()).modal.openConnect(chainId),
    openNetworks: async () => (await load()).modal.openNetworks(),
    ready: async () => (await load()).modal.ready(),
    hasEmbeddedWallet: async () => (await load()).modal.hasEmbeddedWallet(),
  };
}

function staticStore(state: WalletSetupState): WalletSetupStore {
  return {
    getSnapshot: () => state,
    subscribe: () => () => undefined,
    load: () => Promise.resolve(state.setup),
  };
}

/**
 * The store of `config`'s wallet setup. With a project ID, until AppKit is created the setup is a stand-in in the
 * `appkit` mode: a wagmi config with no connector and no storage, so nothing it does touches the persisted connection
 * the AppKit config reconnects from, and a modal that loads AppKit before opening. The state is `pending` until the
 * first load settles; a failed load leaves the stand-in, not pending, so the app is read-only and Connect retries.
 * `pendingReconnect` is read once, through `readStoredItem`, when the store is created (ARCHITECTURE.md §3.1).
 */
export function createWalletSetupStore(config: AppConfig, loadCreator: LoadAppKit = loadAppKit, readStoredItem: ReadStoredItem = readLocalStorage): WalletSetupStore {
  const projectId = config.walletConnectProjectId;
  if (projectId === null) return staticStore({ setup: createReadOnlySetup(config), pending: false, pendingReconnect: false });

  const listeners = new Set<() => void>();
  let loading: Promise<AppKitWalletSetup> | null = null;
  const publish = (next: WalletSetupState) => {
    state = next;
    for (const listener of listeners) listener();
  };
  const load = (): Promise<AppKitWalletSetup> => {
    loading ??= loadCreator()
      .then(
        (create) => create(config, projectId),
        (error: unknown) => {
          // Only a chunk that failed to load is retried: AppKit itself is never created twice.
          loading = null;
          throw error;
        },
      )
      .then(
        (setup) => {
          publish({ setup, pending: false, pendingReconnect: false });
          return setup;
        },
        (error: unknown) => {
          publish({ setup: standIn, pending: false, pendingReconnect: false });
          throw error;
        },
      );
    return loading;
  };
  const standIn: WalletSetup = { mode: "appkit", wagmiConfig: connectorlessConfig(config, false), modal: deferredModal(load) };
  let state: WalletSetupState = { setup: standIn, pending: true, pendingReconnect: hasPersistedConnection(readStoredItem) };

  return {
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    load,
  };
}

const stores = new WeakMap<AppConfig, WalletSetupStore>();

/** The one store of a configuration, created on first use: AppKit must be created once per page. */
export function walletSetupStoreFor(config: AppConfig): WalletSetupStore {
  const existing = stores.get(config);
  if (existing !== undefined) return existing;
  const store = createWalletSetupStore(config);
  stores.set(config, store);
  return store;
}
