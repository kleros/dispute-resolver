import { createContext, createElement, useContext, useSyncExternalStore, type ReactNode } from "react";

/** One clock for every countdown on the page: a single interval, running only while something listens. */
const TICK_MS = 30_000;

let nowMs = Date.now();
let interval: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();

function tick(): void {
  nowMs = Date.now();
  listeners.forEach((listener) => {
    listener();
  });
}

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) {
    // The clock was idle, so its time is stale; React re-reads the snapshot after subscribing.
    nowMs = Date.now();
    interval = setInterval(tick, TICK_MS);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && interval !== undefined) {
      clearInterval(interval);
      interval = undefined;
    }
  };
}

function getSnapshot(): number {
  return nowMs;
}

/** Milliseconds to add to the browser clock to read the page chain's clock; 0 outside a `ChainClockProvider`. */
const ChainClockContext = createContext(0);

/** Every countdown and deadline below it reads chain time: the browser clock plus `offsetMs`. */
export function ChainClockProvider({ offsetMs, children }: { readonly offsetMs: number; readonly children?: ReactNode }) {
  return createElement(ChainClockContext.Provider, { value: offsetMs }, children);
}

/** The page chain's current Unix time in seconds (the browser's outside a chain clock), refreshed every 30 s by the shared clock. */
export function useNowSeconds(): number {
  return Math.floor((useSyncExternalStore(subscribe, getSnapshot) + useContext(ChainClockContext)) / 1000);
}
