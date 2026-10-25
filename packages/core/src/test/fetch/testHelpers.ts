import type { FetchInit, FetchResponse, Fetcher } from "../../types";

/** A request or script run that never settles, even when its signal aborts (an implementation that ignores the signal). */
export const HANG: unique symbol = Symbol("hang");

/** How the fake network answers one request: a 200 body, a rejection, an HTTP status with a body, or `HANG`. */
export type Route = string | Error | { readonly status: number; readonly body: string } | typeof HANG;

function response(status: number, body: string): FetchResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve().then((): unknown => JSON.parse(body)),
    text: () => Promise.resolve(body),
  };
}

function answer(route: Route | undefined): Promise<FetchResponse> {
  if (route === undefined) return Promise.resolve(response(404, "Not Found"));
  if (route === HANG) return new Promise<FetchResponse>(() => undefined);
  if (route instanceof Error) return Promise.reject(route);
  if (typeof route === "string") return Promise.resolve(response(200, route));
  return Promise.resolve(response(route.status, route.body));
}

function isRouteList(entry: Route | readonly Route[] | undefined): entry is readonly Route[] {
  return Array.isArray(entry);
}

/**
 * A stub fetcher answering from a map of URL → route. A list of routes answers successive requests in order and repeats
 * its last entry; a URL missing from the map answers 404.
 */
export function fakeFetcher(routes: Readonly<Record<string, Route | readonly Route[]>>): { fetcher: Fetcher; urls: string[]; inits: (FetchInit | undefined)[] } {
  const urls: string[] = [];
  const inits: (FetchInit | undefined)[] = [];
  const served = new Map<string, number>();
  const fetcher: Fetcher = (url, init) => {
    urls.push(url);
    inits.push(init);
    const entry = routes[url];
    if (!isRouteList(entry)) return answer(entry);
    const index = served.get(url) ?? 0;
    served.set(url, index + 1);
    return answer(entry[Math.min(index, entry.length - 1)]);
  };
  return { fetcher, urls, inits };
}
