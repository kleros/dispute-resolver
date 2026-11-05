import type { ComponentType, ReactNode } from "react";
import type { AppConfig } from "../env";
import type { ColorSchemeStore } from "../theme";
import type { PageScroll } from "./pageScroll";

export interface ToastLink {
  readonly href: string;
  readonly label: string;
}

export interface ToastInput {
  readonly variant: "success" | "error" | "sync";
  readonly title: string;
  readonly message?: string;
  /** `null`: no clock, the toast stays until it is closed or updated. Default 5000. */
  readonly autoHideMs?: number | null;
  /** Under the message, through safe-content's ExternalLink. */
  readonly link?: ToastLink;
  /** A live control under the message, rendered in the app's tree, so the wallet's context reaches it. */
  readonly action?: ReactNode;
}

export interface Toaster {
  /** Shows a new toast at the end of the stack; returns its id. */
  show(toast: ToastInput): number;
  /** Replaces the toast's content in place and restarts its clock. A closing toast stays open; a removed one is shown again at the end. */
  update(id: number, toast: ToastInput): void;
  /** Closes the toast as its close button does; an unknown id is ignored. */
  dismiss(id: number): void;
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
