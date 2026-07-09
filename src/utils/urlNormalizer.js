export const IPFS_GATEWAY = process.env.REACT_APP_IPFS_GATEWAY || "https://cdn.kleros.link";

export function getFormattedPath(url) {
  if (!url) return "";
  if (url.startsWith("/ipfs/") || url.startsWith("/ipns/")) return url;
  if (url.startsWith("ipfs/")) return `/${url}`;
  if (url.startsWith("ipfs://")) return url.replace("ipfs://", "/ipfs/");
  return `/ipfs/${url}`;
}

export function urlNormalize(url) {
  if (!url) return "";
  const trimmed = url.trim();
  //Absolute http(s) URLs are returned unchanged.
  if (/^https?:\/\//.test(trimmed)) return trimmed;
  return `${IPFS_GATEWAY}${getFormattedPath(trimmed)}`;
}

//CID shape check for CIDv0 and CIDv1 in base32 (the standard's default encoding).
const CID_REGEX = /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{50,})([/?#]|$)/;

//Strips the common IPFS URI prefixes, leaving only the CID or CID/path.
const toIpfsPath = (uri) =>
  uri
    .trim()
    .replace(/^(?:ipfs:|fs:)\/*/, "")
    .replace(/^\/?(?:ipfs\/)?/, "");

//Evidence type URIs must be content-addressed.
export function isContentAddressed(url) {
  return typeof url === "string" && CID_REGEX.test(toIpfsPath(url));
}
