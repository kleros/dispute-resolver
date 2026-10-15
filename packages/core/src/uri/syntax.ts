/**
 * Characters no accepted URI may carry (B2): C0 controls and DEL (WHATWG parsers strip tab, LF and CR, so `.\t.` would
 * become `..`), backslashes (which WHATWG parsers read as `/` in http(s) URLs) and lone surrogates (which cannot be
 * percent-encoded). C1 controls are allowed: both WHATWG parsers and `encodeURIComponent` percent-encode them, and real
 * file names carry them (spec 5.14, mainnet 1657 evidence 3).
 */
const LONE_SURROGATE_OR_BACKSLASH = /[\p{Cs}\\]/u;
const LAST_C0_CONTROL = 0x1f;
const DELETE = 0x7f;

const QUERY_OR_FRAGMENT = /[?#]/;

export const IPFS_PATH_PREFIX = "/ipfs/";

export function hasForbiddenCharacter(value: string): boolean {
  return LONE_SURROGATE_OR_BACKSLASH.test(value) || hasC0ControlOrDelete(value);
}

function hasC0ControlOrDelete(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= LAST_C0_CONTROL || code === DELETE) return true;
  }
  return false;
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
