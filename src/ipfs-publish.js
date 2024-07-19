const ipfsPublish = async (fileName, data) => {
  const payload = new FormData();
  payload.append("file", new Blob([data]), fileName);
  const klerosIPFSNetlifyFunctionEndpoint = `https://kleros-api.netlify.app/.netlify/functions/upload-to-ipfs`
  const operation = 'file'
  const pinToGraph = 'false'

  console.log("Uploading to IPFS");
  return new Promise((resolve, reject) => {
    fetch(`${klerosIPFSNetlifyFunctionEndpoint}?operation=${operation}&pinToGraph=${pinToGraph}`, {
      method: 'POST',
      body: payload

    })
      .then(response => response.json())
      .then(data => resolve(data.cids[0]))
      .catch(err => reject(err))
  })
}

export default ipfsPublish