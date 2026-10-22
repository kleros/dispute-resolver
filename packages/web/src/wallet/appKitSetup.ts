import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { createAppKit, type AppKit, type Features, type ThemeVariables } from "@reown/appkit";
import { CHAINS, DEFAULT_CHAIN_ID, type ChainId } from "@dispute-resolver/core";
import type { Chain } from "viem";
import type { AppConfig } from "../env";
import { configuredChains } from "./chains";
import { walletTransports } from "./transports";
import type { AppKitWalletSetup, WalletModal } from "./types";

// Only `setup.ts` imports this module, and only through a dynamic import, so AppKit, WalletConnect and the adapter's
// connectors stay out of the bundle the first paint waits for.

/**
 * AppKit's optional features, all off. `socials` is an empty array, never `false`: the wagmi adapter reads a falsy value
 * as "use the default list" and would register the embedded-wallet connector.
 */
export const APPKIT_FEATURES: Readonly<Features> = { analytics: false, email: false, socials: [], swaps: false, onramp: false };

/**
 * The modal uses the app's typeface and accent. Naming a font family also stops AppKit from preloading its own fonts
 * from a third-party origin; the app's fonts are self-hosted.
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

/** Keeps the modal on the app's color scheme, which `theme.ts` sets as a `dark` class on the root element. */
function followColorScheme(appKit: AppKit): void {
  const observer = new MutationObserver(() => {
    if (appKit.getThemeMode() !== currentThemeMode()) appKit.setThemeMode(currentThemeMode());
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
}

/** AppKit's embedded (custodial) wallet: the connector with id or type `AUTH`. */
export function isEmbeddedWalletConnector(connector: { readonly id: string; readonly type: string }): boolean {
  return connector.id === "AUTH" || connector.type.toUpperCase() === "AUTH";
}

export const EMBEDDED_WALLET_REFUSAL = "AppKit registered an embedded-wallet connector; the Reown project settings must disable social login and email.";

function appKitModal(appKit: AppKit, networks: readonly Chain[]): WalletModal {
  const hasEmbeddedWallet = async () => {
    await appKit.ready();
    return appKit.getConnectors().some(isEmbeddedWalletConnector);
  };
  return {
    async openConnect(chainId: ChainId | undefined) {
      // Checked here, not only by the Connect control, so no caller and no click before AppKit is ready can open the
      // Connect view with its embedded-wallet entry.
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
 * No `connectors` option, so the adapter's defaults apply (EIP-6963 discovery, injected, WalletConnect, Coinbase). It
 * creates AppKit, which must happen once per page: callers go through `createWalletSetupStore`, which calls it once per
 * configuration.
 */
export function createAppKitSetup(config: AppConfig, projectId: string): AppKitWalletSetup {
  const networks: [Chain, ...Chain[]] = [...configuredChains()];
  const transports = walletTransports(Object.values(CHAINS), config.env);
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
