import { hasForbiddenCharacter, IPFS_PATH_PREFIX, withoutQueryOrFragment } from "./syntax";
import type { CanonicalIpfsPath, CidPath } from "./types";

/**
 * Today's accepted spellings (spec 9.1 step 2): an `ipfs:` or `fs:` scheme with any slashes, then an optional `/` and an
 * optional `ipfs/`. Applied in this order, they strip `ipfs://`, `fs:/ipfs/`, `/ipfs/`, `ipfs/` and a leading `/`.
 */
const SCHEME_PREFIX = /^(?:ipfs:|fs:)\/*/;
const PATH_PREFIX = /^\/?(?:ipfs\/)?/;

const CID_V0 = /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/;
const CID_V1_BASE32 = /^b[a-z2-7]{50,}$/;

/**
 * The one content-addressing rule of the codebase (A3, B2, B18, D-24). Returns `/ipfs/<CID>[/<segment>…]` or `null`.
 *
 * The input is trimmed and must carry no control character or backslash. One accepted prefix is stripped and the query
 * and fragment are dropped. Each segment is percent-decoded once (a malformed escape, a decoded `/`, backslash or
 * control character rejects), then `.` and `..` are resolved; a `..` that would remove the first segment rejects. The
 * first segment must then be a CIDv0 or a base32 CIDv1. Empty segments are removed and the others are stored
 * percent-encoded once, so the result is a fixed point and a gateway URL built from it cannot leave the CID.
 */
export function normalizeIpfsPath(input: unknown): CanonicalIpfsPath | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (hasForbiddenCharacter(trimmed)) return null;
  const path = withoutQueryOrFragment(trimmed.replace(SCHEME_PREFIX, "").replace(PATH_PREFIX, ""));
  const segments = decodeSegments(path.split("/"));
  const resolved = segments === null ? null : removeDotSegments(segments);
  if (resolved === null) return null;
  const [cid, ...rest] = resolved;
  if (cid === undefined || !isCid(cid)) return null;
  const tail = rest
    .filter((segment) => segment !== "")
    .map((segment) => `/${encodeURIComponent(segment)}`)
    .join("");
  return `/ipfs/${cid}${tail}`;
}

/** Whether a meta-evidence, evidence or dynamic-script URI may be fetched (A3). */
export function isContentAddressed(input: unknown): boolean {
  return normalizeIpfsPath(input) !== null;
}

/** The canonical path without its `/ipfs/` prefix: the form of dynamic-script allowlist entries (06 §3 invariant 4). */
export function toCidPath(path: CanonicalIpfsPath): CidPath {
  // A canonical path comes only from `normalizeIpfsPath`, which checked that the segment after `/ipfs/` is a CID.
  return path.slice(IPFS_PATH_PREFIX.length) as CidPath;
}

function isCid(segment: string): boolean {
  return CID_V0.test(segment) || CID_V1_BASE32.test(segment);
}

function decodeSegments(segments: readonly string[]): string[] | null {
  const decoded: string[] = [];
  for (const segment of segments) {
    const value = decodeSegment(segment);
    if (value === null) return null;
    decoded.push(value);
  }
  return decoded;
}

function decodeSegment(segment: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    return null;
  }
  return decoded.includes("/") || hasForbiddenCharacter(decoded) ? null : decoded;
}

/** RFC 3986 §5.2.4 over decoded segments, except that removing the first segment (the CID's place) rejects the path. */
function removeDotSegments(segments: readonly string[]): string[] | null {
  const output: string[] = [];
  for (const segment of segments) {
    if (segment === "..") {
      if (output.length < 2) return null;
      output.pop();
    } else if (segment !== ".") {
      output.push(segment);
    }
  }
  return output;
}
