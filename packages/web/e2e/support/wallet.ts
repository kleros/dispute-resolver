import type { BrowserContext, Page } from "@playwright/test";

// An injected EIP-1193 wallet for the Playwright suites (checklist C9: harness only, never in the bundle), installed with
// `addInitScript` before any app script. It announces one account on one chain through EIP-6963 (the app's wagmi
// discovers it and reconnects it when a wallet is configured). It sends nothing, and signs a message only when the spec
// says so (`signs`, for the Atlas sign-in); every other method is refused with 4200. A switch request is declined (4001)
// as many times as the spec says, then followed; the spec can also move the wallet to another chain or account, as a
// user does in the wallet itself.

export interface InjectedWalletOptions {
  readonly account: string;
  readonly chainId: number;
  /** How many `wallet_switchEthereumChain` requests the user declines before the wallet follows them (default 0). */
  readonly declinedSwitches?: number;
  /** Whether the user signs the messages `personal_sign` asks for (default: refused with 4200, like any other method). */
  readonly signs?: boolean;
}

/** One message the user signed: the account that signed it and the text it read. */
export interface SignedMessage {
  readonly account: string;
  readonly message: string;
}

/** The EIP-6963 identity of the injected wallet; wagmi keys its injected connector by `rdns`. */
const WALLET_RDNS = "io.kleros.e2e-wallet";

/** The page-side handle the spec drives through `page.evaluate`. */
const HANDLE = "__e2eWallet";

interface WalletHandle {
  /** Every method the page asked for, in order. */
  readonly requests: string[];
  /** Every message signed, in order. */
  readonly signed: SignedMessage[];
  /** Moves the wallet to `chainId` and tells the page, as a chain change made in the wallet does. */
  changeChain(chainId: number): void;
  /** Makes `account` the wallet's account and tells the page, as an account switch made in the wallet does. */
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
  } catch {
    // Storage may be blocked; wagmi then still finds the authorized wallet when it reconnects every connector.
  }
}

/** Installs the wallet in every page of `context`. */
export async function injectWallet(context: BrowserContext, options: InjectedWalletOptions): Promise<void> {
  await context.addInitScript(installWallet, { ...options, rdns: WALLET_RDNS, handle: HANDLE });
}

/** Moves the page's wallet to `chainId`, as the user does in the wallet. */
export async function changeWalletChain(page: Page, chainId: number): Promise<void> {
  await page.evaluate(
    ({ handle, next }) => {
      (Reflect.get(window, handle) as WalletHandle).changeChain(next);
    },
    { handle: HANDLE, next: chainId },
  );
}

/** Makes `account` the page's wallet account, as the user does in the wallet. */
export async function changeWalletAccount(page: Page, account: string): Promise<void> {
  await page.evaluate(
    ({ handle, next }) => {
      (Reflect.get(window, handle) as WalletHandle).changeAccount(next);
    },
    { handle: HANDLE, next: account },
  );
}

/** The messages the user signed in the page's current document, in order. */
export async function walletSignatures(page: Page): Promise<SignedMessage[]> {
  return page.evaluate((handle) => [...(Reflect.get(window, handle) as WalletHandle).signed], HANDLE);
}

/** The methods the page asked the wallet for, in order. */
export async function walletRequests(page: Page): Promise<string[]> {
  return page.evaluate((handle) => [...(Reflect.get(window, handle) as WalletHandle).requests], HANDLE);
}
