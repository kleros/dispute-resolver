/**
 * Characters no accepted URI may carry: C0 controls and DEL (WHATWG parsers strip tab, LF and CR, which changes the
 * path that was checked), backslashes (which WHATWG parsers read as `/` in http(s) URLs) and lone surrogates (which
 * cannot be percent-encoded). C1 controls are allowed: both WHATWG parsers and `encodeURIComponent` percent-encode
 * them, and real file names carry them.
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
  for (const character of value) {
    const code = character.codePointAt(0);
    if (code === undefined || code <= LAST_C0_CONTROL || code === DELETE) return true;
  }
  return false;
}

export function withoutQueryOrFragment(value: string): string {
  const end = value.search(QUERY_OR_FRAGMENT);
  return end === -1 ? value : value.slice(0, end);
}

export function parseAbsoluteUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}
