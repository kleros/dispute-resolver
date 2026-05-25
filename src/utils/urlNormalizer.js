export const IPFS_GATEWAY = process.env.REACT_APP_IPFS_GATEWAY || "https://cdn.kleros.link";

export function getFormattedPath(url) {
  if (url.startsWith("/ipfs/") || url.startsWith("/ipns/")) return url;
  if (url.startsWith("ipfs/")) return `/${url}`;
  if (url.startsWith("ipfs://")) return url.replace("ipfs://", "/ipfs/");
  return `/ipfs/${url}`;
}

export function urlNormalize(url) {
  return `${IPFS_GATEWAY}${getFormattedPath(url)}`;
}
