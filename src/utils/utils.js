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

export async function fetchDataFromScript(scriptString, scriptParameters) {
  const { default: iframe } = await import("iframe");

  let resolver;
  const returnPromise = new Promise((resolve) => {
    resolver = resolve;
  });

  window.onmessage = (message) => {
    if (message.data.target === "script") {
      resolver(message.data.result);
    }
  };

  const frameBody = `
    <script type='text/javascript'>
      ${rpcRedirectPatch}
      const scriptParameters = ${JSON.stringify(scriptParameters)}
      let resolveScript
      let rejectScript
      const returnPromise = new Promise((resolve, reject) => {
        resolveScript = resolve
        rejectScript = reject
      })

      returnPromise.then(result => {window.parent.postMessage(
        {
          target: 'script',
          result
        },
        '*'
      )})

      ${scriptString}
      getMetaEvidence()
    </script>`;

  const _ = iframe({
    body: frameBody,
    sandboxAttributes: [
      "allow-scripts",
      arbitrableWhitelist[scriptParameters.arbitrableChainID]?.includes(
        scriptParameters.arbitrableContractAddress.toLowerCase()
      )
        ? "allow-same-origin"
        : undefined,
    ],
  });

  _.iframe.style.display = "none";
  return returnPromise;
}
