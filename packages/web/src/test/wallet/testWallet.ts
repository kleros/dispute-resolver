import { CHAINS, type Address } from "@dispute-resolver/core";
import { connect, createConfig, disconnect, mock, type Config } from "@wagmi/core";
import { custom, defineChain, getAddress, numberToHex, type Chain, type EIP1193RequestFn } from "viem";
import { vi, type Mock } from "vitest";
import type { WalletMode, WalletModal, WalletSetup } from "../../wallet";

/** The account of the test wallet (checksummed, as wallets report it). */
export const TEST_WALLET_ACCOUNT = "0x00000000000000000000000000000000000A11cE";

/** A second account of the test wallet (checksummed), for a user who switches account inside the wallet. */
export const TEST_WALLET_SECOND_ACCOUNT = "0x0000000000000000000000000000000000000B0b";

/** The test wallet's account as the app reports it (`WalletState.address`, lowercased). */
export const TEST_WALLET_ADDRESS: Address = "0x00000000000000000000000000000000000a11ce";

/** A chain no configuration has (Optimism), for a wallet on an unsupported network. */
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

export interface TestWalletOptions {
  /** `appkit` (default) gives a fake modal recording its calls; `unconfigured` has none. */
  readonly mode?: WalletMode;
  /** `true`: the fake modal reports an embedded-wallet connector once ready, as AppKit does when the Reown dashboard is misconfigured. */
  readonly embeddedWallet?: boolean;
  /** The wallet's chain once connected; default 1. */
  readonly chainId?: number;
  /** The wallet rejects (`true`) or fails (an `Error`) every switch request. */
  readonly switchChainError?: boolean | Error;
}

/** The fake AppKit modal: every call is recorded and resolves at once. */
export interface FakeWalletModal extends WalletModal {
  readonly openConnect: Mock<WalletModal["openConnect"]>;
  readonly ready: Mock<WalletModal["ready"]>;
  readonly hasEmbeddedWallet: Mock<WalletModal["hasEmbeddedWallet"]>;
}

export interface TestWallet {
  readonly config: Config;
  readonly setup: WalletSetup;
  /** `null` in the `unconfigured` mode. */
  readonly modal: FakeWalletModal | null;
  /** Connects the wallet, as if the user approved the connection. */
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
    ready: vi.fn<WalletModal["ready"]>(() => Promise.resolve()),
    hasEmbeddedWallet: vi.fn<WalletModal["hasEmbeddedWallet"]>(() => Promise.resolve(embeddedWallet)),
  };
}

/**
 * A wallet for component and hook tests: a wagmi config whose only connector is wagmi's `mock` connector, no storage,
 * no EIP-6963 discovery, and transports that reject. Render it with `TestWalletProvider` inside `TestDataProvider`
 * (wagmi needs the QueryClient). Signing through it fails (its RPC is unreachable); drive write states with
 * `fakeWriteController`, or mock `writeContract` of `@wagmi/core` in a hook test.
 */
export function createTestWallet(options: TestWalletOptions = {}): TestWallet {
  const { mode = "appkit", chainId = 1, switchChainError, embeddedWallet = false } = options;
  const chains = testChains(chainId);
  const transports = Object.fromEntries(
    chains.map((chain) => [chain.id, custom({ request: () => Promise.reject(new Error("Tests read through core's test deps, never through wagmi.")) })]),
  );
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

/** Leaves every chain switch the wallet is asked for pending, so a test can look at a control while it waits. */
export function holdChainSwitches(wallet: TestWallet): void {
  const [connector] = wallet.config.connectors;
  if (connector === undefined) throw new Error("The test wallet has no connector.");
  vi.spyOn(connector, "switchChain").mockReturnValue(new Promise<never>(() => undefined));
}
