import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { useState, type ReactNode } from "react";
import type { AppConfig } from "../env";
import { CoreDepsProvider } from "./context";
import { createCoreDeps } from "./coreDeps";
import { createPersistOptions, type PersistStorage } from "./persistence";
import { createQueryClient } from "./queryClient";

/** Reading `window.localStorage` itself throws when storage is blocked or the context is sandboxed. */
function browserStorage(): PersistStorage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/** Mounting makes no network request. */
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
