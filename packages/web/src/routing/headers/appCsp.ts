import { CHAINS, resolveGateway, resolvePublicRpcUrl, resolveReadRpcUrl, type Env } from "@dispute-resolver/core";

/** What `public/_headers` carries in place of the report-only policy until the build replaces it (ARCHITECTURE.md §10.2). */
export const APP_CSP_PLACEHOLDER = "__APP_CSP__";

/** The wallet stack's fixed endpoints: AppKit's API, WalletConnect's RPC, analytics pulse and relays (ARCHITECTURE.md §10.2). */
export const WALLET_ORIGINS: readonly string[] = Object.freeze([
  "https://api.web3modal.org",
  "https://rpc.walletconnect.org",
  "https://pulse.walletconnect.org",
  "wss://relay.walletconnect.org",
  "wss://relay.walletconnect.com",
]);

/** A bare origin: a scheme the app can connect with, a host and an optional port, and nothing after them. */
const BARE_ORIGIN = /^(?:https|wss):\/\/[^/?#\s;,']+$/;

/** The schemes of the endpoints the policy lists: the deployed app is served over https and connects over TLS only. */
const CONNECTABLE_PROTOCOLS = new Set(["https:", "wss:"]);

/** Schemes a configured endpoint must not have: a plain http or ws endpoint fails the build instead of being dropped. */
const PLAIN_PROTOCOLS = new Set(["http:", "ws:"]);

/** A configured endpoint: `name` says where it came from (an env variable), never what it is. */
interface Endpoint {
  readonly name: string;
  readonly url: string;
}

function configuredEndpoints(env: Env): Endpoint[] {
  const endpoints: Endpoint[] = [];
  for (const chain of Object.values(CHAINS)) {
    const read = resolveReadRpcUrl(chain, env);
    if (read.status === "configured") endpoints.push({ name: chain.readRpcEnv ?? `the read RPC of chain ${String(chain.id)}`, url: read.url });
    const published = resolvePublicRpcUrl(chain, env);
    if (published.status === "configured") endpoints.push({ name: chain.publicRpcEnv ?? `the public RPC of chain ${String(chain.id)}`, url: published.url });
  }
  for (const name of ["REACT_APP_ATLAS_URI", "REACT_APP_METAEVIDENCE_URL"]) {
    const url = env[name]?.trim() ?? "";
    if (url !== "") endpoints.push({ name, url });
  }
  endpoints.push({ name: "REACT_APP_IPFS_GATEWAY", url: resolveGateway(env) });
  return endpoints;
}

/**
 * The origin of an endpoint, or `null` when it is not a URL the app can connect to (the app cannot use it either). A
 * plain http or ws endpoint throws, naming its variable. Only the scheme, host and port leave this function, and no
 * error carries any part of the value: RPC URLs carry API keys in their path (ARCHITECTURE.md §10.2).
 */
function endpointOrigin({ name, url }: Endpoint): string | null {
  if (!URL.canParse(url)) return null;
  const parsed = new URL(url);
  if (PLAIN_PROTOCOLS.has(parsed.protocol)) throw new Error(`${name} is a plain http or ws URL. The build accepts only https and wss endpoints.`);
  if (!CONNECTABLE_PROTOCOLS.has(parsed.protocol)) return null;
  const { origin } = parsed;
  if (!BARE_ORIGIN.test(origin)) throw new Error(`The connect-src source generated from ${name} is not a bare origin.`);
  return origin;
}

/**
 * The `connect-src` origins of C2 (ARCHITECTURE.md §10.2): every configured read and public RPC of the configured
 * chains, the Atlas origin, the meta-evidence API origin, the IPFS gateway origin and the wallet stack's endpoints,
 * deduplicated and sorted.
 */
export function connectSources(env: Env): readonly string[] {
  const origins = configuredEndpoints(env)
    .map(endpointOrigin)
    .filter((origin) => origin !== null);
  return [...new Set([...origins, ...WALLET_ORIGINS])].sort((left, right) => left.localeCompare(right));
}

/** The app's report-only policy (C2, ARCHITECTURE.md §10.2) for `env`. */
export function buildAppCsp(env: Env): string {
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' https: data:",
    "font-src 'self'",
    `connect-src 'self' ${connectSources(env).join(" ")}`,
    "frame-src https:",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ].join("; ");
}

/**
 * `headers` with the placeholder replaced by `policy`. Refuses a file without the placeholder and a policy that would
 * leave it or break the header line, so a broken build never ships headers silently (ARCHITECTURE.md §10.3).
 */
export function applyAppCsp(headers: string, policy: string): string {
  if (!headers.includes(APP_CSP_PLACEHOLDER)) throw new Error(`The headers file has no ${APP_CSP_PLACEHOLDER} placeholder to replace.`);
  if (policy.includes(APP_CSP_PLACEHOLDER) || /[\r\n]/.test(policy)) throw new Error("The generated policy is not a single header value.");
  // A replacer function, so a `$` in the policy is never read as a replacement pattern.
  return headers.replaceAll(APP_CSP_PLACEHOLDER, () => policy);
}
