import { RUNNER_PATH, buildRpcRedirects, createIframeScriptRunner } from "../../../packages/web/src/runner";
import type { GoldenGateWindow, NewRunInput } from "./protocol";

// The NEW runner for the C6 gate (04 §5): the app's own host code (`createIframeScriptRunner`), bundled as is and run
// in a harness page served from the built app's origin, so its frames load the real /__runner/index.html that
// `vite preview` serves with the runner policy. Wired exactly as `DataProvider` wires it (ARCHITECTURE.md §7.4).

/** The app's concurrency cap (D-29). */
const MAX_CONCURRENT = 4;

(window as GoldenGateWindow).__goldenGateNewRunner = {
  run({ request, env }: NewRunInput) {
    const runner = createIframeScriptRunner({ document, runnerUrl: RUNNER_PATH, maxConcurrent: MAX_CONCURRENT, rpcRedirects: buildRpcRedirects(env) });
    return runner.run(request);
  },
};
