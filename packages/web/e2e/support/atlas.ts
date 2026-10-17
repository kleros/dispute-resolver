import type { AtlasAnswer, AtlasRequest } from "./network";

// An Atlas server for the Playwright specs (C9: harness only), answering the requests `@kleros/kleros-app` 3.1.0 makes:
// `roles(product)` at load, `nonce(address)` and `login(message, signature)` to sign in, `user` once verified, and the
// multipart upload. It keeps its state across page loads, as the real server does, so a spec can reload the tab and
// see whether the session survived. The shapes copy the unit tests' fake server (src/test/atlas/fakeAtlasServer.ts); it
// is not imported, since the unit tests' modules load Vitest and jsdom, which Playwright's loader does not.

const MIB = 1024 * 1024;

/** What Atlas answers to `roles(CourtV1)`: role names are the library enum's keys. */
const ROLES = [
  { name: "Evidence", restriction: { maxSize: 20 * MIB, allowedMimeTypes: ["application/pdf", "image/*"] } },
  { name: "Policy", restriction: { maxSize: MIB, allowedMimeTypes: ["application/json"] } },
];

/** The nonce Atlas issues; SIWE requires at least eight alphanumeric characters. */
export const ATLAS_NONCE = "e2enonce12345678";

/** The CID every upload returns. */
export const UPLOADED_CID = "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG";

/** The session token Atlas's `login` issued, by the account it was issued to. */
export interface IssuedToken {
  readonly account: string;
  readonly token: string;
}

export interface FakeAtlas {
  /** The handler for `fakeNetwork`'s `atlas` option. */
  readonly answer: (request: AtlasRequest) => AtlasAnswer;
  /** Every token `login` issued, in order. */
  readonly logins: readonly IssuedToken[];
  /** The bearer token of every upload, in order (`null`: sent without one). */
  readonly uploads: readonly (string | null)[];
}

function base64Url(text: string): string {
  return Buffer.from(text, "utf8").toString("base64url");
}

/** An unsigned JWT; neither the app nor the library verifies the signature, only `sub` and `exp`. */
function sessionToken(account: string, serial: number): string {
  const claims = { sub: account, exp: Math.floor(Date.now() / 1000) + 3600, jti: `e2e-session-${String(serial)}` };
  return `${base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${base64Url(JSON.stringify(claims))}.ZTJlLXNpZ25hdHVyZQ`;
}

function bearer(authorization: string | null): string | null {
  return authorization?.startsWith("Bearer ") === true ? authorization.slice("Bearer ".length) : null;
}

export function fakeAtlas(): FakeAtlas {
  const logins: IssuedToken[] = [];
  const uploads: (string | null)[] = [];
  // Atlas issues the token to the address the nonce was issued for, which is the account the library signs in with.
  let nonceAccount: string | null = null;

  const graphql = (query: string, variables: Readonly<Record<string, unknown>>): AtlasAnswer => {
    if (/\broles\s*\(/.test(query)) return { json: { data: { roles: ROLES } } };
    if (/\bnonce\s*\(/.test(query)) {
      nonceAccount = typeof variables.address === "string" ? variables.address : null;
      return { json: { data: { nonce: ATLAS_NONCE } } };
    }
    if (/\blogin\s*\(/.test(query)) {
      if (nonceAccount === null) return { json: { errors: [{ message: "No nonce was issued." }] } };
      const token = sessionToken(nonceAccount, logins.length + 1);
      logins.push({ account: nonceAccount, token });
      return { json: { data: { login: { accessToken: token } } } };
    }
    if (/\buser\s*\{/.test(query)) return { json: { data: { user: null } } };
    return { json: { errors: [{ message: "Not served by the e2e Atlas server." }] } };
  };

  const answer = (request: AtlasRequest): AtlasAnswer => {
    if (request.kind === "graphql") return graphql(request.query, request.variables);
    uploads.push(bearer(request.authorization));
    return { text: UPLOADED_CID };
  };

  return { answer, logins, uploads };
}
