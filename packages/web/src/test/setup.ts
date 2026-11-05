import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Vitest's globals are off, so React Testing Library's automatic setup, which would do this, never runs. With the flag,
// React reports every state update that happens outside act().
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

// jsdom computes no pseudo-element style: asked for one, it logs "Not implemented" and returns the element's own style.
// The library's scrollbar asks on every mount, so the element's style is requested directly, which answers the same.
// Test files that run in Node have no window.
if (typeof window !== "undefined") {
  const elementStyle = window.getComputedStyle.bind(window);
  window.getComputedStyle = (element: Element) => elementStyle(element);
}

afterEach(() => {
  cleanup();
});
