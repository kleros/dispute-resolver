import type { BrowserContext } from "@playwright/test";

// The account context of 04 §1 (checklist C9: harness only, never in the bundle): a read-only EIP-1193 provider injected
// with `addInitScript` that announces one account on the page's chain and signs nothing. Production reads it from
// `window.ethereum`; the new app discovers it through EIP-6963 and wagmi reconnects it when a wallet is configured.

export interface HarnessProviderOptions {
  readonly account: string;
  readonly chainId: number;
}

/** The EIP-6963 identity of the harness provider; wagmi keys its injected connector by `rdns`. */
const HARNESS_RDNS = "io.kleros.golden-harness";

/** Runs in the page before any app script. Every method that would sign, send or read chain state is refused. */
function installHarnessProvider(options: HarnessProviderOptions & { readonly rdns: string }): void {
  const chainHex = `0x${options.chainId.toString(16)}`;
  const answers: Readonly<Record<string, unknown>> = {
    eth_accounts: [options.account],
    eth_requestAccounts: [options.account],
    eth_chainId: chainHex,
    net_version: String(options.chainId),
    wallet_switchEthereumChain: null,
    wallet_getPermissions: [{ parentCapability: "eth_accounts" }],
    wallet_requestPermissions: [{ parentCapability: "eth_accounts" }],
  };
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const provider = {
    isGoldenHarness: true,
    selectedAddress: options.account,
    chainId: chainHex,
    request({ method }: { readonly method: string }): Promise<unknown> {
      if (method in answers) return Promise.resolve(answers[method]);
      return Promise.reject(Object.assign(new Error(`The golden harness provider is read-only and does not support ${method}.`), { code: 4200 }));
    },
    on(event: string, listener: (...args: unknown[]) => void) {
      const set = listeners.get(event) ?? new Set();
      set.add(listener);
      listeners.set(event, set);
      return provider;
    },
    removeListener(event: string, listener: (...args: unknown[]) => void) {
      listeners.get(event)?.delete(listener);
      return provider;
    },
    removeAllListeners(event?: string) {
      if (event === undefined) listeners.clear();
      else listeners.delete(event);
      return provider;
    },
  };
  Object.defineProperty(window, "ethereum", { value: provider, configurable: true });
  const info = {
    uuid: "6e6f6e65-0000-4000-8000-676f6c64656e",
    name: "Golden harness (read-only)",
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E",
    rdns: options.rdns,
  };
  const announce = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info, provider }) }));
  window.addEventListener("eip6963:requestProvider", announce);
  announce();
  try {
    window.localStorage.setItem("wagmi.recentConnectorId", JSON.stringify(options.rdns));
  } catch {
    // Storage may be blocked; wagmi then simply does not reconnect, and the snapshot records no account.
  }
}

/** Installs the provider in every page of `context` for one account on one chain. */
export async function injectHarnessAccount(context: BrowserContext, options: HarnessProviderOptions): Promise<void> {
  await context.addInitScript(installHarnessProvider, { ...options, rdns: HARNESS_RDNS });
}
