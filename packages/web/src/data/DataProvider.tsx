import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { useState, type ReactNode } from "react";
import type { AppConfig } from "../env";
import { CoreDepsProvider } from "./context";
import { createCoreDeps } from "./coreDeps";
import { createPersistOptions, type PersistStorage } from "./persistence";
import { createQueryClient } from "./queryClient";

/** `window.localStorage`, or `undefined` when reading the property throws (blocked storage, sandboxed contexts). */
function browserStorage(): PersistStorage | undefined {
  let storage: PersistStorage | undefined;
  try {
    storage = window.localStorage;
  } catch {
    storage = undefined;
  }
  return storage;
}

/**
 * The data layer's root (ARCHITECTURE.md §2.1, §5): one QueryClient whose allowlisted queries persist to localStorage
 * through the validating deserializer (§5.4), and one `CoreDeps` (§5.1). Mounting makes no network request.
 */
export function DataProvider({ config, children }: { readonly config: AppConfig; readonly children?: ReactNode }) {
  const [setup] = useState(() => {
    const storage = browserStorage();
    return {
      client: createQueryClient(),
      persistOptions: createPersistOptions(storage),
      deps: createCoreDeps(config, { document: window.document, fetch: window.fetch.bind(window), storage }),
    };
  });
  return (
    <PersistQueryClientProvider client={setup.client} persistOptions={setup.persistOptions}>
      <CoreDepsProvider deps={setup.deps}>{children}</CoreDepsProvider>
    </PersistQueryClientProvider>
  );
}
