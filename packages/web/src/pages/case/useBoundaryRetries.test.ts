import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { deferred } from "../../test/data";
import { useBoundaryRetries } from "./useBoundaryRetries";

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
});
