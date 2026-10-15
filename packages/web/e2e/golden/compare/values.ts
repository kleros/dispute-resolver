// The value rules of 04 §1 "Comparison rules": addresses case-insensitively, amounts as wei integers, markdown as plain
// text with all whitespace removed, wall-clock time fields on presence and sign only.

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
/**
 * A shortened address, the first six and last four characters: production's evidence sender line writes `0x1234...abcd`,
 * the new app's header `0x1234…abcd`.
 */
const TRUNCATED_ADDRESS = /^(0x[0-9a-fA-F]{4})(?:\.\.\.|…)([0-9a-fA-F]{4})$/;

/** Two addresses are equal ignoring case; a shortened `0x1234...abcd` equals any full address with that prefix and suffix. */
export function sameAddress(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  if (ADDRESS.test(a) && ADDRESS.test(b)) return a.toLowerCase() === b.toLowerCase();
  const truncated = TRUNCATED_ADDRESS.exec(a) ?? TRUNCATED_ADDRESS.exec(b);
  const full = ADDRESS.test(a) ? a : b;
  if (truncated === null || !ADDRESS.test(full)) return a.toLowerCase() === b.toLowerCase();
  const lower = full.toLowerCase();
  return lower.startsWith((truncated[1] ?? "").toLowerCase()) && lower.endsWith((truncated[2] ?? "").toLowerCase());
}

/** Plain text compared with every whitespace character removed (04 §1, ARCHITECTURE.md §12.1 `descriptionText`). */
export function withoutWhitespace(text: string | null): string | null {
  return text === null ? null : text.replace(/\s+/g, "");
}

/** Two wei amounts are equal as integers; `null` equals only `null`. */
export function sameWei(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  try {
    return BigInt(a) === BigInt(b);
  } catch {
    return a === b;
  }
}

/** `a >= b` as wei integers; `false` when either is missing or not an integer. */
export function weiAtLeast(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return false;
  try {
    return BigInt(a) >= BigInt(b);
  } catch {
    return false;
  }
}

export type TimeSign = "absent" | "future" | "past";

/** A wall-clock time field reduced to presence and sign, relative to when its snapshot was taken. */
export function timeSign(value: number | null, takenAt: number): TimeSign {
  if (value === null) return "absent";
  return value > takenAt ? "future" : "past";
}

/** A ruling code as a lowercase hexadecimal string, or the lowercase text when it is not a number. */
export function normalizedCode(code: string): string {
  try {
    return `0x${BigInt(code).toString(16)}`;
  } catch {
    return code.toLowerCase();
  }
}

/**
 * Two reserved ruling codes are equal as numbers; production prints codes longer than twelve characters as
 * `0xFFFF...FFFFFF` (first six, last six), which equals any code with that prefix and suffix.
 */
export function sameReservedCode(production: string, next: string): boolean {
  const match = /^(.{6})\.\.\.(.{6})$/.exec(production);
  if (match === null) return normalizedCode(production) === normalizedCode(next);
  const lower = next.toLowerCase();
  return lower.startsWith((match[1] ?? "").toLowerCase()) && lower.endsWith((match[2] ?? "").toLowerCase());
}

/** The `/ipfs/<CID>/…` path of a gateway URL, or `null` when the URL is not one (D-26). */
export function ipfsPath(url: string | null): string | null {
  if (url === null) return null;
  try {
    const { pathname } = new URL(url);
    return /^\/ipfs\/[A-Za-z0-9]+(?:\/|$)/.test(pathname) ? pathname : null;
  } catch {
    return null;
  }
}

function decodedUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${decodeURIComponent(parsed.pathname)}${decodeURIComponent(parsed.search)}${parsed.hash}`;
  } catch {
    return url;
  }
}

/** Two URLs are equal once percent-encoding is undone: production writes `a b.pdf` where the new app writes `a%20b.pdf`. */
export function sameUrl(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  return decodedUrl(a) === decodedUrl(b);
}

/** Rendered text: whitespace runs collapsed and trimmed, since leading and trailing spaces are invisible. */
export function renderedText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Deep equality of JSON-like values. */
export function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
