import arbitrableWhitelist from "ethereum/arbitrableWhitelist";
import { getReadOnlyRpcUrl } from "ethereum/network-contract-mapping";
import { JSON_DUPLICATE_KEY_GUARD } from "ethereum/json-duplicate-key-guard";

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

//Dynamic scripts of Reality.eth arbitrables render the question with reality-eth-lib, which substitutes the question
//parameters into the template without escaping them and then parses the result with JSON.parse: crafted parameters
//can then override keys of the template (e.g. the question type or outcomes) through duplicate keys.
export const isRealityScript = (scriptString) =>
  typeof scriptString === "string" && scriptString.includes("populatedJSONForTemplate");

//A script that errors inside its iframe never posts a result, which would leave the promise hanging forever.
const DYNAMIC_SCRIPT_TIMEOUT_MS = 180000;

//Resolves to { result, jsonDuplicateKeys }: the script's output and whether its question JSON had duplicate keys.
export async function fetchDataFromScript(scriptString, scriptParameters) {
  const { default: iframe } = await import("iframe");

  let resolver;
  let rejecter;
  const returnPromise = new Promise((resolve, reject) => {
    resolver = resolve;
    rejecter = reject;
  });

  const timeoutId = setTimeout(() => {
    rejecter(new Error(`The dynamic script for dispute ${scriptParameters.disputeID} timed out.`));
  }, DYNAMIC_SCRIPT_TIMEOUT_MS);

  window.onmessage = (message) => {
    if (message.data.target === "script") {
      clearTimeout(timeoutId);
      resolver({ result: message.data.result, jsonDuplicateKeys: message.data.jsonDuplicateKeys === true });
    }
  };

  const frameBody = `
    <script type='text/javascript'>
      ${isRealityScript(scriptString) ? JSON_DUPLICATE_KEY_GUARD : ""}
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
          result,
          jsonDuplicateKeys: window.__klerosJsonDuplicateKeys === true
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
