import type { ChainId } from "@dispute-resolver/core";
import { getAccount, switchChain, type Config } from "@wagmi/core";
import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { useConfig } from "wagmi";
import { chainName } from "./chains";
import { errorMessage, isUserRejection } from "./errors";

export type SwitchResult = { readonly ok: true } | { readonly ok: false; readonly reason: "no-wallet" | "rejected" | "failed" | "pending"; readonly message: string };

const PENDING_MESSAGE = "A network switch is already waiting in your wallet.";

interface InFlightSwitch {
  readonly chainId: ChainId;
}

interface InFlightStore {
  current: InFlightSwitch | null;
  readonly listeners: Set<() => void>;
}

/** One record per wagmi config, so every switch control of the app sees the request any of them started. */
const inFlightStores = new WeakMap<Config, InFlightStore>();

function inFlightStore(config: Config): InFlightStore {
  const existing = inFlightStores.get(config);
  if (existing !== undefined) return existing;
  const created: InFlightStore = { current: null, listeners: new Set() };
  inFlightStores.set(config, created);
  return created;
}

function setInFlight(store: InFlightStore, value: InFlightSwitch | null): void {
  store.current = value;
  for (const listener of store.listeners) listener();
}

/**
 * Asks the connected wallet to change to `chainId` through wagmi, which offers `wallet_addEthereumChain` when the
 * wallet does not know the chain. Never throws: no wallet, a rejection and any failure are results to show.
 * One request at a time: a wallet shows one prompt, and a second request while it waits would be refused by the wallet
 * or stacked behind the first, so it is answered `pending` here and never sent.
 */
export async function switchWalletChain(config: Config, chainId: ChainId): Promise<SwitchResult> {
  const name = chainName(chainId);
  if (getAccount(config).status !== "connected") {
    return { ok: false, reason: "no-wallet", message: `Connect a wallet to switch to ${name}.` };
  }
  const store = inFlightStore(config);
  if (store.current !== null) return { ok: false, reason: "pending", message: PENDING_MESSAGE };
  setInFlight(store, { chainId });
  try {
    await switchChain(config, { chainId });
    return { ok: true };
  } catch (error) {
    if (isUserRejection(error)) return { ok: false, reason: "rejected", message: `The switch to ${name} was declined in the wallet.` };
    return { ok: false, reason: "failed", message: `Could not switch to ${name}: ${errorMessage(error)}` };
  } finally {
    setInFlight(store, null);
  }
}

export type NetworkSwitchState =
  { readonly status: "idle" } | { readonly status: "switching"; readonly chainId: ChainId } | { readonly status: "failed"; readonly chainId: ChainId; readonly message: string };

export interface NetworkSwitch {
  /** `switching` while any request of the app waits in the wallet, whichever control started it. */
  readonly state: NetworkSwitchState;
  /** Resolves with the outcome; a failure also stays in `state` for an inline message, and `pending` changes nothing. */
  readonly switchTo: (chainId: ChainId) => Promise<SwitchResult>;
}

const IDLE: NetworkSwitchState = { status: "idle" };

/**
 * The name of a switch control while its switch is pending: the library Button hides its text while loading, so the
 * control would otherwise be announced without a name. `undefined` leaves the visible text as the name.
 */
export function switchingLabel(state: NetworkSwitchState): string | undefined {
  return state.status === "switching" ? `Switching to ${chainName(state.chainId)}` : undefined;
}

export function useNetworkSwitch(): NetworkSwitch {
  const config = useConfig();
  const store = useMemo(() => inFlightStore(config), [config]);
  const subscribe = useCallback(
    (listener: () => void) => {
      store.listeners.add(listener);
      return () => {
        store.listeners.delete(listener);
      };
    },
    [store],
  );
  const inFlight = useSyncExternalStore(subscribe, () => store.current);
  const [settled, setSettled] = useState<NetworkSwitchState>(IDLE);
  const switchTo = useCallback(
    async (chainId: ChainId) => {
      const result = await switchWalletChain(config, chainId);
      if (result.ok) setSettled(IDLE);
      else if (result.reason !== "pending") setSettled({ status: "failed", chainId, message: result.message });
      return result;
    },
    [config],
  );
  const state = useMemo<NetworkSwitchState>(() => (inFlight === null ? settled : { status: "switching", chainId: inFlight.chainId }), [inFlight, settled]);
  return { state, switchTo };
}
