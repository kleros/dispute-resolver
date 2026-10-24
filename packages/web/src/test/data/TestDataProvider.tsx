import type { Unavailable, UnavailableCode } from "@dispute-resolver/core";
import { QueryClientProvider, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { CoreDepsProvider, createQueryClient, type CoreDeps, type SectionData } from "../../data";
import { createTestDeps } from "./createTestDeps";

export interface TestDataProviderProps {
  /** Defaults to `createTestDeps()`. */
  readonly deps?: CoreDeps;
  /** A client the test keeps a handle on; defaults to a fresh one. */
  readonly client?: QueryClient;
  /** Query data written before the first render, keyed with `queryKeys`, so a screen renders without any read. */
  readonly seed?: readonly (readonly [QueryKey, unknown])[];
  readonly children?: ReactNode;
}

/**
 * A fresh QueryClient with the app's defaults (no retries, no focus refetch) and no persister. The one retry
 * `useFamily` asks for happens without delay.
 */
export function createTestQueryClient(): QueryClient {
  const client = createQueryClient();
  client.setDefaultOptions({ queries: { ...client.getDefaultOptions().queries, retryDelay: 0 } });
  return client;
}

function createSetup({ deps, client, seed = [] }: TestDataProviderProps): { readonly queryClient: QueryClient; readonly deps: CoreDeps } {
  const queryClient = client ?? createTestQueryClient();
  for (const [key, data] of seed) queryClient.setQueryData(key, data);
  return { queryClient, deps: deps ?? createTestDeps() };
}

export function TestDataProvider(props: TestDataProviderProps) {
  const [setup] = useState(() => createSetup(props));
  const { children } = props;
  return (
    <QueryClientProvider client={setup.queryClient}>
      <CoreDepsProvider deps={setup.deps}>{children}</CoreDepsProvider>
    </QueryClientProvider>
  );
}

export function sectionReady<T>(value: T): SectionData<T> {
  return { status: "ready", value };
}

export function sectionUnavailable(code: UnavailableCode, message = `Test failure (${code}).`): SectionData<never> {
  const error: Unavailable = { code, message };
  return { status: "unavailable", error };
}

export const sectionLoading: SectionData<never> = { status: "loading" };
