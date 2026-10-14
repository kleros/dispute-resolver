// Public surface of `routing` (owner: routing; ARCHITECTURE.md §3.7). `headersPlugin` is Node-side build code: vite.config.ts
// imports it from ./headers, and this index does not re-export it, so it never enters the app's module graph.
export type * from "./types";
export { ChainLayout } from "./ChainLayout";
export { NotFoundScreen } from "./NotFoundScreen";
export { UnsupportedNetworkScreen } from "./UnsupportedNetworkScreen";
export { createAppRoutes } from "./createAppRoutes";
export { usePageChain, useResolvedChain } from "./pageChain";
export { APP_ROUTE_PATTERNS, paths, replaceChainSegment } from "./paths";
export { ChainlessRedirect, RedirectToOngoing } from "./redirects";
export { useChainFollowing } from "./useChainFollowing";
