import arbitrableWhitelist from "ethereum/arbitrableWhitelist";

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

    const frameBody = `<script type='text/javascript'>
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
};