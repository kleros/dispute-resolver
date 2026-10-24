import { z } from "@dispute-resolver/core";

/**
 * Where `@kleros/kleros-app` 3.1.0 keeps the Atlas session token: its `useSessionStorage("authToken")` stores the token
 * string JSON-encoded under this sessionStorage key. This is a coupling to the library's internals, pinned by a
 * version-named test.
 */
export const LIBRARY_TOKEN_KEY = "authToken";

/** The claims the wrapper relies on. A token without a numeric `exp` fails here and counts as signed out. */
const claimsSchema = z.object({ exp: z.number(), sub: z.string() });

/** The tab's sessionStorage, or `null` where the browser refuses access to it. */
export function browserSessionStorage(): Pick<Storage, "getItem" | "removeItem"> | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** The token the library stored, or `null` when there is none or it is not a JSON-encoded string. */
export function readStoredToken(storage: Pick<Storage, "getItem"> | null): string | null {
  if (storage === null) return null;
  let raw: string | null;
  try {
    raw = storage.getItem(LIBRARY_TOKEN_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    return null;
  }
  return typeof decoded === "string" ? decoded : null;
}

/**
 * Removes the library's stored token when it is still `rejected`, so a reload does not revive a session Atlas refused.
 * A token stored since, by a newer sign-in, is kept.
 */
export function clearRejectedToken(storage: Pick<Storage, "getItem" | "removeItem"> | null, rejected: string): void {
  if (storage === null || readStoredToken(storage) !== rejected) return;
  try {
    storage.removeItem(LIBRARY_TOKEN_KEY);
  } catch {
    // Storage the browser refuses to write holds nothing a reload could revive.
  }
}

function decodeBase64Url(segment: string): string | null {
  if (!/^[\w-]*$/.test(segment)) return null;
  const base64 = segment
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(segment.length / 4) * 4, "=");
  try {
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (char) => char.codePointAt(0) ?? 0);
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** The token's `exp` claim in Unix seconds; `null` when the token is not a decodable JWT with a numeric `exp` and a `sub`. */
export function tokenExpiry(token: string): number | null {
  const segments = token.split(".");
  if (segments.length !== 3) return null;
  const payload = decodeBase64Url(segments[1] ?? "");
  if (payload === null) return null;
  let claims: unknown;
  try {
    claims = JSON.parse(payload);
  } catch {
    return null;
  }
  const parsed = claimsSchema.safeParse(claims);
  return parsed.success ? parsed.data.exp : null;
}

/** A token counts only when it carries an `exp` in the future; one without `exp`, undecodable, or expired does not. */
export function isLiveToken(token: string | null, nowSeconds: number): boolean {
  if (token === null) return false;
  const expiry = tokenExpiry(token);
  return expiry !== null && expiry > nowSeconds;
}

export function nowInSeconds(): number {
  return Date.now() / 1000;
}
