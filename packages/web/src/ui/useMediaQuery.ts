import { useMemo, useSyncExternalStore } from "react";

/**
 * The library's `--breakpoint-lg`, which Tailwind emits as `@media (width >= 56.25rem)`. Both resolve against the root font
 * size, so the edge this query reports is the edge where the `lg:` classes switch.
 */
export const LG_MEDIA_QUERY = "(min-width: 56.25rem)";

/** Tailwind's default `--breakpoint-xl`, which the library keeps: the edge where the `xl:` classes switch. */
export const XL_MEDIA_QUERY = "(min-width: 80rem)";

interface MediaStore {
  readonly subscribe: (onChange: () => void) => () => void;
  readonly getSnapshot: () => boolean;
}

const NO_MEDIA: MediaStore = {
  subscribe: () => () => undefined,
  getSnapshot: () => false,
};

function mediaQueryList(query: string): MediaQueryList | null {
  try {
    return typeof window.matchMedia === "function" ? window.matchMedia(query) : null;
  } catch {
    return null;
  }
}

function mediaStore(query: string): MediaStore {
  const list = mediaQueryList(query);
  if (list === null) return NO_MEDIA;
  return {
    subscribe: (onChange) => {
      list.addEventListener("change", onChange);
      return () => {
        list.removeEventListener("change", onChange);
      };
    },
    getSnapshot: () => list.matches,
  };
}

/** Whether `query` matches, following its changes; false where the browser has no media queries. */
export function useMediaQuery(query: string): boolean {
  const store = useMemo(() => mediaStore(query), [query]);
  return useSyncExternalStore(store.subscribe, store.getSnapshot);
}
