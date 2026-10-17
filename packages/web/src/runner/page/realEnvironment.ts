import type { RunnerEnvironment, XhrOpen } from "../types";
import { evaluateInGlobalScope, runScriptInGlobalScope } from "./evaluate";

/** The runner page's actual window, as `bootstrapRunner` sees it (ARCHITECTURE.md §7.2). */
export function realEnvironment(): RunnerEnvironment {
  return {
    selfOrigin: self.origin,
    isTopLevel: window.top === window || window.parent === window,
    parent: window.parent,
    locationOrigin: location.origin,
    addMessageListener(listener) {
      // Only messages from the runner URL's own origin are passed on; bootstrapRunner checks the origin again,
      // together with the source window and the port (C4).
      const onMessage = (event: MessageEvent): void => {
        if (event.origin === location.origin) listener(event);
      };
      window.addEventListener("message", onMessage);
      return () => {
        window.removeEventListener("message", onMessage);
      };
    },
    globals: globalThis,
    evaluate: evaluateInGlobalScope,
    runScript: runScriptInGlobalScope,
    network: {
      wrapFetch(wrap) {
        window.fetch = wrap(window.fetch.bind(window));
      },
      wrapXhrOpen(wrap) {
        // Seen through XhrOpen, the native open declares `this: XMLHttpRequest`, so the type itself makes every caller of
        // the captured original supply the request (rpcRedirect.ts calls it with .call(this)).
        const prototype: { open: XhrOpen } = XMLHttpRequest.prototype;
        prototype.open = wrap(prototype.open);
      },
    },
  };
}
