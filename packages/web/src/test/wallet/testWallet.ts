import { CHAINS, type Address } from "@dispute-resolver/core";
import { act } from "@testing-library/react";
import { connect, createConfig, createStorage, disconnect, mock, type Config, type Connector } from "@wagmi/core";
import { UserRejectedRequestError, custom, defineChain, getAddress, numberToHex, type Chain, type EIP1193RequestFn } from "viem";
import { vi, type Mock } from "vitest";
import type { WalletMode, WalletModal, WalletSetup } from "../../wallet";
import { createMemoryStorage, deferred } from "../data";
import { TEST_TX_HASH } from "./writeFixtures";

export const TEST_WALLET_ACCOUNT = "0x00000000000000000000000000000000000A11cE";

export const TEST_WALLET_SECOND_ACCOUNT = "0x0000000000000000000000000000000000000B0b";

/** The test wallet's account as the app reports it (`WalletState.address`, lowercased). */
export const TEST_WALLET_ADDRESS: Address = "0x00000000000000000000000000000000000a11ce";

export const CONNECTED_WAGMI_STORE =
  '{"state":{"connections":{"__type":"Map","value":[["bcfb5cd94f3",{"accounts":["0x00000000000000000000000000000000000A11cE"],"chainId":1,"connector":{"id":"injected","name":"Injected","type":"injected","uid":"bcfb5cd94f3"}}]]},"chainId":1,"current":"bcfb5cd94f3"},"version":2}';

export const UNCONFIGURED_CHAIN_ID = 10;

/**
 * Nothing the test wallet does may reach a network: every RPC URL the mock connector could forward a request to
 * (`eth_sendTransaction`, `eth_accounts`, …) is on the reserved `.invalid` TLD, and wagmi's own transports reject.
 */
const UNREACHABLE_RPC = "https://wallet.invalid";

function testChain(id: number, name: string): Chain {
  return defineChain({ id, name, nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [`${UNREACHABLE_RPC}/${String(id)}`] } } });
}

/** The configured chains plus one unconfigured chain, with `first` first: the mock connector starts on `chains[0]`. */
function testChains(first: number): readonly [Chain, ...Chain[]] {
  const all = [...Object.values(CHAINS).map((chain) => testChain(chain.id, chain.name)), testChain(UNCONFIGURED_CHAIN_ID, "OP Mainnet")];
  const start = all.find((chain) => chain.id === first);
  if (start === undefined) throw new Error(`The test wallet cannot start on chain ${String(first)}.`);
  return [start, ...all.filter((chain) => chain !== start)];
}

export function rejectingTransports(chains: readonly Chain[]) {
  return Object.fromEntries(chains.map((chain) => [chain.id, custom({ request: () => Promise.reject(new Error("Tests read through core's test deps, never through wagmi.")) })]));
}

export interface TestWalletOptions {
  /** `appkit` (default) gives a fake modal recording its calls; `unconfigured` has none. */
  readonly mode?: WalletMode;
  /** `true`: the fake modal reports an embedded-wallet connector once ready, as AppKit does when the Reown dashboard is misconfigured. */
  readonly embeddedWallet?: boolean;
  readonly chainId?: number;
  /** The wallet rejects (`true`) or fails (an `Error`) every switch request. */
  readonly switchChainError?: boolean | Error;
  /** `true`: the wallet layer renders as while AppKit loads with a connection wagmi stored. */
  readonly pendingReconnect?: boolean;
}

export interface FakeWalletModal extends WalletModal {
  readonly openConnect: Mock<WalletModal["openConnect"]>;
  readonly hasEmbeddedWallet: Mock<WalletModal["hasEmbeddedWallet"]>;
}

export interface TestWallet {
  readonly config: Config;
  readonly setup: WalletSetup;
  /** `null` in the `unconfigured` mode. */
  readonly modal: FakeWalletModal | null;
  readonly pendingReconnect: boolean;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  /** The user changes the network inside the wallet (a `chainChanged` event), not through the app. */
  changeChain(chainId: number): Promise<void>;
  /** The user switches to `account` inside the wallet (an `accountsChanged` event); later signatures come from it. */
  changeAccount(account: string): void;
}

function fakeModal(embeddedWallet: boolean): FakeWalletModal {
  return {
    openConnect: vi.fn<WalletModal["openConnect"]>(() => (embeddedWallet ? Promise.reject(new Error("The fake modal holds an embedded wallet.")) : Promise.resolve())),
    hasEmbeddedWallet: vi.fn<WalletModal["hasEmbeddedWallet"]>(() => Promise.resolve(embeddedWallet)),
  };
}

/**
 * Signing through it fails (its RPC is unreachable); drive write states with `fakeWriteController`, or mock
 * `writeContract` of `@wagmi/core` in a hook test.
 */
export function createTestWallet(options: TestWalletOptions = {}): TestWallet {
  const { mode = "appkit", chainId = 1, switchChainError, embeddedWallet = false, pendingReconnect = false } = options;
  const chains = testChains(chainId);
  const transports = rejectingTransports(chains);
  const connector = mock({ accounts: [TEST_WALLET_ACCOUNT], features: switchChainError === undefined ? {} : { switchChainError } });
  const config = createConfig({ chains, transports, connectors: [connector], storage: null, multiInjectedProviderDiscovery: false, ssr: false });
  const modal = mode === "appkit" ? fakeModal(embeddedWallet) : null;
  const setup: WalletSetup = modal === null ? { mode: "unconfigured", wagmiConfig: config } : { mode: "appkit", wagmiConfig: config, modal };
  const [created] = config.connectors;
  if (created === undefined) throw new Error("The mock connector was not created.");

  return {
    config,
    setup,
    modal,
    pendingReconnect,
    async connect() {
      await connect(config, { connector: created });
    },
    async disconnect() {
      await disconnect(config);
    },
    async changeChain(next: number) {
      const provider = (await created.getProvider()) as { readonly request: EIP1193RequestFn };
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: numberToHex(next) }] });
    },
    changeAccount(account: string) {
      created.onAccountsChanged([getAddress(account)]);
    },
  };
}

export async function createConnectedTestWallet(options: TestWalletOptions = {}): Promise<TestWallet> {
  const wallet = createTestWallet(options);
  await wallet.connect();
  return wallet;
}

export function walletConnector(wallet: { readonly config: Config }): Connector {
  const [connector] = wallet.config.connectors;
  if (connector === undefined) throw new Error("The test wallet has no connector.");
  return connector;
}

/** Leaves every chain switch the wallet is asked for pending, so a test can look at a control while it waits. Returns the wallet. */
export function holdChainSwitches<T extends TestWallet>(wallet: T): T {
  vi.spyOn(walletConnector(wallet), "switchChain").mockReturnValue(new Promise<never>(() => undefined));
  return wallet;
}

/** The wallet keeps the next switch request open until the test declines it, as a user who reads the prompt first. */
export function declineNextSwitch(wallet: TestWallet): () => void {
  let decline: (() => void) | undefined;
  vi.spyOn(walletConnector(wallet), "switchChain").mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        decline = () => {
          reject(new UserRejectedRequestError(new Error("Declined in the wallet.")));
        };
      }),
  );
  return () => {
    if (decline === undefined) throw new Error("No switch request reached the wallet.");
    decline();
  };
}

export interface ReturningTestWalletOptions {
  /** Whether wagmi's storage holds `CONNECTED_WAGMI_STORE` (chain 1); default `true`. */
  readonly stored?: boolean;
}

/**
 * Two installed wallets for wagmi's real reconnect: `remembered` (authorized, now on chain 100) and one never authorized.
 * Wagmi's check of each waits until the test releases it; release both before the test ends, since wagmi starts no
 * other reconnect while one waits. Render with `WalletSetupProvider` not pending, inside `TestDataProvider`, so wagmi reconnects at mount.
 */
export interface ReturningTestWallet {
  readonly config: Config;
  readonly setup: WalletSetup;
  readonly remembered: Connector;
  /** Every transaction the remembered wallet was asked to send; each is answered with `TEST_TX_HASH`. */
  readonly sent: readonly unknown[];
  /** Wagmi learns the remembered wallet is authorized, and restores its connection. */
  authorizeRemembered(): Promise<void>;
  /** Wagmi learns the other wallet is not authorized, which ends its reconnect. */
  endProbe(): Promise<void>;
}

type ProviderRequest = (args: { readonly method: string; readonly params?: unknown }) => Promise<unknown>;

/**
 * The mock connector forwards every method it does not answer itself to its chain's RPC URL: here the wallet answers
 * `eth_accounts` and signs `eth_sendTransaction` itself, and refuses whatever else would leave the test.
 */
function offlineProvider(provider: { readonly request: ProviderRequest }, sent: unknown[]): { readonly request: ProviderRequest } {
  const local = new Set(["eth_chainId", "eth_requestAccounts", "wallet_switchEthereumChain"]);
  return {
    ...provider,
    request: (args) => {
      if (args.method === "eth_accounts") return Promise.resolve([TEST_WALLET_ACCOUNT]);
      if (args.method === "eth_sendTransaction") {
        sent.push(args.params);
        return Promise.resolve(TEST_TX_HASH);
      }
      if (local.has(args.method)) return provider.request(args);
      return Promise.reject(new Error(`The returning test wallet does not answer ${args.method}.`));
    },
  };
}

function keepOffline(connector: Connector, sent: unknown[]): void {
  const getProvider = connector.getProvider.bind(connector);
  vi.spyOn(connector, "getProvider").mockImplementation(async (parameters) => offlineProvider((await getProvider(parameters)) as { readonly request: ProviderRequest }, sent));
}

/** Resolves once wagmi, which reads its storage on its own when the config is created, holds the stored connection. */
async function storedConnectionRead(config: Config): Promise<void> {
  await vi.waitFor(() => {
    if (config.state.current === null) throw new Error("Wagmi has not read the stored connection yet.");
  });
}

export async function createReturningTestWallet(options: ReturningTestWalletOptions = {}): Promise<ReturningTestWallet> {
  const { stored = true } = options;
  const chains = testChains(100);
  const storage = createStorage({ storage: createMemoryStorage(stored ? { "wagmi.store": CONNECTED_WAGMI_STORE } : {}) });
  const config = createConfig({
    chains,
    transports: rejectingTransports(chains),
    connectors: [mock({ accounts: [TEST_WALLET_ACCOUNT] }), mock({ accounts: [TEST_WALLET_SECOND_ACCOUNT] })],
    storage,
    multiInjectedProviderDiscovery: false,
    ssr: false,
  });
  if (stored) await storedConnectionRead(config);
  const [remembered, other] = config.connectors;
  if (remembered === undefined || other === undefined) throw new Error("The mock connectors were not created.");
  const sent: unknown[] = [];
  keepOffline(remembered, sent);
  keepOffline(other, sent);
  const authorization = deferred<boolean>();
  const probe = deferred<boolean>();
  vi.spyOn(remembered, "isAuthorized").mockReturnValueOnce(authorization.promise).mockResolvedValue(true);
  vi.spyOn(other, "isAuthorized").mockReturnValueOnce(probe.promise).mockResolvedValue(false);
  const release = async (check: { readonly promise: Promise<boolean>; resolve(value: boolean): void }, value: boolean) => {
    await act(async () => {
      check.resolve(value);
      await check.promise;
    });
  };
  return {
    config,
    setup: { mode: "appkit", wagmiConfig: config, modal: fakeModal(false) },
    remembered,
    sent,
    authorizeRemembered: () => release(authorization, true),
    endProbe: () => release(probe, false),
  };
}

/**
 * Puts wagmi in the state of a reconnect that has only read the connection from storage: status `reconnecting`, and the
 * current connection's connector the method-less `{ id, name, type, uid }` wagmi persists, so the app reads `connecting`.
 * Returns the restore: the real connector comes back and wagmi is `connected`.
 */
export function holdWalletRestore(wallet: TestWallet): () => void {
  const { current } = wallet.config.state;
  const connection = current === null ? undefined : wallet.config.state.connections.get(current);
  if (current === null || connection === undefined) throw new Error("The test wallet has no connection to restore.");
  const { id, name, type, uid } = connection.connector;
  // Wagmi types every connection's connector as a full `Connector`, though the one it reads from storage is this stub.
  const stored = { ...connection, connector: { id, name, type, uid } as Connector };
  act(() => {
    wallet.config.setState((state) => ({ ...state, status: "reconnecting", connections: new Map(state.connections).set(current, stored) }));
  });
  return () => {
    act(() => {
      wallet.config.setState((state) => {
        const now = state.connections.get(current);
        const connections = new Map(state.connections).set(current, { ...(now ?? stored), connector: connection.connector });
        return { ...state, status: "connected", connections };
      });
    });
  };
}

export function setWalletStatus(wallet: TestWallet, status: Config["state"]["status"]): void {
  act(() => {
    wallet.config.setState((state) => ({ ...state, status }));
  });
}
