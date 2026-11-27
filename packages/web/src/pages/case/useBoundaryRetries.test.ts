import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { deferred } from "../../test/data";
import { setterCalls } from "../../test/stateSetters";
import { useBoundaryRetries } from "./useBoundaryRetries";

vi.mock("react", async (importOriginal) => {
  const { countingSetters } = await import("../../test/stateSetters");
  return countingSetters(await importOriginal());
});

type Held = ReturnType<typeof deferred<undefined>>;

const SETTLE = [
  [
    "resolves",
    (read: Held) => {
      read.resolve(undefined);
    },
  ],
  [
    "rejects",
    (read: Held) => {
      read.reject(new Error("socket hang up"));
    },
  ],
] as const;

describe("useBoundaryRetries", () => {
  afterEach(() => {
    setterCalls.watching = false;
    setterCalls.count = 0;
  });

  it.each(SETTLE)("keeps the boundary key while the re-read is pending and changes it once the re-read %s", async (_name, settle) => {
    const { result } = renderHook(() => useBoundaryRetries());
    const before = result.current.key("summary");
    const read = deferred<undefined>();

    let retried: Promise<void> | undefined;
    act(() => {
      retried = result.current.retry("summary", () => read.promise);
    });
    expect(result.current.key("summary")).toBe(before);

    await act(async () => {
      settle(read);
      await retried;
    });
    expect(result.current.key("summary")).not.toBe(before);
    expect(result.current.key("decision")).toBe("decision:0");
  });

  it.each(SETTLE)("unmounted while the re-read is pending, updates no state when the re-read later %s", async (_name, settle) => {
    const { result, unmount } = renderHook(() => useBoundaryRetries());
    const read = deferred<undefined>();
    let retried: Promise<void> | undefined;
    act(() => {
      retried = result.current.retry("summary", () => read.promise);
    });

    unmount();
    setterCalls.watching = true;
    await act(async () => {
      settle(read);
      await retried;
    });

    expect(setterCalls.count).toBe(0);
  });
});
