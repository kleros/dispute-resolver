import type { FetchFunction, RpcRedirectRule, RunnerEnvironment, RunnerMessageEvent, RunnerReplyMessage, RunnerRequestMessage, XhrOpen } from "../../runner";

/** The app origin the fake runner URL and its parent share. */
export const FAKE_APP_ORIGIN = "https://resolve.kleros.io";

/** Valid parameters for mainnet dispute 1650. */
export const SAMPLE_PARAMS: RunnerRequestMessage["params"] = {
  disputeID: "1650",
  arbitrableContractAddress: "0x2018038203aee8e7a29dabd73771b0355d4f85ad",
  arbitratorChainID: 1,
  arbitrableChainID: 1,
  arbitratorJsonRpcUrl: "https://rpc.example/mainnet",
  arbitrableJsonRpcUrl: "https://rpc.example/mainnet",
};

export const SAMPLE_REDIRECTS: readonly RpcRedirectRule[] = [{ chainId: 1, host: "mainnet.infura.io", pathPrefix: "/v3/", target: "https://rpc.example/mainnet" }];

/** The fixed acknowledgement the page posts on the port as soon as it accepts a run. */
export const ACCEPTED: RunnerReplyMessage = { type: "dr-runner/accepted" };

/** A well-formed request with one script; override any field. */
export function runRequest(overrides: Partial<RunnerRequestMessage> = {}): RunnerRequestMessage {
  return { type: "dr-runner/run", version: 2, scriptText: "script", params: SAMPLE_PARAMS, guardSource: null, rpcRedirects: [], ...overrides };
}

/** What the fake runner globals hold after a run: the script-facing globals and whatever the "script" defined. */
export type FakeGlobals = Record<string, unknown>;

/** The script-facing globals as a fake script calls them. */
export interface ScriptApi {
  readonly globals: FakeGlobals;
  resolveScript(value: unknown): void;
  rejectScript(reason: unknown): void;
}

interface FakeRunnerEnvironmentOptions {
  readonly selfOrigin?: string;
  readonly isTopLevel?: boolean;
  readonly locationOrigin?: string;
  /**
   * What evaluating a source (the guard, or the script text) does; by default nothing beyond recording it. For the
   * script, the fake then calls `getMetaEvidence` as the real evaluation's appended call would.
   */
  readonly onEvaluate?: (source: string, api: ScriptApi) => void;
}

export interface FakeRunnerEnvironment {
  readonly env: RunnerEnvironment;
  /** The fake `window.parent`. */
  readonly parent: object;
  readonly globals: FakeGlobals;
  /** Every source evaluated, the guard and the script text, in order. */
  readonly evaluated: string[];
  /** Every reply posted on the fake port, structured-cloned as a real port would. */
  readonly replies: RunnerReplyMessage[];
  /** The URL each request made through the patched `fetch` or `XMLHttpRequest.open` reached. */
  readonly requests: { readonly via: "fetch" | "xhr"; readonly input: unknown; readonly rest: readonly unknown[] }[];
  listenerCount(): number;
  /** Dispatches a message event to every installed listener. */
  deliver(event: RunnerMessageEvent): void;
  /** A message event from the parent, on the app origin, carrying `data` and one port that records replies. */
  fromParent(data: unknown): RunnerMessageEvent;
  /** Calls `fetch` as the script would, through whatever the bootstrap installed. */
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  /** Calls `XMLHttpRequest.prototype.open` as the script would. */
  xhrOpen(method: string, url: string | URL, ...rest: unknown[]): void;
}

function callable(value: unknown, name: string): (argument: unknown) => void {
  if (typeof value !== "function") throw new TypeError(`${name} is not defined`);
  return (argument) => {
    Reflect.apply(value, undefined, [argument]);
  };
}

/**
 * A fake `RunnerEnvironment` for `bootstrapRunner`: a sandboxed, framed page on the app's URL by default, whose
 * `evaluate` runs `onEvaluate` instead of real code and whose port records replies.
 */
export function createFakeRunnerEnvironment(options: FakeRunnerEnvironmentOptions = {}): FakeRunnerEnvironment {
  const parent = {};
  const globals: FakeGlobals = {};
  const evaluated: string[] = [];
  const replies: RunnerReplyMessage[] = [];
  const requests: FakeRunnerEnvironment["requests"] = [];
  const listeners = new Set<(event: RunnerMessageEvent) => void>();
  const xhr = {} as XMLHttpRequest;

  let currentFetch: FetchFunction = (input, init) => {
    requests.push({ via: "fetch", input, rest: init === undefined ? [] : [init] });
    return Promise.resolve(new Response("{}"));
  };
  let currentOpen: XhrOpen = (_method, url, ...rest) => {
    requests.push({ via: "xhr", input: url, rest });
  };

  const api: ScriptApi = {
    globals,
    resolveScript: (value) => {
      callable(globals.resolveScript, "resolveScript")(value);
    },
    rejectScript: (reason) => {
      callable(globals.rejectScript, "rejectScript")(reason);
    },
  };

  const env: RunnerEnvironment = {
    selfOrigin: options.selfOrigin ?? "null",
    isTopLevel: options.isTopLevel ?? false,
    parent,
    locationOrigin: options.locationOrigin ?? FAKE_APP_ORIGIN,
    addMessageListener(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    globals,
    evaluate(source) {
      evaluated.push(source);
      options.onEvaluate?.(source, api);
    },
    runScript(scriptText) {
      evaluated.push(scriptText);
      options.onEvaluate?.(scriptText, api);
      const entryPoint = globals.getMetaEvidence;
      if (typeof entryPoint !== "function") throw new ReferenceError("getMetaEvidence is not defined");
      Reflect.apply(entryPoint, undefined, []);
    },
    network: {
      wrapFetch(wrap) {
        currentFetch = wrap(currentFetch);
      },
      wrapXhrOpen(wrap) {
        currentOpen = wrap(currentOpen);
      },
    },
  };

  return {
    env,
    parent,
    globals,
    evaluated,
    replies,
    requests,
    listenerCount: () => listeners.size,
    deliver(event) {
      for (const listener of listeners) listener(event);
    },
    fromParent(data) {
      return {
        source: parent,
        origin: FAKE_APP_ORIGIN,
        data,
        ports: [
          {
            postMessage(message) {
              replies.push(structuredClone(message));
            },
          },
        ],
      };
    },
    fetch: (input, init) => currentFetch(input, init),
    xhrOpen(method, url, ...rest) {
      currentOpen.call(xhr, method, url, ...rest);
    },
  };
}

/** Lets queued promise callbacks (the bootstrap's result posting) run. */
export async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/** Every message `port` receives, in order, up to and including the first one that is not the acknowledgement. */
export function collectUntilSettled(port: MessagePort): Promise<RunnerReplyMessage[]> {
  const messages: RunnerReplyMessage[] = [];
  return new Promise((resolve) => {
    port.onmessage = (event: MessageEvent<RunnerReplyMessage>) => {
      messages.push(event.data);
      if (event.data.type !== "dr-runner/accepted") resolve(messages);
    };
  });
}
