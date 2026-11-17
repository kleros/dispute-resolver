import { createContext, useContext, useState, type ReactNode } from "react";
import type { WriteOutcome } from "./types";

export interface WritesInFlight {
  /** The write held under `key`, until it settles. */
  find(key: string): Promise<WriteOutcome> | undefined;
  has(key: string): boolean;
  hold(key: string, write: Promise<WriteOutcome>): void;
}

/** Without the provider nothing is held, and every screen keeps its own busy state. */
const NOTHING_HELD: WritesInFlight = { find: () => undefined, has: () => false, hold: () => undefined };

const WritesInFlightContext = createContext<WritesInFlight>(NOTHING_HELD);

function createWritesInFlight(): WritesInFlight {
  const held = new Map<string, Promise<WriteOutcome>>();
  return {
    find: (key) => held.get(key),
    has: (key) => held.has(key),
    hold(key, write) {
      held.set(key, write);
      const release = () => {
        if (held.get(key) === write) held.delete(key);
      };
      void write.then(release, release);
    },
  };
}

/**
 * Above the routes, so a screen that navigation remounts finds the write its earlier mount started. Nothing is stored:
 * a reload ends the wait, as it does for a dropped transaction.
 */
export function WritesInFlightProvider({ children }: { readonly children?: ReactNode }) {
  const [writes] = useState(createWritesInFlight);
  return <WritesInFlightContext.Provider value={writes}>{children}</WritesInFlightContext.Provider>;
}

export function useWritesInFlight(): WritesInFlight {
  return useContext(WritesInFlightContext);
}
