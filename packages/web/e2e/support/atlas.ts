import { testJwt } from "../../src/test/atlas/testJwt";
import type { AtlasAnswer, AtlasRequest } from "./network";

// Answers the requests `@kleros/kleros-app` 3.1.0 makes and keeps its state across page loads, as the real server does, so
// a spec can reload the tab and see whether the session survived. src/test/atlas/fakeAtlasServer.ts is not reused: its
// modules load Vitest and jsdom, which Playwright cannot (testJwt.ts loads neither).

const MIB = 1024 * 1024;

/** What Atlas answers to `roles(CourtV1)`: role names are the library enum's keys. */
const ROLES = [
  { name: "Evidence", restriction: { maxSize: 20 * MIB, allowedMimeTypes: ["application/pdf", "image/*"] } },
  { name: "Policy", restriction: { maxSize: MIB, allowedMimeTypes: ["application/json"] } },
];

/** The nonce Atlas issues; SIWE requires at least eight alphanumeric characters. */
export const ATLAS_NONCE = "e2enonce12345678";

const UPLOADED_CID = "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG";

interface IssuedToken {
  readonly account: string;
  readonly token: string;
}

interface FakeAtlas {
  readonly answer: (request: AtlasRequest) => AtlasAnswer;
  readonly logins: readonly IssuedToken[];
  readonly uploads: readonly (string | null)[];
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
      const token = testJwt({ sub: nonceAccount, exp: Math.floor(Date.now() / 1000) + 3600, jti: `e2e-session-${String(logins.length + 1)}` });
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
