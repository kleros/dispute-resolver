import type { ComponentType, ReactNode } from "react";
import type { AppConfig } from "../env";
import type { ResolvedChain } from "../routing";
import type { ColorSchemeStore } from "../theme";

/** The library `PushMessage` variants. */
export type ToastVariant = "success" | "error" | "sync";

export interface ToastInput {
  readonly variant: ToastVariant;
  readonly title: string;
  readonly message?: string;
  /** Default 5000 ms (spec 4.6). */
  readonly autoHideMs?: number;
}

/** `useToast()`. */
export interface Toaster {
  show(toast: ToastInput): void;
}

/** Header, main and footer around every screen (ARCHITECTURE.md §11.2). */
export interface PageFrameProps {
  readonly resolvedChain: ResolvedChain;
  readonly children: ReactNode;
}

/** A provider of the tree of ARCHITECTURE.md §2.1 that takes the app configuration (`DataProvider`, `AtlasGate`). */
export type ConfiguredProvider = ComponentType<{ readonly config: AppConfig; readonly children?: ReactNode }>;

/**
 * `AppProviders`: the provider tree of ARCHITECTURE.md §2.1 below `StrictMode`, in its forced order. `data` and `atlas`
 * sit above shell in the dependency table (§1.3), so `App.tsx` passes their providers in.
 */
export interface AppProvidersProps {
  readonly config: AppConfig;
  /** `DataProvider` (data): QueryClient, persister and core dependencies. */
  readonly dataProvider: ConfiguredProvider;
  /** `AtlasGate` (atlas): the Atlas provider when the URI is configured. */
  readonly atlasGate: ConfiguredProvider;
  /** Created by `main.tsx` before the first render, so the first paint is already themed. */
  readonly colorScheme: ColorSchemeStore;
  readonly children?: ReactNode;
}
