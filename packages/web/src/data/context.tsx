import { createContext, useContext, type ReactNode } from "react";
import type { CoreDeps } from "./types";

const CoreDepsContext = createContext<CoreDeps | null>(null);

/** Provides the `CoreDeps` every data hook reads. `DataProvider` renders it; tests render it with test deps. */
export function CoreDepsProvider({ deps, children }: { readonly deps: CoreDeps; readonly children?: ReactNode }) {
  return <CoreDepsContext.Provider value={deps}>{children}</CoreDepsContext.Provider>;
}

export function useCoreDeps(): CoreDeps {
  const deps = useContext(CoreDepsContext);
  if (deps === null) throw new Error("useCoreDeps must be used inside DataProvider.");
  return deps;
}
