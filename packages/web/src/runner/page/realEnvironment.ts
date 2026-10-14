import type { RunnerEnvironment } from "../types";
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
        // eslint-disable-next-line @typescript-eslint/unbound-method -- the wrapper only ever calls it with .call(this) on the request (rpcRedirect.ts).
        XMLHttpRequest.prototype.open = wrap(XMLHttpRequest.prototype.open);
      },
    },
  };
}
