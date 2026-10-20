import { CHAINS, type ChainConfig, type Env } from "@dispute-resolver/core";
import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TestDataProvider } from "../test/data";
import { WalletSetupProvider } from "./WalletProvider";
import { buildAppConfig } from "../env";
import { configuredChains, toViemChain } from "./chains";
import { createTestWallet } from "../test/wallet";
import type { AppKitWalletSetup } from "./types";
import { createReadOnlySetup, createWalletSetupStore, hasPersistedConnection, walletSetupStoreFor, type CreateAppKitSetup, type ReadStoredItem } from "./setup";
import { noRpcConfiguredError, walletTransport } from "./transports";

const LOCATION = { host: "localhost", origin: "http://localhost" };
const SECRET_RPC = "https://mainnet.example.org/v3/secret-key";

function chain(id: number): ChainConfig {
  const config = Object.values(CHAINS).find((candidate) => candidate.id === id);
  if (config === undefined) throw new Error(`Chain ${String(id)} is not configured.`);
  return config;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createReadOnlySetup (no WalletConnect project ID)", () => {
  it("§2.3: boots the unconfigured read-only mode without creating AppKit", () => {
    const setup = createReadOnlySetup(buildAppConfig({}, LOCATION));
    expect(setup.mode).toBe("unconfigured");
    expect("modal" in setup).toBe(false);
  });

  it("K-02: the wagmi config has no connector", () => {
    expect(createReadOnlySetup(buildAppConfig({}, LOCATION)).wagmiConfig.connectors).toEqual([]);
  });

  it("K-02: a browser wallet announcing itself through EIP-6963 is not added", async () => {
    const setup = createReadOnlySetup(buildAppConfig({}, LOCATION));
    // Wagmi adds announced wallets only once WagmiProvider has hydrated its store at mount.
    render(
      <TestDataProvider>
        <WalletSetupProvider setup={setup} />
      </TestDataProvider>,
    );
    await waitFor(() => {
      expect(setup.wagmiConfig.state.status).toBe("disconnected");
    });
    const provider = { request: vi.fn(), on: vi.fn(), removeListener: vi.fn() };
    window.dispatchEvent(
      new CustomEvent("eip6963:announceProvider", {
        detail: Object.freeze({
          info: { uuid: "4f6d6c1b-8b5b-4a43-9f3a-0d7f5d0c1e2a", name: "Test Wallet", icon: "data:image/svg+xml,<svg/>", rdns: "org.example.wallet" },
          provider,
        }),
      }),
    );
    expect(setup.wagmiConfig.connectors).toEqual([]);
    expect(provider.request).not.toHaveBeenCalled();
  });

  it("§2.3: knows every configured chain, in ascending ID order", () => {
    const ids = createReadOnlySetup(buildAppConfig({}, LOCATION)).wagmiConfig.chains.map((candidate) => candidate.id);
    expect(ids).toEqual(
      Object.values(CHAINS)
        .map((candidate) => candidate.id)
        .sort((left, right) => left - right),
    );
    expect(ids).toHaveLength(14);
    expect(ids).not.toContain(690);
  });
});

const WITH_PROJECT_ID = { REACT_APP_WALLETCONNECT_PROJECT_ID: "c8-test-project" };

/** A stand-in for the AppKit setup, built from the test wallet, its fake modal, and a creator that returns it. */
function fakeAppKit() {
  const wallet = createTestWallet();
  const { modal } = wallet;
  if (modal === null) throw new Error("The test wallet has no modal.");
  const setup: AppKitWalletSetup = { mode: "appkit", wagmiConfig: wallet.config, modal };
  return { setup, modal, create: vi.fn<CreateAppKitSetup>(() => setup) };
}

/** Wagmi's persisted store as wagmi writes it under `wagmi.store` (wagmi 2.22, recorded from a connect and a disconnect). */
const CONNECTED_WAGMI_STORE =
  '{"state":{"connections":{"__type":"Map","value":[["bcfb5cd94f3",{"accounts":["0x00000000000000000000000000000000000A11cE"],"chainId":1,"connector":{"id":"injected","name":"Injected","type":"injected","uid":"bcfb5cd94f3"}}]]},"chainId":1,"current":"bcfb5cd94f3"},"version":2}';
const DISCONNECTED_WAGMI_STORE = '{"state":{"connections":{"__type":"Map","value":[]},"chainId":1,"current":null},"version":2}';

/** A storage read that holds `stored` under `wagmi.store` and nothing else. */
function storedWagmiStore(stored: string): ReadStoredItem {
  return (key) => (key === "wagmi.store" ? stored : null);
}

describe("hasPersistedConnection", () => {
  it("§3.1: wagmi's stored current connection is a connection to restore", () => {
    expect(hasPersistedConnection(storedWagmiStore(CONNECTED_WAGMI_STORE))).toBe(true);
  });

  it("§3.1: a first visit, with nothing stored, has no connection to restore", () => {
    expect(hasPersistedConnection(() => null)).toBe(false);
  });

  it("§3.1: a wallet that disconnected has no connection to restore, though wagmi keeps its store", () => {
    expect(hasPersistedConnection(storedWagmiStore(DISCONNECTED_WAGMI_STORE))).toBe(false);
  });

  it("§3.1: malformed or unexpected stored values hold no connection", () => {
    for (const stored of ["{", "null", '"text"', '{"state":{"current":""}}', '{"state":{"current":7}}', '{"current":"bcfb5cd94f3"}']) {
      expect(hasPersistedConnection(storedWagmiStore(stored))).toBe(false);
    }
  });

  it("§3.1: storage that throws on read holds no connection", () => {
    expect(
      hasPersistedConnection(() => {
        throw new DOMException("The storage is blocked.", "SecurityError");
      }),
    ).toBe(false);
  });
});

describe("createWalletSetupStore", () => {
  it("K-02: without a project ID the setup is read-only from the start and AppKit is never loaded", async () => {
    const loadAppKit = vi.fn<() => Promise<CreateAppKitSetup>>();
    const store = createWalletSetupStore(buildAppConfig({}, LOCATION), loadAppKit, storedWagmiStore(CONNECTED_WAGMI_STORE));
    expect(store.getSnapshot().pending).toBe(false);
    expect(store.getSnapshot().pendingReconnect).toBe(false);
    expect(store.getSnapshot().setup.mode).toBe("unconfigured");
    await expect(store.load()).resolves.toBe(store.getSnapshot().setup);
    expect(loadAppKit).not.toHaveBeenCalled();
  });

  it("§2.3: with a project ID the first render gets a pending stand-in with no connector and no storage, before AppKit loads", () => {
    const loadAppKit = vi.fn<() => Promise<CreateAppKitSetup>>();
    const store = createWalletSetupStore(buildAppConfig(WITH_PROJECT_ID, LOCATION), loadAppKit);
    const { setup, pending } = store.getSnapshot();
    expect(pending).toBe(true);
    expect(setup.mode).toBe("appkit");
    expect(setup.wagmiConfig.connectors).toEqual([]);
    expect(setup.wagmiConfig.storage).toBeNull();
    expect(loadAppKit).not.toHaveBeenCalled();
  });

  it("§3.1: while AppKit loads, the store waits for a reconnect only when wagmi stored a connection", () => {
    const config = buildAppConfig(WITH_PROJECT_ID, LOCATION);
    const neverLoads = () => new Promise<CreateAppKitSetup>(() => undefined);
    expect(createWalletSetupStore(config, neverLoads, storedWagmiStore(CONNECTED_WAGMI_STORE)).getSnapshot()).toEqual(
      expect.objectContaining({ pending: true, pendingReconnect: true }),
    );
    expect(createWalletSetupStore(config, neverLoads, () => null).getSnapshot()).toEqual(expect.objectContaining({ pending: true, pendingReconnect: false }));
  });

  it("§3.1: by default the store reads wagmi's connection from localStorage, once, at creation", () => {
    const config = buildAppConfig(WITH_PROJECT_ID, LOCATION);
    const neverLoads = () => new Promise<CreateAppKitSetup>(() => undefined);
    try {
      window.localStorage.setItem("wagmi.store", CONNECTED_WAGMI_STORE);
      const store = createWalletSetupStore(config, neverLoads);
      window.localStorage.removeItem("wagmi.store");
      expect(store.getSnapshot().pendingReconnect).toBe(true);
      expect(createWalletSetupStore(config, neverLoads).getSnapshot().pendingReconnect).toBe(false);
    } finally {
      window.localStorage.removeItem("wagmi.store");
    }
  });

  it("§3.1: once AppKit is loaded, nothing is pending", async () => {
    const appKit = fakeAppKit();
    const store = createWalletSetupStore(buildAppConfig(WITH_PROJECT_ID, LOCATION), () => Promise.resolve(appKit.create), storedWagmiStore(CONNECTED_WAGMI_STORE));
    await store.load();
    expect(store.getSnapshot()).toEqual({ setup: appKit.setup, pending: false, pendingReconnect: false });
  });

  it("§2.3: load creates AppKit once with the project ID and publishes its setup", async () => {
    const appKit = fakeAppKit();
    const config = buildAppConfig(WITH_PROJECT_ID, LOCATION);
    const store = createWalletSetupStore(config, () => Promise.resolve(appKit.create));
    const listener = vi.fn();
    store.subscribe(listener);
    const [first, second] = await Promise.all([store.load(), store.load()]);
    expect(first).toBe(appKit.setup);
    expect(second).toBe(appKit.setup);
    expect(appKit.create).toHaveBeenCalledOnce();
    expect(appKit.create).toHaveBeenCalledWith(config, "c8-test-project");
    expect(store.getSnapshot()).toEqual({ setup: appKit.setup, pending: false, pendingReconnect: false });
    expect(listener).toHaveBeenCalled();
  });

  it("D-06: a chunk that fails to load leaves the app read-only, not pending, and the next load retries it", async () => {
    const appKit = fakeAppKit();
    const loadAppKit = vi.fn<() => Promise<CreateAppKitSetup>>().mockRejectedValueOnce(new Error("The chunk did not load.")).mockResolvedValue(appKit.create);
    const store = createWalletSetupStore(buildAppConfig(WITH_PROJECT_ID, LOCATION), loadAppKit);
    const standIn = store.getSnapshot().setup;
    await expect(store.load()).rejects.toThrow("The chunk did not load.");
    expect(store.getSnapshot()).toEqual({ setup: standIn, pending: false, pendingReconnect: false });
    await expect(store.load()).resolves.toBe(appKit.setup);
    expect(loadAppKit).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot().setup).toBe(appKit.setup);
  });

  it("§2.3: AppKit that fails to be created is not created again", async () => {
    const create = vi.fn<CreateAppKitSetup>(() => {
      throw new Error("AppKit could not be created.");
    });
    const store = createWalletSetupStore(buildAppConfig(WITH_PROJECT_ID, LOCATION), () => Promise.resolve(create));
    await expect(store.load()).rejects.toThrow("AppKit could not be created.");
    await expect(store.load()).rejects.toThrow("AppKit could not be created.");
    expect(create).toHaveBeenCalledOnce();
    expect(store.getSnapshot().pending).toBe(false);
  });

  it("§2.3: Connect pressed on the stand-in opens AppKit's Connect view on the page chain once AppKit is loaded", async () => {
    const appKit = fakeAppKit();
    const store = createWalletSetupStore(buildAppConfig(WITH_PROJECT_ID, LOCATION), () => Promise.resolve(appKit.create));
    const standIn = store.getSnapshot().setup;
    if (standIn.mode !== "appkit") throw new Error("Expected the AppKit stand-in.");
    await standIn.modal.openConnect(100);
    expect(appKit.modal.openConnect).toHaveBeenCalledWith(100);
    await expect(standIn.modal.hasEmbeddedWallet()).resolves.toBe(false);
  });
});

describe("walletSetupStoreFor", () => {
  it("§2.3: creates the store of a configuration once", () => {
    const config = buildAppConfig({}, LOCATION);
    expect(walletSetupStoreFor(config)).toBe(walletSetupStoreFor(config));
  });
});

describe("walletTransport", () => {
  it("D-56: a chain with its RPC variable set uses that RPC", () => {
    const env: Env = { REACT_APP_WEB3_PROVIDER_URL: SECRET_RPC };
    const transport = walletTransport(chain(1), env)({});
    expect(transport.config.type).toBe("http");
    expect(transport.value).toEqual(expect.objectContaining({ url: SECRET_RPC }));
  });

  it("D-56: a chain without an RPC rejects every request instead of using a public default", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const transport = walletTransport(chain(1), {})({});
    expect(transport.config.type).toBe("custom");
    await expect(transport.request({ method: "eth_blockNumber" })).rejects.toThrow(noRpcConfiguredError(1).message);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("D-56: the error names the chain", () => {
    expect(noRpcConfiguredError(100).message).toBe("No RPC configured for chain 100.");
  });

  it("D-56: the unconfigured mode's chain transports follow the same rule (the AppKit adapter adds Reown's fallback, §6.4)", async () => {
    const setup = createReadOnlySetup(buildAppConfig({}, LOCATION));
    await expect(setup.wagmiConfig.getClient({ chainId: 1 }).request({ method: "eth_blockNumber" })).rejects.toThrow("No RPC configured for chain 1.");
  });
});

describe("toViemChain", () => {
  it("A13: a configured RPC URL never becomes part of a chain definition handed to wallets", () => {
    const setup = createReadOnlySetup(buildAppConfig({ REACT_APP_WEB3_PROVIDER_URL: SECRET_RPC }, LOCATION));
    expect(JSON.stringify(setup.wagmiConfig.chains)).not.toContain("secret-key");
  });

  it("§2.3: every configured chain has a viem definition with the app's name", () => {
    for (const config of Object.values(CHAINS)) {
      const viemChain = toViemChain(config);
      expect(viemChain.id).toBe(config.id);
      expect(viemChain.name).toBe(config.name);
      expect(viemChain.rpcUrls.default.http.length).toBeGreaterThan(0);
    }
  });

  it("§2.3: a chain viem does not know is defined from the core table without any RPC URL", () => {
    const unknown: ChainConfig = { ...chain(1), id: 999_999_001, name: "Test Chain", currency: "TST", explorerBaseUrl: "https://explorer.example.org" };
    const viemChain = toViemChain(unknown);
    expect(viemChain).toEqual(expect.objectContaining({ id: 999_999_001, name: "Test Chain", nativeCurrency: { name: "TST", symbol: "TST", decimals: 18 } }));
    expect(viemChain.rpcUrls.default.http).toEqual([]);
    expect(viemChain.blockExplorers?.default.url).toBe("https://explorer.example.org");
  });

  it("MC-1, §2.3: AppKit's explorer of every configured chain is the core table's, Gnosis on Blockscout", () => {
    for (const config of Object.values(CHAINS)) {
      if (config.explorerBaseUrl === undefined) continue;
      expect(toViemChain(config).blockExplorers?.default.url, `chain ${String(config.id)}`).toBe(config.explorerBaseUrl);
    }
    expect(toViemChain(chain(100)).blockExplorers?.default.url).toBe("https://gnosis.blockscout.com");
  });

  it("§2.3: the configured chains start with chain 1", () => {
    expect(configuredChains()[0].id).toBe(1);
  });
});
