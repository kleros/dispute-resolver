import arbitrableWhitelist from "ethereum/arbitrableWhitelist";
import { getReadOnlyRpcUrl } from "ethereum/network-contract-mapping";

//RPCs to redirect followed by the chain ID from which to get the readonly RPC URL
const RPCS_TO_REDIRECT = {
  "https://mainnet.infura.io/v3/668b3268d5b241b5bab5c6cb886e4c61": "1",
};

//Build redirect map with actual RPC URLs
const redirectMap = {};
Object.entries(RPCS_TO_REDIRECT).forEach(([oldRpc, chainId]) => {
  const newRpc = getReadOnlyRpcUrl({ chainId });
  if (newRpc) redirectMap[oldRpc] = newRpc;
});

const rpcRedirectPatch = `
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

//How long a dynamic script gets to answer before the case page gives up on it.
export const DYNAMIC_SCRIPT_TIMEOUT_MS = 30_000;

const abortError = () => Object.assign(new Error("The dynamic script was cancelled."), { name: "AbortError" });

//128 random bits from the platform's CSPRNG, as hex. Browsers and jsdom both provide getRandomValues.
const randomRequestId = () => {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
};

/**
 * Runs a meta-evidence dynamic script in a sandboxed iframe and resolves with what its getMetaEvidence() returns.
 * Only a message posted by that iframe's own window, carrying this request's random id, is taken as the answer.
 * Rejects when the script throws or rejects, when it has not answered within the timeout, when the signal aborts, or
 * when the iframe cannot be created; in every case the iframe and the message listener are removed, so nothing lingers.
 * @param {string} scriptString The script source.
 * @param {object} scriptParameters Injected as `scriptParameters` in the script.
 * @param {{ signal?: AbortSignal, timeoutMs?: number }} [options]
 * @returns {Promise<unknown>}
 */
export async function fetchDataFromScript(scriptString, scriptParameters, { signal, timeoutMs = DYNAMIC_SCRIPT_TIMEOUT_MS } = {}) {
  const { default: iframe } = await import("iframe");
  if (signal?.aborted) throw abortError();

  const requestId = randomRequestId();

  const frameBody = `
    <script type='text/javascript'>
      ${rpcRedirectPatch}
      const scriptParameters = ${JSON.stringify(scriptParameters)}
      const scriptRequestId = ${JSON.stringify(requestId)}
      const answer = (message) => window.parent.postMessage({ target: 'script', id: scriptRequestId, ...message }, '*')
      const describe = (error) => (error && error.message) ? String(error.message) : String(error)
      let resolveScript
      let rejectScript
      const returnPromise = new Promise((resolve, reject) => {
        resolveScript = resolve
        rejectScript = reject
      })

      returnPromise.then(result => answer({ result }), error => answer({ error: describe(error) }))
      window.onerror = (message) => { answer({ error: String(message) }); return true }

      try {
        ${scriptString}
        getMetaEvidence()
      } catch (error) {
        rejectScript(error)
      }
    </script>`;

  return new Promise((resolve, reject) => {
    let frame = null;
    let timer = null;
    let settled = false;

    //Idempotent, and never throws: the iframe may already be gone, and removing it must not keep the promise pending.
    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      signal?.removeEventListener("abort", onAbort);
      try {
        frame?.remove();
      } catch (error) {
        console.warn("The dynamic script's iframe could not be removed:", error);
      }
      frame = null;
    };
    //The promise settles first; whatever cleanup does afterwards cannot leave it pending.
    const settle = (callback, value) => {
      if (settled) return;
      settled = true;
      callback(value);
      cleanup();
    };

    function onMessage(event) {
      const data = event.data;
      if (!frame?.iframe?.contentWindow || event.source !== frame.iframe.contentWindow) return;
      if (!data || data.target !== "script" || data.id !== requestId) return;
      if (Object.prototype.hasOwnProperty.call(data, "error")) settle(reject, new Error(`The dynamic script failed: ${data.error}`));
      else settle(resolve, data.result);
    }
    function onAbort() {
      settle(reject, abortError());
    }

    window.addEventListener("message", onMessage);
    signal?.addEventListener("abort", onAbort);
    timer = setTimeout(() => settle(reject, new Error(`The dynamic script did not answer within ${timeoutMs} ms.`)), timeoutMs);

    try {
      frame = iframe({
        body: frameBody,
        sandboxAttributes: [
          "allow-scripts",
          arbitrableWhitelist[scriptParameters.arbitrableChainID]?.includes(scriptParameters.arbitrableContractAddress.toLowerCase()) ? "allow-same-origin" : undefined,
        ],
      });
      if (!frame?.iframe) throw new Error("No iframe was created.");
      frame.iframe.style.display = "none";
    } catch (error) {
      settle(reject, new Error(`The dynamic script could not be started: ${error?.message ?? error}`));
    }
  });
}
