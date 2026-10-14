import type { GoldenGateWindow, OldRunInput, OldRunOutput } from "./protocol";

// Test-harness replica of the OLD dynamic-script runner, for the C6 output-equivalence gate only (04 §5): today's
// `fetchDataFromScript` (src/utils/utils.js) and the `iframe` npm package 1.0.0 it calls, transcribed so the gate runs
// the production runner with its production flags. Never imported by packages/web/src and never shipped (C9). The
// frame text, the blob document without a charset, the sandbox value and the global `window.onmessage` channel are
// reproduced exactly, because the differences they make (the windows-1252 fallback of an opaque frame, ADR 0004) are
// what the gate measures. The 180 s timeout rejects today; here it settles as `{ status: "timeout" }`.

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
 * charset declaration, served from a `blob:` URL of type `text/html`, inserted by parsing the element's `outerHTML` at
 * the end of `document.body`, the last iframe of the container being the one returned.
 */
function createPackageIframe(body: string, sandbox: string): HTMLIFrameElement {
  const html = `<!DOCTYPE html><html><head></head><body>${body}</body></html>`;
  // The package passes `{ encoding: 'UTF-8', type: 'text/html' }`; `encoding` is not a Blob option and has no effect.
  const blob = new Blob([html], { type: "text/html" });
  const targetUrl = URL.createObjectURL(blob);
  const tempIframe = document.createElement("iframe");
  tempIframe.src = targetUrl;
  tempIframe.setAttribute("scrolling", "yes");
  tempIframe.style.width = "100%";
  tempIframe.style.height = "100%";
  tempIframe.style.border = "0";
  tempIframe.setAttribute("sandbox", sandbox);
  const htmlSrc = tempIframe.outerHTML;
  // eslint-disable-next-line no-restricted-syntax -- verbatim replica of iframe@1.0.0, test harness only (C9): the HTML is the element's own outerHTML.
  document.body.insertAdjacentHTML("beforeend", htmlSrc);
  const neighborIframes = document.body.querySelectorAll("iframe");
  const created = neighborIframes[neighborIframes.length - 1];
  if (created === undefined) throw new Error("The iframe package replica inserted no frame.");
  return created;
}

function isScriptMessage(data: unknown): data is { readonly target: "script"; readonly result: unknown; readonly jsonDuplicateKeys: unknown } {
  return typeof data === "object" && data !== null && (data as { readonly target?: unknown }).target === "script";
}

/** Today's `fetchDataFromScript(scriptString, scriptParameters)`, settled with its value or its timeout. */
function fetchDataFromScript(input: OldRunInput): Promise<OldRunOutput> {
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      resolve({ status: "timeout" });
    }, input.timeoutMs);

    // Today's global handler accepts a tagged message from any window and origin (spec 9.5 [W1]); the replica keeps it.
    // eslint-disable-next-line sonarjs/post-message -- verbatim replica of the old runner's channel, test harness only (C9).
    window.onmessage = (message: MessageEvent<unknown>) => {
      if (isScriptMessage(message.data)) {
        clearTimeout(timeoutId);
        resolve({ status: "result", result: message.data.result, jsonDuplicateKeys: message.data.jsonDuplicateKeys === true });
      }
    };

    const frame = createPackageIframe(frameBody(input), input.sandbox);
    frame.style.display = "none";
  });
}

(window as GoldenGateWindow).__goldenGateOldRunner = { run: fetchDataFromScript };
