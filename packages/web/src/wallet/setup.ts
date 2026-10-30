import { CHAINS, z } from "@dispute-resolver/core";
import { createConfig, type Config } from "wagmi";
import type { AppConfig } from "../env";
import type { createAppKitSetup } from "./appKitSetup";
import { configuredChains } from "./chains";
import { walletTransports } from "./transports";
import type { AppKitWalletSetup, WalletModal, WalletSetup, WalletSetupState } from "./types";

export type CreateAppKitSetup = typeof createAppKitSetup;

type LoadAppKit = () => Promise<CreateAppKitSetup>;

interface WalletSetupStore {
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

function connectorlessConfig(config: AppConfig, persistent: boolean): Config {
  const chains = configuredChains();
  const transports = walletTransports(Object.values(CHAINS), config.env);
  return createConfig({ chains, transports, connectors: [], multiInjectedProviderDiscovery: false, ssr: false, ...(persistent ? {} : { storage: null }) });
}

export function createReadOnlySetup(config: AppConfig): WalletSetup {
  return { mode: "unconfigured", wagmiConfig: connectorlessConfig(config, true) };
}

/** A modal that loads AppKit first, so a Connect press made while the chunk loads opens the real modal once it is there. */
function deferredModal(load: () => Promise<AppKitWalletSetup>): WalletModal {
  return {
    openConnect: async (chainId) => (await load()).modal.openConnect(chainId),
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
 * With a project ID, the setup is a stand-in until AppKit is created: a wagmi config with no connector and no storage, so
 * nothing it does touches the persisted connection the AppKit config reconnects from. A failed load leaves the stand-in,
 * not pending, so the app is read-only and Connect retries.
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
