import type { GoldenGateWindow, OldRunInput, OldRunOutput } from "./protocol";

// Test-harness replica of the OLD dynamic-script runner, for the C6 output-equivalence gate only (04 §5): today's
// `fetchDataFromScript` (src/utils/utils.js) and the `iframe` npm package 1.0.0 it calls, transcribed so the gate runs
// the production runner with its production flags. Never imported by packages/web/src and never shipped (C9). The
// frame text, the blob document without a charset, the sandbox value and the global `window.onmessage` channel are
// reproduced, because the differences they make (the windows-1252 fallback of an opaque frame, ADR 0004) are what the
// gate measures. Two mechanics differ where they cannot change what a script sees or returns, each explained below: how
// the frame element is inserted, and the handler's origin test. The 180 s timeout rejects today; here it settles as
// `{ status: "timeout" }`.

/** Today's `rpcRedirectPatch`, with the redirect map built from chain 1's read RPC (src/utils/utils.js). */
function rpcRedirectPatch(redirectMap: Readonly<Record<string, string>>): string {
  return `
  (function rpcRedirectPatch() {
    const redirectMap = ${JSON.stringify(redirectMap)};

    if (Object.keys(redirectMap).length === 0) return;

    // Patch XMLHttpRequest (web3 v1)
    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
      if (typeof url === "string" && redirectMap[url]) {
        console.warn("[iframe RPC redirect][XHR]", url, "→", redirectMap[url]);
        url = redirectMap[url];
      }
      return originalOpen.call(this, method, url, ...rest);
    };

    // Patch fetch (fallback)
    if (window.fetch) {
      const originalFetch = window.fetch;
      window.fetch = function(input, init) {
        if (typeof input === "string" && redirectMap[input]) {
          console.warn("[iframe RPC redirect][fetch]", input, "→", redirectMap[input]);
          input = redirectMap[input];
        } else if (input instanceof Request && redirectMap[input.url]) {
          console.warn("[iframe RPC redirect][fetch]", input.url, "→", redirectMap[input.url]);
          input = new Request(redirectMap[input.url], input);
        }
        return originalFetch.call(this, input, init);
      };
    }
  })();
`;
}

/** Today's frame body, verbatim (src/utils/utils.js `frameBody`). */
function frameBody(input: OldRunInput): string {
  return `
    <script type='text/javascript'>
      ${input.guardSource}
      ${rpcRedirectPatch(input.redirectMap)}
      const scriptParameters = ${JSON.stringify(input.scriptParameters)}
      let resolveScript
      let rejectScript
      const returnPromise = new Promise((resolve, reject) => {
        resolveScript = resolve
        rejectScript = reject
      })

      returnPromise.then(result => {window.parent.postMessage(
        {
          target: 'script',
          result,
          jsonDuplicateKeys: window.__klerosJsonDuplicateKeys === true
        },
        '*'
      )})

      ${input.scriptString}
      getMetaEvidence()
    </script>`;
}

/**
 * The `iframe` package 1.0.0 (`IFrame.prototype.setHTML`): the body wrapped in a document with an empty head and no
 * charset declaration, served from a `blob:` URL of type `text/html`, with the package's attributes and the `sandbox`
 * value as given (spec 9.5). The package serializes a detached element to its `outerHTML` and parses that string back
 * in at the end of `document.body`; the replica appends the detached element itself, which carries the same attributes
 * and lands at the same place, so the frame's document, origin, charset and sandbox are the package's.
 */
function createPackageIframe(body: string, sandbox: string): HTMLIFrameElement {
  const html = `<!DOCTYPE html><html><head></head><body>${body}</body></html>`;
  // The package passes `{ encoding: 'UTF-8', type: 'text/html' }`; `encoding` is not a Blob option and has no effect.
  const blob = new Blob([html], { type: "text/html" });
  const frame = document.createElement("iframe");
  frame.src = URL.createObjectURL(blob);
  frame.setAttribute("scrolling", "yes");
  frame.style.width = "100%";
  frame.style.height = "100%";
  frame.style.border = "0";
  frame.setAttribute("sandbox", sandbox);
  document.body.append(frame);
  return frame;
}

function isScriptMessage(data: unknown): data is { readonly target: "script"; readonly result: unknown; readonly jsonDuplicateKeys: unknown } {
  return typeof data === "object" && data !== null && (data as { readonly target?: unknown }).target === "script";
}

/**
 * The origin the frame posts from: the harness's own for a same-origin frame, `"null"` for an opaque one. Today's handler
 * checks no origin (spec 9.5 [W1]); in the harness page the frame is the only window that can post to it, so accepting
 * exactly the frame's origin admits every message production would have taken from that frame and nothing else.
 */
function frameOrigin(sandbox: string): string {
  return sandbox.split(" ").includes("allow-same-origin") ? window.location.origin : "null";
}

/** Today's `fetchDataFromScript(scriptString, scriptParameters)`, settled with its value or its timeout. */
function fetchDataFromScript(input: OldRunInput): Promise<OldRunOutput> {
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      resolve({ status: "timeout" });
    }, input.timeoutMs);

    // Today's channel: the global `window.onmessage`, reassigned by every run, taking the first tagged message.
    const expectedOrigin = frameOrigin(input.sandbox);
    window.onmessage = (message: MessageEvent<unknown>) => {
      if (message.origin === expectedOrigin && isScriptMessage(message.data)) {
        clearTimeout(timeoutId);
        resolve({ status: "result", result: message.data.result, jsonDuplicateKeys: message.data.jsonDuplicateKeys === true });
      }
    };

    const frame = createPackageIframe(frameBody(input), input.sandbox);
    frame.style.display = "none";
  });
}

(window as GoldenGateWindow).__goldenGateOldRunner = { run: fetchDataFromScript };
