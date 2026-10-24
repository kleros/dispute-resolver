import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LG_MEDIA_QUERY, useMediaQuery } from "./useMediaQuery";

type ChangeListener = (type: string, listener: () => void) => void;

/** A `matchMedia` whose single list starts at `matches` and can be flipped; its listeners are spies. */
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
  it("reports whether the query matches", () => {
    stubMatchMedia(true);
    expect(renderHook(() => useMediaQuery(LG_MEDIA_QUERY)).result.current).toBe(true);
    vi.unstubAllGlobals();
    stubMatchMedia(false);
    expect(renderHook(() => useMediaQuery(LG_MEDIA_QUERY)).result.current).toBe(false);
  });

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

  it("returns false where the browser has no matchMedia", () => {
    vi.stubGlobal("matchMedia", undefined);
    expect(renderHook(() => useMediaQuery(LG_MEDIA_QUERY)).result.current).toBe(false);
  });

  it("returns false when matchMedia throws", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => {
        throw new Error("Media queries are blocked.");
      }),
    );
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

  it("keeps one subscription across re-renders", () => {
    const media = stubMatchMedia(true);
    const { rerender } = renderHook(({ query }) => useMediaQuery(query), { initialProps: { query: LG_MEDIA_QUERY } });
    rerender({ query: LG_MEDIA_QUERY });
    rerender({ query: LG_MEDIA_QUERY });
    rerender({ query: LG_MEDIA_QUERY });
    expect(media.addEventListener).toHaveBeenCalledTimes(1);
    expect(media.removeEventListener).not.toHaveBeenCalled();
  });
});
