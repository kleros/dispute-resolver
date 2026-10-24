import { fireEvent, render, renderHook, screen } from "@testing-library/react";
import { createElement, Fragment } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { readMotionMs, useAfterLoading, usePresence, useRevealIn } from "./motion";

function Harness() {
  const presence = usePresence<HTMLDivElement>();
  const isOpen = presence.phase === "open";
  return createElement(
    Fragment,
    null,
    createElement("button", { type: "button", onClick: isOpen ? presence.close : presence.open }, "Toggle"),
    createElement("output", null, presence.phase),
    presence.phase === "closed"
      ? null
      : createElement("div", { key: presence.mountKey, ref: presence.panelRef, "data-testid": "panel" }, createElement("span", { "data-testid": "child" })),
  );
}

function toggle() {
  fireEvent.click(screen.getByRole("button", { name: "Toggle" }));
}

function phase() {
  return screen.getByRole("status").textContent;
}

describe("usePresence", () => {
  afterEach(() => {
    Reflect.deleteProperty(HTMLElement.prototype, "getAnimations");
  });

  it("keeps a closing panel mounted and inert until its own animation ends", () => {
    render(createElement(Harness));
    expect(screen.queryByTestId("panel")).toBeNull();
    toggle();
    expect(phase()).toBe("open");
    expect(screen.getByTestId("panel")).not.toHaveAttribute("inert");
    toggle();
    expect(phase()).toBe("closing");
    expect(screen.getByTestId("panel")).toHaveAttribute("inert");
    fireEvent.animationEnd(screen.getByTestId("panel"));
    expect(phase()).toBe("closed");
    expect(screen.queryByTestId("panel")).toBeNull();
  });

  it("ignores an animation that ends on an element inside the panel", () => {
    render(createElement(Harness));
    toggle();
    toggle();
    fireEvent.animationEnd(screen.getByTestId("child"));
    expect(phase()).toBe("closing");
  });

  it("reopening during the close mounts a fresh panel that takes input again", () => {
    render(createElement(Harness));
    toggle();
    toggle();
    const closingPanel = screen.getByTestId("panel");
    toggle();
    expect(phase()).toBe("open");
    const reopened = screen.getByTestId("panel");
    expect(reopened).not.toBe(closingPanel);
    expect(reopened).not.toHaveAttribute("inert");
  });

  it("closes at once when the panel has no animation running", () => {
    Object.defineProperty(HTMLElement.prototype, "getAnimations", { configurable: true, value: () => [] });
    render(createElement(Harness));
    toggle();
    toggle();
    expect(phase()).toBe("closed");
    expect(screen.queryByTestId("panel")).toBeNull();
  });
});

describe("useAfterLoading", () => {
  it("stays false for content that is ready on the first render", () => {
    const { result, rerender } = renderHook(({ loading }) => useAfterLoading(loading), { initialProps: { loading: false } });
    expect(result.current).toBe(false);
    rerender({ loading: false });
    expect(result.current).toBe(false);
  });

  it("turns true once the loading this mount rendered has ended", () => {
    const { result, rerender } = renderHook(({ loading }) => useAfterLoading(loading), { initialProps: { loading: true } });
    expect(result.current).toBe(false);
    rerender({ loading: false });
    expect(result.current).toBe(true);
  });

  it("turns true when loading starts after the first render and then ends", () => {
    const { result, rerender } = renderHook(({ loading }) => useAfterLoading(loading), { initialProps: { loading: false } });
    rerender({ loading: true });
    expect(result.current).toBe(false);
    rerender({ loading: false });
    expect(result.current).toBe(true);
  });
});

describe("useRevealIn", () => {
  it("gives no reveal class to content that is ready on the first render", () => {
    const { result, rerender } = renderHook(({ loading }) => useRevealIn(loading), { initialProps: { loading: false } });
    expect(result.current).toBeUndefined();
    rerender({ loading: false });
    expect(result.current).toBeUndefined();
  });

  it("gives no reveal class while the placeholder is showing", () => {
    const { result } = renderHook(({ loading }) => useRevealIn(loading), { initialProps: { loading: true } });
    expect(result.current).toBeUndefined();
  });

  it("gives the reveal-in animation, off under reduced motion, to content that replaces its placeholder", () => {
    const { result, rerender } = renderHook(({ loading }) => useRevealIn(loading), { initialProps: { loading: true } });
    rerender({ loading: false });
    expect(result.current?.split(" ")).toEqual(["animate-[t-reveal-in_var(--reveal-dur)_var(--reveal-ease)_backwards]", "motion-reduce:animate-none"]);
  });
});

describe("readMotionMs", () => {
  afterEach(() => {
    document.documentElement.style.removeProperty("--test-dur");
  });

  it("reads a duration in milliseconds", () => {
    document.documentElement.style.setProperty("--test-dur", "250ms");
    expect(readMotionMs("--test-dur", 1)).toBe(250);
  });

  it("reads the minified seconds form the build writes", () => {
    document.documentElement.style.setProperty("--test-dur", ".25s");
    expect(readMotionMs("--test-dur", 1)).toBe(250);
  });

  it("falls back when the variable is unset", () => {
    expect(readMotionMs("--test-dur", 150)).toBe(150);
  });
});
