import { useSyncExternalStore } from "react";

/** One clock for every countdown on the page (11.3): a single interval, running only while something listens. */
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

/** The current Unix time in seconds, refreshed every 30 s by the shared clock. */
export function useNowSeconds(): number {
  return Math.floor(useSyncExternalStore(subscribe, getSnapshot) / 1000);
}
