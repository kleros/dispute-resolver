import type { ScriptParameters } from "@dispute-resolver/core";

/**
 * An https request to `host` whose path starts with `pathPrefix` goes to `target`, the chain's read RPC. The host
 * builds the rules; the page knows no provider.
 */
export interface RpcRedirectRule {
  readonly chainId: number;
  readonly host: string;
  readonly pathPrefix: string;
  readonly target: string;
}

export interface IframeRunnerOptions {
  readonly document: Document;
  readonly runnerUrl: string;
  readonly maxConcurrent: number;
  readonly rpcRedirects: readonly RpcRedirectRule[];
}

/** The one message the host posts to a runner frame, with one transferred `MessagePort`. */
export interface RunnerRequestMessage {
  readonly type: "dr-runner/run";
  readonly version: 2;
  readonly scriptText: string;
  readonly params: ScriptParameters;
  /** Core's `JSON_DUPLICATE_KEY_GUARD` for `kind === "reality"`, else `null`. */
  readonly guardSource: string | null;
  readonly rpcRedirects: readonly RpcRedirectRule[];
}

/** Posted only through the transferred port: exactly one `accepted`, then at most one `result` or `error`. */
export type RunnerReplyMessage =
  | { readonly type: "dr-runner/accepted" }
  | { readonly type: "dr-runner/result"; readonly value: unknown; readonly jsonDuplicateKeys: boolean }
  | { readonly type: "dr-runner/error"; readonly message: string };

/** Results leave the runner page only through this port. */
export interface ReplyPort {
  postMessage(message: RunnerReplyMessage): void;
}

export interface RunnerMessageEvent {
  readonly source: unknown;
  readonly origin: string;
  readonly data: unknown;
  readonly ports: readonly ReplyPort[];
}

export type FetchFunction = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** Optional arguments are passed through as given: an explicit `undefined` `async` would make the request synchronous. */
export type XhrOpen = (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) => void;

export interface NetworkHooks {
  wrapFetch(wrap: (original: FetchFunction) => FetchFunction): void;
  wrapXhrOpen(wrap: (original: XhrOpen) => XhrOpen): void;
}

/** Everything the runner bootstrap touches, so every guard is testable with a fake. */
export interface RunnerEnvironment {
  /** `self.origin`: `"null"` only when the document really is sandboxed. */
  readonly selfOrigin: string;
  readonly isTopLevel: boolean;
  /** The only window a request is accepted from. */
  readonly parent: unknown;
  /** `location.origin`: the URL's origin, which is the app's even inside an opaque-origin document. */
  readonly locationOrigin: string;
  addMessageListener(listener: (event: RunnerMessageEvent) => void): () => void;
  /** The global object: the script-facing globals are defined on it, and the script's own globals land on it. */
  readonly globals: object;
  /** Evaluates source text in the global scope, as a classic `<script>` would. */
  evaluate(source: string): void;
  /**
   * Evaluates the script text followed by a call of its `getMetaEvidence()` in one evaluation, so an entry point
   * declared with `const` or `let` is called too.
   */
  runScript(scriptText: string): void;
  readonly network: NetworkHooks;
}
