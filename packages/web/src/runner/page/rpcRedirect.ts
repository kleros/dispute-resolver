import type { FetchFunction, NetworkHooks, RpcRedirectRule, XhrOpen } from "../types";

/** Only https URLs whose host equals the rule's host exactly are redirected; `undefined` leaves the request alone. */
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
 * A script that hardcodes a known provider, whatever key it carries, reaches the chain's read RPC instead. Nothing
 * is patched when the host sent no rules.
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
