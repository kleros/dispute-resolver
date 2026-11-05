import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LG_MEDIA_QUERY, useMediaQuery } from "./useMediaQuery";

type ChangeListener = (type: string, listener: () => void) => void;

function stubMatchMedia(matches: boolean) {
  let current = matches;
  const addEventListener = vi.fn<ChangeListener>();
  const removeEventListener = vi.fn<ChangeListener>();
  const list: MediaQueryList = {
    get matches() {
      return current;
    },
    media: LG_MEDIA_QUERY,
    onchange: null,
    addEventListener,
    removeEventListener,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => false),
  };
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => list),
  );
  return {
    addEventListener,
    removeEventListener,
    flip(next: boolean): void {
      current = next;
      for (const [type, listener] of addEventListener.mock.calls) {
        if (type === "change") listener();
      }
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useMediaQuery", () => {
  it("updates when the media query changes", () => {
    const media = stubMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery(LG_MEDIA_QUERY));
    expect(result.current).toBe(false);
    act(() => {
      media.flip(true);
    });
    expect(result.current).toBe(true);
    act(() => {
      media.flip(false);
    });
    expect(result.current).toBe(false);
  });

  it.each([
    { name: "the browser has no matchMedia", matchMedia: undefined },
    {
      name: "matchMedia throws",
      matchMedia: () => {
        throw new Error("Media queries are blocked.");
      },
    },
  ])("returns false where $name", ({ matchMedia }) => {
    vi.stubGlobal("matchMedia", matchMedia);
    expect(renderHook(() => useMediaQuery(LG_MEDIA_QUERY)).result.current).toBe(false);
  });

  it("unsubscribes on unmount", () => {
    const media = stubMatchMedia(true);
    const { unmount } = renderHook(() => useMediaQuery(LG_MEDIA_QUERY));
    const subscribed = media.addEventListener.mock.calls.map(([type, listener]) => [type, listener]);
    expect(subscribed).toHaveLength(1);
    unmount();
    expect(media.removeEventListener.mock.calls).toEqual(subscribed);
    expect(subscribed[0]?.[0]).toBe("change");
  });
});
