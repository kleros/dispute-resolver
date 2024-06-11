const IPFS_GATEWAY = "https://cdn.kleros.link";


export function urlNormalize(url) {
  if (url.startsWith('/')) {
    return `${IPFS_GATEWAY}${url}`;
  } else {
    return `${IPFS_GATEWAY}/${url}`;
  }
}