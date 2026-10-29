import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import type { ColorScheme, ColorSchemeStore } from "../theme";

const ColorSchemeContext = createContext<ColorSchemeStore | null>(null);

interface ColorSchemeProviderProps {
  readonly store: ColorSchemeStore;
  readonly children?: ReactNode;
}

interface ColorSchemeControl {
  readonly scheme: ColorScheme;
  readonly toggle: () => void;
}

export function ColorSchemeProvider({ store, children }: ColorSchemeProviderProps) {
  return <ColorSchemeContext.Provider value={store}>{children}</ColorSchemeContext.Provider>;
}

export function useColorScheme(): ColorSchemeControl {
  const store = useContext(ColorSchemeContext);
  if (store === null) throw new Error("useColorScheme must be used inside ColorSchemeProvider.");
  const scheme = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return { scheme, toggle: store.toggle };
}
