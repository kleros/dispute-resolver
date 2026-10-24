import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import type { ColorScheme, ColorSchemeStore } from "../theme";

const ColorSchemeContext = createContext<ColorSchemeStore | null>(null);

export interface ColorSchemeProviderProps {
  readonly store: ColorSchemeStore;
  readonly children?: ReactNode;
}

export interface ColorSchemeControl {
  readonly scheme: ColorScheme;
  readonly toggle: () => void;
}

/** Makes `store` the one `useColorScheme()` reads below it. */
export function ColorSchemeProvider({ store, children }: ColorSchemeProviderProps) {
  return <ColorSchemeContext.Provider value={store}>{children}</ColorSchemeContext.Provider>;
}

/** The page's current colour scheme and the action that flips it. */
export function useColorScheme(): ColorSchemeControl {
  const store = useContext(ColorSchemeContext);
  if (store === null) throw new Error("useColorScheme must be used inside ColorSchemeProvider.");
  const scheme = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return { scheme, toggle: store.toggle };
}
