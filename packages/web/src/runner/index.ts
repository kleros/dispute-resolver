// Public surface of `runner` (owner: runner; ARCHITECTURE.md §7). runnerBootstrapPlugin is not exported here: it is
// Node-side build code that vite.config.ts imports from ./build directly, so it never enters the app's module graph.
export type * from "./types";
export { RUNNER_PATH } from "./protocol";
export { createIframeScriptRunner } from "./host/createIframeScriptRunner";
export { buildRpcRedirects } from "./host/rpcRedirects";
