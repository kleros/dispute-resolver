import { vi } from "vitest";

/** A `matchMedia` that matches nothing; jsdom has none and AppKit reads the color scheme through it. */
function matchNothing(query: string): MediaQueryList {
  return {
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => false),
  };
}

/** A WebSocket that fails at once, so the WalletConnect relay never connects. */
class OfflineWebSocket extends EventTarget {
  constructor() {
    super();
    throw new Error("Unit tests have no network (WebSocket).");
  }
}

/** jsdom has no ResizeObserver; AppKit's modal observes its own size once opened. */
class InertResizeObserver {
  observe(): void {
    // Nothing is laid out in jsdom.
  }
  unobserve(): void {
    // Nothing is observed.
  }
  disconnect(): void {
    // Nothing is observed.
  }
}

/**
 * The browser surface AppKit touches at creation and when its modal opens, with every network path failing fast: `fetch` rejects (remote
 * project configuration, usage, origin checks) and WebSocket throws. Undo with `vi.unstubAllGlobals()`.
 */
export function installOfflineAppKitEnvironment(): void {
  vi.stubGlobal("matchMedia", matchNothing);
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("Unit tests have no network (fetch)."))),
  );
  vi.stubGlobal("WebSocket", OfflineWebSocket);
  vi.stubGlobal("ResizeObserver", InertResizeObserver);
}
