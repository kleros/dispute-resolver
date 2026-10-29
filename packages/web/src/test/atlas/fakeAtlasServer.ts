import { hexToString, isHex } from "viem";
import { vi } from "vitest";
import { TEST_WALLET_ACCOUNT } from "../wallet";
import { TEST_UPLOAD_CID } from "./fakeUploader";
import { testJwt } from "./testJwt";

/** The Atlas URI of the fake server; `.invalid` never resolves, and `fetch` is stubbed anyway. */
export const TEST_ATLAS_URI = "https://atlas.invalid";

/** The test wallet's RPC origin, where wagmi's mock connector sends `personal_sign` as `eth_sign`. */
const WALLET_RPC_ORIGIN = new URL("https://wallet.invalid").origin;

const MIB = 1024 * 1024;

/** What Atlas answers to `roles(CourtV1)`: role names are the library enum's keys. */
export const TEST_SERVER_ROLES = [
  { name: "Evidence", restriction: { maxSize: 20 * MIB, allowedMimeTypes: ["application/pdf", "image/*"] } },
  { name: "Policy", restriction: { maxSize: MIB, allowedMimeTypes: ["application/json"] } },
];

export type AtlasRequestKind = "roles" | "nonce" | "login" | "user" | "graphql" | "upload" | "sign" | "rpc";

export interface RecordedUpload {
  readonly product: FormDataEntryValue | null;
  readonly role: FormDataEntryValue | null;
  readonly name: FormDataEntryValue | null;
  readonly file: File;
  readonly authorization: string | null;
}

export interface RecordedSignature {
  readonly account: string;
  readonly message: string;
}

export interface RecordedGraphqlRequest {
  readonly kind: AtlasRequestKind;
  readonly variables: unknown;
  readonly authorization: string | null;
}

export interface FakeAtlasServerOptions {
  /**
   * The `roles` answer; `"fail"` answers with a GraphQL error, as when the request fails; `"fail-once"` fails the first
   * request and answers `TEST_SERVER_ROLES` afterwards, as when Atlas recovers from a transient failure.
   */
  readonly roles?: readonly unknown[] | "fail" | "fail-once";
  /** `"fail"`: the `nonce` mutation answers with a GraphQL error, so sign-in fails before any signature. */
  readonly nonce?: "issue" | "fail";
  /** The token `login` issues; defaults to a distinct one-hour token for the account that asked for the nonce. */
  readonly issueToken?: () => string;
  /** `"reject"`: the wallet declines the sign-in signature (EIP-1193 code 4001). */
  readonly signature?: "sign" | "reject";
  readonly uploadResponse?: () => Response | Promise<Response>;
}

export interface FakeAtlasServer {
  readonly requests: readonly AtlasRequestKind[];
  readonly uploads: readonly RecordedUpload[];
  readonly graphql: readonly RecordedGraphqlRequest[];
  readonly signatures: readonly RecordedSignature[];
  count(kind: AtlasRequestKind): number;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}

function graphqlKind(query: string): AtlasRequestKind {
  if (/\broles\s*\(/.test(query)) return "roles";
  if (/\bnonce\s*\(/.test(query)) return "nonce";
  if (/\blogin\s*\(/.test(query)) return "login";
  if (/\buser\s*\{/.test(query)) return "user";
  return "graphql";
}

function addressOf(variables: unknown): string | null {
  if (typeof variables !== "object" || variables === null || !("address" in variables)) return null;
  return typeof variables.address === "string" ? variables.address : null;
}

/** wagmi's mock connector sends `personal_sign` as `eth_sign` with the parameters swapped: `[account, hex message]`. */
function signatureOf(params: unknown): RecordedSignature {
  const [account, message] = Array.isArray(params) ? (params as readonly unknown[]) : [];
  return {
    account: typeof account === "string" ? account : "",
    message: typeof message === "string" && isHex(message) ? hexToString(message) : "",
  };
}

function headerOf(init: RequestInit | undefined, name: string): string | null {
  return new Headers(init?.headers).get(name);
}

/**
 * Stubs the global `fetch` with an Atlas server and the test wallet's signing RPC, so the real `@kleros/kleros-app`
 * provider signs in and uploads without any network. Undo it with `vi.unstubAllGlobals()`.
 */
export function installFakeAtlasServer(options: FakeAtlasServerOptions = {}): FakeAtlasServer {
  let issued = 0;
  // Atlas issues the token to the address the nonce was issued for, which is the account the library signs in with.
  let nonceAddress: string = TEST_WALLET_ACCOUNT;
  const distinctToken = () => {
    issued += 1;
    return testJwt({ sub: nonceAddress, exp: Math.floor(Date.now() / 1000) + 3600, jti: `test-session-${String(issued)}` });
  };
  const { roles = TEST_SERVER_ROLES, nonce = "issue", issueToken = distinctToken, signature = "sign" } = options;
  const requests: AtlasRequestKind[] = [];
  const uploads: RecordedUpload[] = [];
  const graphqlRequests: RecordedGraphqlRequest[] = [];
  const signatures: RecordedSignature[] = [];

  const rolesAnswer = (): Response => {
    const failing = roles === "fail" || (roles === "fail-once" && requests.filter((kind) => kind === "roles").length === 1);
    if (failing) return json({ errors: [{ message: "Roles unavailable" }] });
    return json({ data: { roles: roles === "fail-once" ? TEST_SERVER_ROLES : roles } });
  };

  const graphql = (body: string, init: RequestInit | undefined): Response => {
    const { query, variables } = JSON.parse(body) as { readonly query: string; readonly variables?: unknown };
    const kind = graphqlKind(query);
    requests.push(kind);
    graphqlRequests.push({ kind, variables, authorization: headerOf(init, "authorization") });
    switch (kind) {
      case "roles":
        return rolesAnswer();
      case "nonce":
        nonceAddress = addressOf(variables) ?? nonceAddress;
        return nonce === "fail" ? json({ errors: [{ message: "Nonce unavailable" }] }) : json({ data: { nonce: "testnonce12345678" } });
      case "login":
        return json({ data: { login: { accessToken: issueToken() } } });
      case "user":
        return json({ data: { user: null } });
      default:
        return json({ errors: [{ message: "Not served by the fake Atlas server" }] });
    }
  };

  const walletRpc = (body: string): Response => {
    const { id, method, params } = JSON.parse(body) as { readonly id: number; readonly method: string; readonly params?: unknown };
    if (method !== "eth_sign") {
      requests.push("rpc");
      return json({ jsonrpc: "2.0", id, error: { code: -32601, message: `${method} is not served` } });
    }
    requests.push("sign");
    signatures.push(signatureOf(params));
    return signature === "reject"
      ? json({ jsonrpc: "2.0", id, error: { code: 4001, message: "User rejected the request." } })
      : json({ jsonrpc: "2.0", id, result: `0x${"ab".repeat(65)}` });
  };

  const upload = async (init: RequestInit | undefined): Promise<Response> => {
    requests.push("upload");
    const form = init?.body;
    if (!(form instanceof FormData)) return json({ message: "Expected multipart form data" }, 400);
    const file = form.get("file");
    if (!(file instanceof File)) return json({ message: "Missing file" }, 400);
    uploads.push({ product: form.get("product"), role: form.get("role"), name: form.get("name"), file, authorization: headerOf(init, "authorization") });
    return (await options.uploadResponse?.()) ?? new Response(TEST_UPLOAD_CID, { status: 200 });
  };

  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = requestUrl(input);
      const body = typeof init?.body === "string" ? init.body : "";
      if (url === `${TEST_ATLAS_URI}/graphql`) return Promise.resolve(graphql(body, init));
      if (url === `${TEST_ATLAS_URI}/ipfs/file`) return upload(init);
      if (new URL(url).origin === WALLET_RPC_ORIGIN) return Promise.resolve(walletRpc(body));
      return Promise.reject(new TypeError(`Tests never touch the network: ${url}`));
    }),
  );

  return {
    requests,
    uploads,
    graphql: graphqlRequests,
    signatures,
    count: (kind) => requests.filter((request) => request === kind).length,
  };
}
