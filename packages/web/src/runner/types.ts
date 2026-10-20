import type { ChainId, ScriptParameters } from "@dispute-resolver/core";

/**
 * One RPC redirect applied inside the runner (D-25): an https request to `host` whose path starts with `pathPrefix`
 * goes to `target`, the chain's public RPC of D-35. The host builds the rules; the page knows no provider.
 */
export interface RpcRedirectRule {
  readonly chainId: ChainId;
  readonly host: string;
  readonly pathPrefix: string;
  readonly target: string;
}

/** Options of `createIframeScriptRunner`, which implements core's `ScriptRunner` (ADR 0004, ARCHITECTURE.md §7.3). */
export interface IframeRunnerOptions {
  readonly document: Document;
  /** `/__runner/index.html`. */
  readonly runnerUrl: string;
  /** 4 (D-29). */
  readonly maxConcurrent: number;
  readonly rpcRedirects: readonly RpcRedirectRule[];
}

/** The one message the host posts to a runner frame, with one transferred `MessagePort` (ARCHITECTURE.md §7.2). */
export interface RunnerRequestMessage {
  readonly type: "dr-runner/run";
  readonly version: 2;
  readonly scriptText: string;
  readonly params: ScriptParameters;
  /** Core's `JSON_DUPLICATE_KEY_GUARD` for `kind === "reality"` (A4), else `null`. */
  readonly guardSource: string | null;
  readonly rpcRedirects: readonly RpcRedirectRule[];
}

/**
 * What the runner page posts back, only through the transferred port (B1, D-05): exactly one `accepted`, then at most
 * one `result` or `error` (P-16).
 */
export type RunnerReplyMessage =
  | { readonly type: "dr-runner/accepted" }
  | { readonly type: "dr-runner/result"; readonly value: unknown; readonly jsonDuplicateKeys: boolean }
  | { readonly type: "dr-runner/error"; readonly message: string };

/** The end of a run's `MessagePort` the runner page keeps: results leave the page only through it (B1, D-05). */
export interface ReplyPort {
  postMessage(message: RunnerReplyMessage): void;
}

/** The parts of a window `message` event the runner bootstrap reads. */
export interface RunnerMessageEvent {
  readonly source: unknown;
  readonly origin: string;
  readonly data: unknown;
  readonly ports: readonly ReplyPort[];
}

export type FetchFunction = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** `XMLHttpRequest.prototype.open` with its optional arguments passed through as given (an explicit `undefined` `async` would make the request synchronous). */
export type XhrOpen = (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) => void;

/** The two request entry points the runner's RPC redirect wraps (D-25). */
export interface NetworkHooks {
  wrapFetch(wrap: (original: FetchFunction) => FetchFunction): void;
  wrapXhrOpen(wrap: (original: XhrOpen) => XhrOpen): void;
}

/**
 * Everything the runner bootstrap touches, so every guard is testable with a fake (ARCHITECTURE.md §7.2). The page's
 * `main.ts` passes the real one.
 */
export interface RunnerEnvironment {
  /** `self.origin`: `"null"` only when the document really is sandboxed (C4). */
  readonly selfOrigin: string;
  /** `window.top === window || window.parent === window` (C4). */
  readonly isTopLevel: boolean;
  /** `window.parent`, the only window a request is accepted from (C4). */
  readonly parent: unknown;
  /** `location.origin`: the URL's origin, which is the app's even inside an opaque-origin document (C4). */
  readonly locationOrigin: string;
  /** Adds a window `message` listener and returns its removal. */
  addMessageListener(listener: (event: RunnerMessageEvent) => void): () => void;
  /** The global object: the script-facing globals are defined on it, and the script's own globals land on it. */
  readonly globals: object;
  /** Evaluates source text in the global scope, as a classic `<script>` would. */
  evaluate(source: string): void;
  /**
   * Evaluates the script text followed by a call of its `getMetaEvidence()`, in one evaluation as the old runner's
   * single `<script>` element did, so an entry point declared with `const` or `let` is called too.
   */
  runScript(scriptText: string): void;
  readonly network: NetworkHooks;
}
