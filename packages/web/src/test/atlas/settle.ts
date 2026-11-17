import { act, waitFor } from "@testing-library/react";
import { expect } from "vitest";

export function startInAct<T>(start: () => Promise<T>): Promise<T> {
  const started: { promise?: Promise<T> } = {};
  act(() => {
    started.promise = start();
  });
  if (started.promise === undefined) throw new Error("The upload did not start.");
  return started.promise;
}

/**
 * Starts an upload and waits for its outcome. An upload that signs in waits for the library's provider to re-render with
 * the new session, and an async `act()` would hold those renders back until it returns, so only the synchronous start
 * runs inside `act` and the rest is awaited with `waitFor`.
 */
export async function settle<T>(start: () => Promise<T>, timeout = 5000): Promise<T> {
  const promise = startInAct(start);
  let done = false;
  void promise.finally(() => {
    done = true;
  });
  await waitFor(
    () => {
      expect(done).toBe(true);
    },
    { timeout },
  );
  return promise;
}
