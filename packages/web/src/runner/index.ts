// Public surface of `runner` (owner: runner; ARCHITECTURE.md §7). The Vite plugin that builds the runner page's bootstrap
// is Node-side build code in vite-plugins/, outside src/, so it never enters the app's module graph.
export type * from "./types";
export { RUNNER_PATH } from "./protocol";
export { createIframeScriptRunner } from "./host/createIframeScriptRunner";
export { buildRpcRedirects } from "./host/rpcRedirects";
