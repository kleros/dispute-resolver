import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryStorage } from "./test/data";
import { STORAGE_KEY, SWITCHING_ATTRIBUTE, browserLocalStorage, createColorSchemeStore, type ColorSchemeMedia, type ColorSchemeStorage } from "./theme";

/** A `(prefers-color-scheme: dark)` query whose answer the test changes, dispatching `change` like the browser does. */
function fakeMedia(matches: boolean) {
  const listeners = new Set<(event: { readonly matches: boolean }) => void>();
  const state = { matches };
  const media: ColorSchemeMedia & { change(next: boolean): void } = {
    get matches() {
      return state.matches;
    },
    addEventListener(_type: "change", listener: (event: { readonly matches: boolean }) => void) {
      listeners.add(listener);
    },
    change(next: boolean) {
      state.matches = next;
      for (const listener of listeners) listener({ matches: next });
    },
  };
  return media;
}

function throwingStorage(): ColorSchemeStorage {
  return {
    getItem: () => {
      throw new DOMException("blocked", "SecurityError");
    },
    setItem: () => {
      throw new DOMException("full", "QuotaExceededError");
    },
  };
}

function isDark(root: HTMLElement): boolean {
  return root.classList.contains("dark");
}

describe("createColorSchemeStore", () => {
  it("pauses transitions while a flip applies and lifts the pause on the next frame, but not for the first paint", async () => {
    const root = document.createElement("html");
    const media = fakeMedia(false);
    const store = createColorSchemeStore({ root, media, storage: createMemoryStorage({ [STORAGE_KEY]: "dark" }) });
    expect(isDark(root)).toBe(true);
    expect(root).not.toHaveAttribute(SWITCHING_ATTRIBUTE);

    store.toggle();
    expect(isDark(root)).toBe(false);
    expect(root).toHaveAttribute(SWITCHING_ATTRIBUTE);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(root).not.toHaveAttribute(SWITCHING_ATTRIBUTE);
  });

  it("pauses transitions for a flip that follows the OS preference too", async () => {
    const root = document.createElement("html");
    const media = fakeMedia(false);
    createColorSchemeStore({ root, media, storage: null });
    media.change(true);
    expect(isDark(root)).toBe(true);
    expect(root).toHaveAttribute(SWITCHING_ATTRIBUTE);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(root).not.toHaveAttribute(SWITCHING_ATTRIBUTE);
  });

  it("uses the OS preference until a choice is stored and follows OS changes meanwhile", () => {
    const root = document.createElement("div");
    const media = fakeMedia(true);
    const store = createColorSchemeStore({ root, media, storage: createMemoryStorage() });
    expect(isDark(root)).toBe(true);
    expect(store.getSnapshot()).toBe("dark");
    media.change(false);
    expect(isDark(root)).toBe(false);
    expect(store.getSnapshot()).toBe("light");
  });

  it("a stored choice wins over the OS preference and OS changes no longer apply", () => {
    const root = document.createElement("div");
    const media = fakeMedia(false);
    const store = createColorSchemeStore({ root, media, storage: createMemoryStorage({ [STORAGE_KEY]: "dark" }) });
    expect(isDark(root)).toBe(true);
    media.change(true);
    media.change(false);
    expect(isDark(root)).toBe(true);
    expect(store.getSnapshot()).toBe("dark");
  });

  it("toggling flips the class, stores the choice and notifies subscribers", () => {
    const root = document.createElement("div");
    const media = fakeMedia(false);
    const storage = createMemoryStorage();
    const store = createColorSchemeStore({ root, media, storage });
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.toggle();
    expect(isDark(root)).toBe(true);
    expect(store.getSnapshot()).toBe("dark");
    expect(storage.entries.get(STORAGE_KEY)).toBe("dark");
    expect(listener).toHaveBeenCalledTimes(1);
    media.change(true);
    media.change(false);
    expect(isDark(root)).toBe(true);
    unsubscribe();
    store.toggle();
    expect(isDark(root)).toBe(false);
    expect(storage.entries.get(STORAGE_KEY)).toBe("light");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("a storage whose methods throw is ignored and the toggle still works for the session", () => {
    const root = document.createElement("div");
    const store = createColorSchemeStore({ root, media: fakeMedia(true), storage: throwingStorage() });
    expect(isDark(root)).toBe(true);
    const listener = vi.fn();
    store.subscribe(listener);
    store.toggle();
    expect(isDark(root)).toBe(false);
    expect(store.getSnapshot()).toBe("light");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("an unknown stored value counts as no choice", () => {
    const root = document.createElement("div");
    const media = fakeMedia(true);
    createColorSchemeStore({ root, media, storage: createMemoryStorage({ [STORAGE_KEY]: "sepia" }) });
    expect(isDark(root)).toBe(true);
    media.change(false);
    expect(isDark(root)).toBe(false);
  });

  it("without a media query the page is light unless a choice is stored", () => {
    const light = document.createElement("div");
    createColorSchemeStore({ root: light, media: null, storage: null });
    expect(isDark(light)).toBe(false);
    const dark = document.createElement("div");
    createColorSchemeStore({ root: dark, media: null, storage: createMemoryStorage({ [STORAGE_KEY]: "dark" }) });
    expect(isDark(dark)).toBe(true);
  });
});

describe("browserLocalStorage", () => {
  const original = Object.getOwnPropertyDescriptor(window, "localStorage");

  afterEach(() => {
    if (original === undefined) Reflect.deleteProperty(window, "localStorage");
    else Object.defineProperty(window, "localStorage", original);
  });

  it("returns no storage instead of throwing when the browser blocks it", () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("blocked", "SecurityError");
      },
    });
    expect(browserLocalStorage()).toBeNull();
  });
});
