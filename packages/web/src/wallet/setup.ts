import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { createAppKit, type AppKit } from "@reown/appkit";
import type { Features, ThemeVariables } from "@reown/appkit";
import { CHAINS, DEFAULT_CHAIN_ID, type ChainId } from "@dispute-resolver/core";
import type { Chain } from "viem";
import { createConfig } from "wagmi";
import type { AppConfig } from "../env";
import { configuredChains } from "./chains";
import { walletTransports } from "./transports";
import type { WalletModal, WalletSetup } from "./types";

/**
 * AppKit's optional features, all off (C8, ADR 0002). `socials` is an empty array, never `false`: the wagmi adapter
 * reads a falsy value as "use the default list" and would register the embedded-wallet connector.
 */
export const APPKIT_FEATURES: Readonly<Features> = { analytics: false, email: false, socials: [], swaps: false, onramp: false };

/**
 * The modal uses the app's typeface and accent. Naming a font family also stops AppKit from preloading its own fonts
 * from a third-party origin (A20: fonts are self-hosted).
 */
const THEME_VARIABLES: ThemeVariables = {
  "--w3m-font-family": '"Open Sans", system-ui, sans-serif',
  "--w3m-accent": "var(--klerosUIComponentsPrimaryBlue)",
  "--w3m-border-radius-master": "3px",
};

const DARK_CLASS = "dark";

function currentThemeMode(): "dark" | "light" {
  return document.documentElement.classList.contains(DARK_CLASS) ? "dark" : "light";
}

/** Keeps the modal on the app's color scheme, which `theme.ts` sets as a `dark` class on the root element (§11.1). */
function followColorScheme(appKit: AppKit): void {
  const observer = new MutationObserver(() => {
    if (appKit.getThemeMode() !== currentThemeMode()) appKit.setThemeMode(currentThemeMode());
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
}

/** AppKit's embedded (custodial) wallet: the connector with id or type `AUTH` (C8, ADR 0002). */
export function isEmbeddedWalletConnector(connector: { readonly id: string; readonly type: string }): boolean {
  return connector.id === "AUTH" || connector.type.toUpperCase() === "AUTH";
}

/** Why `openConnect` refuses when AppKit registered an embedded wallet anyway (K-03). */
export const EMBEDDED_WALLET_REFUSAL = "AppKit registered an embedded-wallet connector; the Reown project settings must disable social login and email (K-01).";

function appKitModal(appKit: AppKit, networks: readonly Chain[]): WalletModal {
  const hasEmbeddedWallet = async () => {
    await appKit.ready();
    return appKit.getConnectors().some(isEmbeddedWalletConnector);
  };
  return {
    async openConnect(chainId: ChainId | undefined) {
      // Checked here, not only by the Connect control, so no caller and no click before AppKit is ready can open the
      // Connect view, whose embedded-wallet entry ADR 0002 rules out (K-03).
      if (await hasEmbeddedWallet()) throw new Error(EMBEDDED_WALLET_REFUSAL);
      const network = networks.find((chain) => chain.id === chainId);
      if (network !== undefined) await appKit.switchNetwork(network);
      await appKit.open({ view: "Connect" });
    },
    async openNetworks() {
      await appKit.open({ view: "Networks" });
    },
    ready: () => appKit.ready(),
    hasEmbeddedWallet,
  };
}

/**
 * The wallet setup of ARCHITECTURE.md §2.3. With a WalletConnect project ID: the AppKit wagmi adapter over the
 * configured chains and AppKit with every optional feature off (C8); no `connectors` option, so the adapter's defaults
 * apply (EIP-6963 discovery, injected, WalletConnect, Coinbase). Without one: a wagmi config with no connector and no
 * EIP-6963 discovery, so the app runs read-only (K-02). Either way each chain's transport is its configured read RPC or
 * one that always rejects (D-56).
 */
export function createWalletSetup(config: AppConfig): WalletSetup {
  const chains = configuredChains();
  const transports = walletTransports(Object.values(CHAINS), config.env);
  const projectId = config.walletConnectProjectId;

  if (projectId === null) {
    const wagmiConfig = createConfig({ chains, transports, connectors: [], multiInjectedProviderDiscovery: false, ssr: false });
    return { mode: "unconfigured", wagmiConfig };
  }

  const networks: [Chain, ...Chain[]] = [...chains];
  const adapter = new WagmiAdapter({ networks, projectId, transports, ssr: false });
  const defaultNetwork = networks.find((chain) => chain.id === DEFAULT_CHAIN_ID) ?? networks[0];
  const appKit = createAppKit({
    adapters: [adapter],
    networks,
    projectId,
    metadata: {
      name: "Kleros Dispute Resolver",
      description: "View, create and appeal Kleros disputes, and submit evidence.",
      url: config.appOrigin,
      icons: [`${config.appOrigin}/favicon.ico`],
    },
    defaultNetwork,
    allowUnsupportedChain: true,
    // A copy, so AppKit never holds the exported object.
    features: { ...APPKIT_FEATURES, socials: [] },
    themeMode: currentThemeMode(),
    themeVariables: THEME_VARIABLES,
  });
  followColorScheme(appKit);
  return { mode: "appkit", wagmiConfig: adapter.wagmiConfig, modal: appKitModal(appKit, networks) };
}

const setups = new WeakMap<AppConfig, WalletSetup>();

/** The one setup of a configuration, created on first use: AppKit must be created once per page. */
export function walletSetupFor(config: AppConfig): WalletSetup {
  const existing = setups.get(config);
  if (existing !== undefined) return existing;
  const setup = createWalletSetup(config);
  setups.set(config, setup);
  return setup;
}
