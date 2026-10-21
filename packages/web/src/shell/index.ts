// Public surface of `shell` (owner: shell; ARCHITECTURE.md §2.1, §11.2): the page frame, the provider tree with its
// root boundary, toasts and the colour scheme.
export type * from "./types";
export { AppProviders } from "./AppProviders";
export { ColorSchemeProvider, useColorScheme, type ColorSchemeControl, type ColorSchemeProviderProps } from "./colorScheme";
export { PageFrame } from "./PageFrame";
export { RootErrorBoundary } from "./RootErrorBoundary";
export { ThemeToggle } from "./ThemeToggle";
export { ToastProvider, useToast } from "./ToastProvider";
