import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Vitest's globals are off, so React Testing Library's automatic setup, which would do this, never runs. With the flag,
// React reports every state update that happens outside act().
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

afterEach(() => {
  cleanup();
});
