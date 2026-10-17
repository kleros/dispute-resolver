import type { FetchFunction, NetworkHooks, RpcRedirectRule, XhrOpen } from "../types";

/**
 * Where a request to `url` goes instead (D-25): the target of the first rule whose host equals the URL's host exactly
 * and whose path prefix starts the URL's path, for https URLs only. `undefined` leaves the request alone.
 */
export function redirectTarget(rules: readonly RpcRedirectRule[], url: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== "https:") return undefined;
  return rules.find((rule) => parsed.host === rule.host && parsed.pathname.startsWith(rule.pathPrefix))?.target;
}

/** A copy of `request` aimed at `target`, keeping its method, headers, body and options. */
async function redirectedRequest(target: string, request: Request): Promise<Request> {
  const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer();
  return new Request(target, {
    method: request.method,
    headers: request.headers,
    body,
    credentials: request.credentials,
    cache: request.cache,
    redirect: request.redirect,
    integrity: request.integrity,
    keepalive: request.keepalive,
    referrerPolicy: request.referrerPolicy,
    signal: request.signal,
  });
}

/** The URL a fetch input names, stringified as fetch itself does for anything that is not a Request. */
function requestUrl(input: RequestInfo | URL): string {
  return input instanceof Request ? input.url : String(input);
}

/**
 * Patches `fetch` and `XMLHttpRequest.prototype.open` so a script that hardcodes a known provider, whatever key it
 * carries, reaches the chain's public RPC instead (D-25, D-35). Nothing is patched when the host sent no rules.
 */
export function installRpcRedirect(network: NetworkHooks, rules: readonly RpcRedirectRule[]): void {
  if (rules.length === 0) return;

  network.wrapFetch((original: FetchFunction): FetchFunction => (input, init) => {
    const target = redirectTarget(rules, requestUrl(input));
    if (target === undefined) return original(input, init);
    if (input instanceof Request) return redirectedRequest(target, input).then((request) => original(request, init));
    return original(target, init);
  });

  network.wrapXhrOpen(
    (original: XhrOpen): XhrOpen =>
      function open(this: XMLHttpRequest, method, url, ...rest) {
        const target = redirectTarget(rules, String(url));
        original.call(this, method, target ?? url, ...rest);
      },
  );
}
