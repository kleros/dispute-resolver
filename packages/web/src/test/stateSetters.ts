import type * as React from "react";
import type { Dispatch, SetStateAction } from "react";

type ReactModule = typeof React;

/**
 * Counts the `useState` setter calls made while `watching` is on. React 18 drops a setter call on an unmounted component
 * without a warning, so a test of "no update after unmount" has to count the calls itself. Use it from a test file's
 * `vi.mock("react", ...)` factory through `countingSetters`.
 */
export const setterCalls = { watching: false, count: 0 };

export function countingSetters(actual: ReactModule): ReactModule {
  if (typeof actual.useState !== "function") throw new TypeError("countingSetters was handed a module without useState.");
  // Each wrapper keeps the identity of the setter it wraps, so effects that depend on a setter do not re-run.
  const wrappers = new WeakMap<object, unknown>();
  function useState<S>(initial: S | (() => S)): [S, Dispatch<SetStateAction<S>>] {
    const [state, set] = actual.useState(initial);
    let counted = wrappers.get(set) as Dispatch<SetStateAction<S>> | undefined;
    if (counted === undefined) {
      counted = (next) => {
        if (setterCalls.watching) setterCalls.count += 1;
        set(next);
      };
      wrappers.set(set, counted);
    }
    return [state, counted];
  }
  return { ...actual, useState: useState as ReactModule["useState"] };
}
