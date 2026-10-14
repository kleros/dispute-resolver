/**
 * Characters no accepted URI may carry (B2): control characters (C0, DEL and C1, which URL parsers strip or reinterpret,
 * so `.\t.` would become `..`), backslashes (which WHATWG parsers read as `/` in http(s) URLs) and lone surrogates (which
 * cannot be percent-encoded).
 */
const FORBIDDEN_CHARACTER = /[\p{Cc}\p{Cs}\\]/u;

const QUERY_OR_FRAGMENT = /[?#]/;

export const IPFS_PATH_PREFIX = "/ipfs/";

export function hasForbiddenCharacter(value: string): boolean {
  return FORBIDDEN_CHARACTER.test(value);
}

/** The part of a URI reference before its query or fragment. */
export function withoutQueryOrFragment(value: string): string {
  const end = value.search(QUERY_OR_FRAGMENT);
  return end === -1 ? value : value.slice(0, end);
}

/** The value parsed as an absolute URL (WHATWG, no base), or `null` when it is relative or malformed. */
export function parseAbsoluteUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}
