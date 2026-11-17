import { vi } from "vitest";

/** A `matchMedia` that matches only `matching`; jsdom has none. */
export function matchOnly(matching: readonly string[]): (query: string) => MediaQueryList {
  return (query) => ({
    matches: matching.includes(query),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => false),
  });
}
