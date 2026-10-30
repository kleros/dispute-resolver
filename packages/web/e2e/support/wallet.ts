import { expect, type BrowserContext, type Locator, type Page } from "@playwright/test";

// An injected EIP-1193 wallet for the Playwright suites, installed with `addInitScript` before any app script. It
// announces one account on one chain through EIP-6963 (the app's wagmi discovers it and reconnects it when a wallet is
// configured). It sends nothing, and signs a message only when the spec
// says so (`signs`, for the Atlas sign-in); every other method is refused with 4200. A switch request is declined (4001)
// as many times as the spec says, then followed, or never answered (`heldSwitches`); the spec can also move the wallet to
// another chain or account, as a user does in the wallet itself.

export interface InjectedWalletOptions {
  readonly account: string;
  readonly chainId: number;
  /** How many `wallet_switchEthereumChain` requests the user declines before the wallet follows them (default 0). */
  readonly declinedSwitches?: number;
  /** The wallet never answers `wallet_switchEthereumChain`, as a user who leaves the prompt open (default false). */
  readonly heldSwitches?: boolean;
  /** Whether the user signs the messages `personal_sign` asks for (default: refused with 4200, like any other method). */
  readonly signs?: boolean;
  /** Wagmi's storage holds this wallet's connection from an earlier visit, as after a reload (default false). */
  readonly stored?: boolean;
}

/** Fails early, and says why, when the build connects no wallet (no WalletConnect project ID): `account` never shows. */
export async function expectWalletConnected(account: Locator): Promise<void> {
  await expect(account, "the injected wallet never connected (the build needs REACT_APP_WALLETCONNECT_PROJECT_ID)").toBeVisible({ timeout: 30_000 });
}

export interface SignedMessage {
  readonly account: string;
  readonly message: string;
}

/** The EIP-6963 identity of the injected wallet; wagmi keys its injected connector by `rdns`. */
const WALLET_RDNS = "io.kleros.e2e-wallet";

const HANDLE = "__e2eWallet";

interface WalletHandle {
  readonly requests: string[];
  readonly signed: SignedMessage[];
  changeChain(chainId: number): void;
  changeAccount(account: string): void;
}

/** Runs in the page before any app script. */
function installWallet(options: InjectedWalletOptions & { readonly rdns: string; readonly handle: string }): void {
  let chainId = options.chainId;
  let account = options.account;
  let declinesLeft = options.declinedSwitches ?? 0;
  const requests: string[] = [];
  const signed: SignedMessage[] = [];
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const hex = (id: number) => `0x${id.toString(16)}`;
  const emit = (event: string, value: unknown) => {
    for (const listener of listeners.get(event) ?? []) listener(value);
  };
  const changeChain = (next: number) => {
    if (next === chainId) return;
    chainId = next;
    provider.chainId = hex(next);
    emit("chainChanged", hex(next));
  };
  const changeAccount = (next: string) => {
    if (next === account) return;
    account = next;
    provider.selectedAddress = next;
    emit("accountsChanged", [next]);
  };
  const refuse = (code: number, message: string) => Promise.reject(Object.assign(new Error(message), { code }));
  /** `personal_sign` sends `[hex message, account]`; the message is UTF-8 text, as a SIWE message is. */
  const sign = (params: unknown): Promise<unknown> => {
    const [hexMessage, signer] = Array.isArray(params) ? (params as readonly unknown[]) : [];
    if (typeof hexMessage !== "string" || !/^0x(?:[\da-f]{2})*$/i.test(hexMessage) || typeof signer !== "string") return refuse(-32602, "Invalid parameters.");
    if (signer.toLowerCase() !== account.toLowerCase()) return refuse(4100, "The requested account is not authorized.");
    const bytes = Uint8Array.from(hexMessage.slice(2).match(/../g) ?? [], (pair) => Number.parseInt(pair, 16));
    signed.push({ account, message: new TextDecoder().decode(bytes) });
    return Promise.resolve(`0x${"ab".repeat(65)}`);
  };
  const switchChain = (params: unknown): Promise<unknown> => {
    if (options.heldSwitches === true) return new Promise(() => undefined);
    if (declinesLeft > 0) {
      declinesLeft -= 1;
      return refuse(4001, "User rejected the request.");
    }
    const target = (params as readonly { readonly chainId?: unknown }[] | undefined)?.[0]?.chainId;
    if (typeof target !== "string") return refuse(-32602, "Invalid chain ID.");
    changeChain(Number.parseInt(target, 16));
    return Promise.resolve(null);
  };
  const answers: Readonly<Record<string, () => unknown>> = {
    eth_accounts: () => [account],
    eth_requestAccounts: () => [account],
    eth_chainId: () => hex(chainId),
    net_version: () => String(chainId),
    wallet_getPermissions: () => [{ parentCapability: "eth_accounts" }],
    wallet_requestPermissions: () => [{ parentCapability: "eth_accounts" }],
  };
  const provider = {
    isE2eWallet: true,
    selectedAddress: options.account,
    chainId: hex(chainId),
    request({ method, params }: { readonly method: string; readonly params?: unknown }): Promise<unknown> {
      requests.push(method);
      if (method === "wallet_switchEthereumChain") return switchChain(params);
      if (method === "personal_sign" && options.signs === true) return sign(params);
      const answer = answers[method];
      if (answer !== undefined) return Promise.resolve(answer());
      return refuse(4200, `The e2e wallet does not support ${method}.`);
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
  const handle: WalletHandle = { requests, signed, changeChain, changeAccount };
  Object.defineProperty(window, options.handle, { value: handle });
  const info = {
    uuid: "6e6f6e65-0000-4000-8000-653265303031",
    name: "E2E wallet",
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E",
    rdns: options.rdns,
  };
  const announce = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info, provider }) }));
  window.addEventListener("eip6963:requestProvider", announce);
  announce();
  try {
    window.localStorage.setItem("wagmi.recentConnectorId", JSON.stringify(options.rdns));
    if (options.stored === true) {
      // Wagmi persists a connection's connector as `{ id, name, type, uid }`; the uid of an earlier page is never a
      // connector of this one.
      const uid = "e2e-earlier-visit";
      const connection = { accounts: [options.account], chainId: options.chainId, connector: { id: options.rdns, name: info.name, type: "injected", uid } };
      const state = { connections: { __type: "Map", value: [[uid, connection]] }, chainId: options.chainId, current: uid };
      window.localStorage.setItem("wagmi.store", JSON.stringify({ state, version: 2 }));
    }
  } catch {
    // Storage may be blocked; wagmi then still finds the authorized wallet when it reconnects every connector.
  }
}

const UNRESPONSIVE_RDNS = "io.kleros.e2e-unresponsive-wallet";

const UNRESPONSIVE_HANDLE = "__e2eUnresponsiveWallet";

/** Runs in the page before any app script. */
function installUnresponsiveWallet(options: { readonly rdns: string; readonly handle: string }): void {
  const requests: string[] = [];
  const provider = {
    request({ method }: { readonly method: string }): Promise<unknown> {
      requests.push(method);
      return new Promise(() => undefined);
    },
    on: () => provider,
    removeListener: () => provider,
    removeAllListeners: () => provider,
  };
  Object.defineProperty(window, options.handle, { value: requests });
  const info = {
    uuid: "6e6f6e65-0000-4000-8000-653265303032",
    name: "E2E unresponsive wallet",
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E",
    rdns: options.rdns,
  };
  const announce = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info, provider }) }));
  window.addEventListener("eip6963:requestProvider", announce);
  announce();
}

/**
 * A second installed wallet that never answers a request, as a browser wallet that takes many seconds to wake up: wagmi's
 * reconnect checks every installed wallet and waits on this one.
 */
export async function injectUnresponsiveWallet(context: BrowserContext): Promise<void> {
  await context.addInitScript(installUnresponsiveWallet, { rdns: UNRESPONSIVE_RDNS, handle: UNRESPONSIVE_HANDLE });
}

export function unresponsiveWalletRequests(page: Page): Promise<string[]> {
  return page.evaluate((handle) => [...(Reflect.get(window, handle) as string[])], UNRESPONSIVE_HANDLE);
}

export async function injectWallet(context: BrowserContext, options: InjectedWalletOptions): Promise<void> {
  await context.addInitScript(installWallet, { ...options, rdns: WALLET_RDNS, handle: HANDLE });
}

export async function changeWalletChain(page: Page, chainId: number): Promise<void> {
  await page.evaluate(
    ({ handle, next }) => {
      (Reflect.get(window, handle) as WalletHandle).changeChain(next);
    },
    { handle: HANDLE, next: chainId },
  );
}

export async function changeWalletAccount(page: Page, account: string): Promise<void> {
  await page.evaluate(
    ({ handle, next }) => {
      (Reflect.get(window, handle) as WalletHandle).changeAccount(next);
    },
    { handle: HANDLE, next: account },
  );
}

/** Per document: a reload empties the list. */
export function walletSignatures(page: Page): Promise<SignedMessage[]> {
  return page.evaluate((handle) => [...(Reflect.get(window, handle) as WalletHandle).signed], HANDLE);
}

export function walletRequests(page: Page): Promise<string[]> {
  return page.evaluate((handle) => [...(Reflect.get(window, handle) as WalletHandle).requests], HANDLE);
}
