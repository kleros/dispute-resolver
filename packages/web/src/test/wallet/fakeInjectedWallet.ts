import { createConfig, custom, injected, type Config } from "@wagmi/core";
import { numberToHex, type Chain, type EIP1193Provider } from "viem";
import { TEST_WALLET_ACCOUNT } from "./testWallet";

/** One `wallet_addEthereumChain` request, as the wallet received it. */
export interface AddChainRequest {
  readonly chainId: string;
  readonly chainName: string;
  readonly rpcUrls: readonly string[];
}

export interface FakeInjectedWalletOptions {
  /** The chains of the wagmi config, as the app defines them: wagmi offers their `rpcUrls` in `wallet_addEthereumChain`. */
  readonly chains: readonly [Chain, ...Chain[]];
  /** The chains the wallet knows; it starts on the first. Default: mainnet only. */
  readonly knownChains?: readonly [number, ...number[]];
  /** What the user does when the wallet offers to add a chain: `approve` (default) adds it and switches to it. */
  readonly addChain?: "approve" | "reject";
}

export interface FakeInjectedWallet {
  /** A wagmi config over `chains` whose only connector is wagmi's `injected` over this wallet. */
  readonly config: Config;
  readonly addChainRequests: readonly AddChainRequest[];
  /** The chain the wallet is on. */
  chainId(): number;
}

type Listener = (...args: unknown[]) => void;

function providerError(code: number, message: string): Error {
  return Object.assign(new Error(message), { code });
}

/**
 * A browser wallet as an EIP-1193 provider for the chain-switch flow: it answers
 * `wallet_switchEthereumChain` for a chain it does not know with error 4902, as MetaMask does, and records every
 * `wallet_addEthereumChain` request. Driven through wagmi's real `injected` connector, so the add-chain fallback under
 * test is wagmi's own. Nothing reaches a network: every read transport rejects.
 */
export function createFakeInjectedWallet(options: FakeInjectedWalletOptions): FakeInjectedWallet {
  const { chains, knownChains = [1], addChain = "approve" } = options;
  const known = new Set<number>(knownChains);
  let current: number = knownChains[0];
  const addChainRequests: AddChainRequest[] = [];
  const listeners = new Map<string, Set<Listener>>();
  const emit = (event: string, value: unknown) => {
    for (const listener of listeners.get(event) ?? []) listener(value);
  };
  const moveTo = (chainId: number) => {
    current = chainId;
    emit("chainChanged", numberToHex(chainId));
  };

  const request = ({ method, params }: { readonly method: string; readonly params?: unknown }): Promise<unknown> => {
    const [parameter] = Array.isArray(params) ? (params as readonly unknown[]) : [];
    switch (method) {
      case "eth_accounts":
      case "eth_requestAccounts":
        return Promise.resolve([TEST_WALLET_ACCOUNT]);
      case "eth_chainId":
        return Promise.resolve(numberToHex(current));
      case "wallet_requestPermissions":
      case "wallet_getPermissions":
        return Promise.resolve([{ parentCapability: "eth_accounts" }]);
      case "wallet_switchEthereumChain": {
        const chainId = Number((parameter as { readonly chainId: string }).chainId);
        if (!known.has(chainId)) return Promise.reject(providerError(4902, `Unrecognized chain ID ${numberToHex(chainId)}.`));
        moveTo(chainId);
        return Promise.resolve(null);
      }
      case "wallet_addEthereumChain": {
        const added = parameter as AddChainRequest;
        addChainRequests.push({ chainId: added.chainId, chainName: added.chainName, rpcUrls: [...added.rpcUrls] });
        if (addChain === "reject") return Promise.reject(providerError(4001, "User rejected the request."));
        known.add(Number(added.chainId));
        moveTo(Number(added.chainId));
        return Promise.resolve(null);
      }
      default:
        return Promise.reject(providerError(4200, `The fake injected wallet does not support ${method}.`));
    }
  };

  const provider = {
    request,
    on(event: string, listener: Listener) {
      const set = listeners.get(event) ?? new Set<Listener>();
      set.add(listener);
      listeners.set(event, set);
      return provider;
    },
    removeListener(event: string, listener: Listener) {
      listeners.get(event)?.delete(listener);
      return provider;
    },
  };

  const transports = Object.fromEntries(
    chains.map((chain) => [chain.id, custom({ request: () => Promise.reject(new Error("Tests read through core's test deps, never through wagmi.")) })]),
  );
  // The fake answers only the methods the switch flow sends; viem's provider type lists every RPC method.
  const connector = injected({ target: { id: "fakeInjectedWallet", name: "Fake injected wallet", provider: provider as unknown as EIP1193Provider } });
  const config = createConfig({ chains, transports, connectors: [connector], storage: null, multiInjectedProviderDiscovery: false, ssr: false });

  return { config, addChainRequests, chainId: () => current };
}
