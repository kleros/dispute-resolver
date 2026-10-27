import type { ComponentType, ReactNode } from "react";
import type { AppConfig } from "../env";
import type { ColorSchemeStore } from "../theme";
import type { PageScroll } from "./pageScroll";

export type ToastVariant = "success" | "error" | "sync";

export interface ToastInput {
  readonly variant: ToastVariant;
  readonly title: string;
  readonly message?: string;
  /** Default 5000 ms. */
  readonly autoHideMs?: number;
}

export interface Toaster {
  show(toast: ToastInput): void;
}

export type ConfiguredProvider = ComponentType<{ readonly config: AppConfig; readonly children?: ReactNode }>;

/** `data` and `atlas` sit above shell in the dependency order, so `App.tsx` passes their providers in. */
export interface AppProvidersProps {
  readonly config: AppConfig;
  readonly dataProvider: ConfiguredProvider;
  readonly atlasGate: ConfiguredProvider;
  /** Created by `main.tsx` before the first render, so the first paint is already themed. */
  readonly colorScheme: ColorSchemeStore;
  /** Chosen by `main.tsx` before the first render and never again, so the app never remounts into another scroller. */
  readonly pageScroll: PageScroll;
  readonly children?: ReactNode;
}
