import type { ScriptResult, ScriptRunRequest } from "../../../packages/core/src/types";
import type { OldScriptParameters } from "../src/gate/oldParams";

// The globals the gate's two harness pages expose to Playwright. Types only: each page bundle defines its own global.

/** One run of the old runner replica (today's `fetchDataFromScript`, spec 9.5). */
export interface OldRunInput {
  readonly scriptString: string;
  readonly scriptParameters: OldScriptParameters;
  /** Today's `redirectMap`: the hard-coded Infura URL to chain 1's read RPC, or empty. */
  readonly redirectMap: Readonly<Record<string, string>>;
  /** The duplicate-key guard for Reality scripts, or "" (today's `isRealityScript(scriptString) ? GUARD : ""`). */
  readonly guardSource: string;
  /** The `sandbox` value the `iframe` package set: "allow-scripts allow-same-origin" or "allow-scripts ". */
  readonly sandbox: string;
  readonly timeoutMs: number;
}

/** What today's `fetchDataFromScript` settles with: its resolved value, or its timeout rejection. */
export type OldRunOutput = { readonly status: "result"; readonly result: unknown; readonly jsonDuplicateKeys: boolean } | { readonly status: "timeout" };

/** One run through the app's own runner host (`createIframeScriptRunner`, ARCHITECTURE.md §7.3), wired as `DataProvider` wires it (§7.4). */
export interface NewRunInput {
  readonly request: Omit<ScriptRunRequest, "signal">;
  /** The environment `buildRpcRedirects` reads: only the RPC variables. */
  readonly env: Readonly<Record<string, string>>;
}

export interface GoldenGateWindow {
  __goldenGateOldRunner?: { run(input: OldRunInput): Promise<OldRunOutput> };
  __goldenGateNewRunner?: { run(input: NewRunInput): Promise<ScriptResult> };
}
