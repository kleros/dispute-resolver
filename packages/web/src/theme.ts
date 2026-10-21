export type ColorScheme = "light" | "dark";

/** Where the visitor's choice is kept on this device; distinct from the query cache's `dr-query-cache`. */
export const STORAGE_KEY = "dr-color-scheme";

const DARK_QUERY = "(prefers-color-scheme: dark)";

/** The part of the `(prefers-color-scheme: dark)` `MediaQueryList` the store uses. */
export interface ColorSchemeMedia {
  readonly matches: boolean;
  addEventListener(type: "change", listener: (event: { readonly matches: boolean }) => void): void;
}

export type ColorSchemeStorage = Pick<Storage, "getItem" | "setItem">;

export interface ColorSchemeStoreOptions {
  readonly root: HTMLElement;
  readonly media: ColorSchemeMedia | null;
  readonly storage: ColorSchemeStorage | null;
}

/** The page's colour scheme, readable from React through `useSyncExternalStore`. */
export interface ColorSchemeStore {
  readonly getSnapshot: () => ColorScheme;
  readonly subscribe: (listener: () => void) => () => void;
  /** Stores the opposite of the current scheme and applies it; from then on the OS preference no longer applies. */
  readonly toggle: () => void;
}

/**
 * The Kleros UI components library defines its light and dark colour tokens on `:root` and `:root.dark`,
 * so the colour scheme is a `dark` class on the root element.
 */
export function applyColorScheme(root: HTMLElement, prefersDark: boolean): void {
  root.classList.toggle("dark", prefersDark);
}

function isColorScheme(value: unknown): value is ColorScheme {
  return value === "light" || value === "dark";
}

export function readStoredScheme(storage: ColorSchemeStorage | null): ColorScheme | null {
  if (storage === null) return null;
  try {
    const value = storage.getItem(STORAGE_KEY);
    return isColorScheme(value) ? value : null;
  } catch {
    return null;
  }
}

/** A storage that refuses the write (private mode, quota) leaves the choice in effect for this page only. */
export function writeStoredScheme(storage: ColorSchemeStorage | null, scheme: ColorScheme): void {
  if (storage === null) return;
  try {
    storage.setItem(STORAGE_KEY, scheme);
  } catch {
    // The scheme is still applied; it just will not survive a reload.
  }
}

export function resolveColorScheme(stored: ColorScheme | null, systemDark: boolean): ColorScheme {
  return stored ?? (systemDark ? "dark" : "light");
}

export function createColorSchemeStore({ root, media, storage }: ColorSchemeStoreOptions): ColorSchemeStore {
  const listeners = new Set<() => void>();
  // Kept in memory as well, so a choice made while storage refuses writes still silences the OS listener.
  let chosen = readStoredScheme(storage);
  let scheme = resolveColorScheme(chosen, media?.matches ?? false);

  function apply(next: ColorScheme): void {
    scheme = next;
    applyColorScheme(root, next === "dark");
    for (const listener of listeners) listener();
  }

  applyColorScheme(root, scheme === "dark");
  media?.addEventListener("change", (event) => {
    if (chosen === null) apply(event.matches ? "dark" : "light");
  });

  return {
    getSnapshot: () => scheme,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    toggle: () => {
      const next: ColorScheme = scheme === "dark" ? "light" : "dark";
      chosen = next;
      writeStoredScheme(storage, next);
      apply(next);
    },
  };
}

/** The window's `localStorage`, or `null` where the property getter itself throws (storage blocked for the site). */
export function browserLocalStorage(): ColorSchemeStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** The OS dark-mode query, or `null` where the browser has no `matchMedia`. */
export function browserColorSchemeMedia(): ColorSchemeMedia | null {
  try {
    return typeof window.matchMedia === "function" ? window.matchMedia(DARK_QUERY) : null;
  } catch {
    return null;
  }
}
