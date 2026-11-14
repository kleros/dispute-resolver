/** Shorter pieces of a URL, such as `v2` or `rpc`, are words a message needs and identify nothing. */
const MIN_PIECE_LENGTH = 6;

/** The value of each `name=value` pair of a query, as written; a pair without `=` is all value. */
function queryValues(search: string): string[] {
  return search
    .slice(1)
    .split("&")
    .map((pair) => pair.slice(pair.indexOf("=") + 1));
}

/** A piece as the URL writes it and decoded, since an RPC can repeat either. */
function writtenAndDecoded(piece: string): string[] {
  try {
    return [piece, decodeURIComponent(piece)];
  } catch {
    return [piece];
  }
}

/**
 * The pieces of `url` an RPC can repeat without the URL, a key among them: its host, credentials, path segments and
 * query values, longest first so replacing them in turn never leaves the rest of a longer one behind. The whole URL when
 * it does not parse.
 */
export function urlPieces(url: string): string[] {
  const pieces = new Set<string>();
  if (URL.canParse(url)) {
    const { host, username, password, pathname, search } = new URL(url);
    pieces.add(host);
    for (const piece of [username, password, ...pathname.split("/"), ...queryValues(search)].flatMap(writtenAndDecoded)) pieces.add(piece);
  } else {
    pieces.add(url);
  }
  return [...pieces].filter((piece) => piece.length >= MIN_PIECE_LENGTH).sort((left, right) => right.length - left.length);
}
