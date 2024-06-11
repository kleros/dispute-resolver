/**
 * Send file to IPFS network via the Kleros IPFS node
 * @param {string} fileName - The name that will be used to store the file. This is useful to preserve extension type.
 * @param {ArrayBuffer} data - The raw data from the file to upload.
 * @return {object} ipfs response. Should include the hash and path of the stored item.
 */
const ipfsPublish = async (fileName, data) => {
  const klerosIPFSNetlifyFunctionEndpoint = `https://kleros-api.netlify.app/.netlify/functions/upload-to-ipfs`
  console.log("Uploading to IPFS");
  return new Promise((resolve, reject) => {
    fetch(`${klerosIPFSNetlifyFunctionEndpoint}?operation=file&pinToGraph=true`, {
      method: 'POST',
      headers: {
        'Content-Type': 'multipart/form-data; boundary=<calculated when request is sent>',
      },
      body: new FormData().append('file', new Blob([data]), fileName),

    })
      .then(response => response.json())
      .then(data => resolve(data.cids[0]))
      .catch(err => reject(err))
  })
}

export default ipfsPublish
