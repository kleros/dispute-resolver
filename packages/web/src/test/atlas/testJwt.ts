function base64Url(text: string): string {
  const binary = Array.from(new TextEncoder().encode(text), (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

/** An unsigned JWT with `claims` as its payload; nothing in the app or the library verifies the signature. */
export function testJwt(claims: Readonly<Record<string, unknown>>): string {
  return `${base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${base64Url(JSON.stringify(claims))}.dGVzdC1zaWduYXR1cmU`;
}

/** A session token for `sub` expiring `secondsFromNow` from now (negative: already expired). */
export function sessionJwt(sub: string, secondsFromNow = 3600): string {
  return testJwt({ sub, exp: Math.floor(Date.now() / 1000) + secondsFromNow });
}

/** The `sub` claim of a token sent as `Bearer <token>`, or `null` when there is none. */
export function jwtSubject(authorization: string | null | undefined): string | null {
  const payload = authorization?.replace(/^Bearer /, "").split(".")[1];
  if (payload === undefined) return null;
  const claims: unknown = JSON.parse(atob(payload.replaceAll("-", "+").replaceAll("_", "/")));
  return typeof claims === "object" && claims !== null && "sub" in claims && typeof claims.sub === "string" ? claims.sub : null;
}
