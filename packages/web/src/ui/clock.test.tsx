import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChainClockProvider, useChainNow, useNowSeconds } from "./clock";

const NOW_SECONDS = 1_700_000_000;

afterEach(() => {
  vi.useRealTimers();
});

function chainClock(offsetMs: number) {
  return function ChainClock({ children }: { readonly children?: ReactNode }) {
    return <ChainClockProvider offsetMs={offsetMs}>{children}</ChainClockProvider>;
  };
}

describe("useChainNow", () => {
  it("reads the chain's current time when it is called, not at the shared clock's last tick", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW_SECONDS * 1000);
    const { result } = renderHook(() => ({ chainNow: useChainNow(), ticked: useNowSeconds() }), { wrapper: chainClock(-90_000) });
    expect(result.current.chainNow()).toBe(NOW_SECONDS - 90);
    vi.setSystemTime((NOW_SECONDS + 20) * 1000);
    expect(result.current.ticked).toBe(NOW_SECONDS - 90);
    expect(result.current.chainNow()).toBe(NOW_SECONDS - 70);
  });

  it("is the browser's time outside a chain clock", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW_SECONDS * 1000 + 999);
    const { result } = renderHook(() => useChainNow());
    expect(result.current()).toBe(NOW_SECONDS);
  });
});
