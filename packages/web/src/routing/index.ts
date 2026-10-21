// Public surface of `routing` (owner: routing; ARCHITECTURE.md §3.7). The headers policy (./headers/appCsp.ts) is not
// exported here: only the build's headers plugin (vite-plugins/headersPlugin.ts) loads it, so it never enters the app's
// module graph.
export type * from "./types";
export { ChainLayout } from "./ChainLayout";
export { NotFoundScreen } from "./NotFoundScreen";
export { UnsupportedNetworkScreen } from "./UnsupportedNetworkScreen";
export { createAppRoutes } from "./createAppRoutes";
export { usePageChain, useResolvedChain } from "./pageChain";
export { paths, replaceChainSegment, switchChainSegment } from "./paths";
export { ChainlessRedirect, RedirectToOngoing } from "./redirects";
export { useChainFollowing } from "./useChainFollowing";
