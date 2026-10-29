import type { FetchFunction, RpcRedirectRule, RunnerEnvironment, RunnerMessageEvent, RunnerReplyMessage, RunnerRequestMessage, XhrOpen } from "../../runner";

export const FAKE_APP_ORIGIN = "https://resolve.kleros.io";

export const SAMPLE_PARAMS: RunnerRequestMessage["params"] = {
  disputeID: "1650",
  arbitrableContractAddress: "0x2018038203aee8e7a29dabd73771b0355d4f85ad",
  arbitratorChainID: 1,
  arbitrableChainID: 1,
  arbitratorJsonRpcUrl: "https://rpc.example/mainnet",
  arbitrableJsonRpcUrl: "https://rpc.example/mainnet",
};

export const SAMPLE_REDIRECTS: readonly RpcRedirectRule[] = [{ chainId: 1, host: "mainnet.infura.io", pathPrefix: "/v3/", target: "https://rpc.example/mainnet" }];

export const ACCEPTED: RunnerReplyMessage = { type: "dr-runner/accepted" };

export function runRequest(overrides: Partial<RunnerRequestMessage> = {}): RunnerRequestMessage {
  return { type: "dr-runner/run", version: 2, scriptText: "script", params: SAMPLE_PARAMS, guardSource: null, rpcRedirects: [], ...overrides };
}

export type FakeGlobals = Record<string, unknown>;

export interface ScriptApi {
  readonly globals: FakeGlobals;
  resolveScript(value: unknown): void;
  rejectScript(reason: unknown): void;
}

interface FakeRunnerEnvironmentOptions {
  readonly selfOrigin?: string;
  readonly isTopLevel?: boolean;
  readonly locationOrigin?: string;
  /** Runs on each evaluated source; after the script text the fake then calls `getMetaEvidence`, as the real runner does. */
  readonly onEvaluate?: (source: string, api: ScriptApi) => void;
}

export interface FakeRunnerEnvironment {
  readonly env: RunnerEnvironment;
  readonly parent: object;
  readonly globals: FakeGlobals;
  readonly evaluated: string[];
  /** Every reply posted on the fake port, structured-cloned as a real port would. */
  readonly replies: RunnerReplyMessage[];
  readonly requests: { readonly via: "fetch" | "xhr"; readonly input: unknown; readonly rest: readonly unknown[] }[];
  listenerCount(): number;
  deliver(event: RunnerMessageEvent): void;
  fromParent(data: unknown): RunnerMessageEvent;
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
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
