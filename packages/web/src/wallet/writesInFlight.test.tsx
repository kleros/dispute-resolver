import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TEST_MINED } from "../test/wallet";
import type { WriteOutcome } from "./types";
import { useWritesInFlight, WritesInFlightProvider } from "./writesInFlight";

function heldWrite(): { readonly write: Promise<WriteOutcome>; readonly settle: (outcome: WriteOutcome) => void } {
  let settle: (outcome: WriteOutcome) => void = () => undefined;
  const write = new Promise<WriteOutcome>((resolve) => {
    settle = resolve;
  });
  return { write, settle };
}

describe("useWritesInFlight", () => {
  it("finds a write under its key until it settles, and never under another key", async () => {
    const { result } = renderHook(() => useWritesInFlight(), { wrapper: WritesInFlightProvider });
    const { write, settle } = heldWrite();
    result.current.hold("create:1", write);
    expect(result.current.find("create:1")).toBe(write);
    expect(result.current.find("create:100")).toBeUndefined();
    expect(result.current.has("create:1")).toBe(true);
    expect(result.current.has("create:100")).toBe(false);

    await act(async () => {
      settle({ phase: "rejected" });
      await write;
    });
    expect(result.current.find("create:1")).toBeUndefined();
    expect(result.current.has("create:1")).toBe(false);
  });

  it("keeps a newer write when an older one under the same key settles", async () => {
    const { result } = renderHook(() => useWritesInFlight(), { wrapper: WritesInFlightProvider });
    const older = heldWrite();
    const newer = heldWrite();
    result.current.hold("create:1", older.write);
    result.current.hold("create:1", newer.write);
    await act(async () => {
      older.settle(TEST_MINED as WriteOutcome);
      await older.write;
    });
    expect(result.current.find("create:1")).toBe(newer.write);
  });

  it("holds nothing without its provider", () => {
    const { result } = renderHook(() => useWritesInFlight());
    result.current.hold("create:1", heldWrite().write);
    expect(result.current.find("create:1")).toBeUndefined();
    expect(result.current.has("create:1")).toBe(false);
  });
});
