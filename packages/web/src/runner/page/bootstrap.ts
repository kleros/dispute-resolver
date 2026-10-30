import type { ScriptParameters } from "@dispute-resolver/core";
import { ACCEPTED_MESSAGE_TYPE, ERROR_MESSAGE_TYPE, RESULT_MESSAGE_TYPE } from "../protocol";
import type { ReplyPort, RunnerEnvironment, RunnerMessageEvent, RunnerReplyMessage, RunnerRequestMessage } from "../types";
import { parseRunRequest } from "./request";
import { installRpcRedirect } from "./rpcRedirect";

const OPAQUE_ORIGIN = "null";
const NOT_CLONEABLE = "The script's result cannot be copied out of the runner.";
const UNDESCRIBED_FAILURE = "The script reported a failure.";

interface AcceptedRun {
  readonly request: RunnerRequestMessage;
  readonly port: ReplyPort;
}

function isSandboxedFrame(env: RunnerEnvironment): boolean {
  return env.selfOrigin === OPAQUE_ORIGIN && !env.isTopLevel;
}

/** The runner URL's own origin is the app's, and an opaque document still reports it through `location.origin`. */
function acceptRun(env: RunnerEnvironment, event: RunnerMessageEvent): AcceptedRun | undefined {
  if (event.source !== env.parent || env.locationOrigin === OPAQUE_ORIGIN || event.origin !== env.locationOrigin) return;
  const [port, ...extraPorts] = event.ports;
  if (port === undefined || extraPorts.length > 0) return;
  const request = parseRunRequest(event.data);
  if (request === undefined) return;
  return { request, port };
}

function describeFailure(reason: unknown): string {
  if (typeof reason === "string") return reason;
  try {
    const message: unknown = reason instanceof Error ? reason.message : undefined;
    if (typeof message === "string") return message;
  } catch {
    // A hostile reason (a throwing getter or proxy trap) is described generically.
  }
  return UNDESCRIBED_FAILURE;
}

function post(port: ReplyPort, message: RunnerReplyMessage): void {
  try {
    port.postMessage(message);
  } catch {
    port.postMessage({ type: ERROR_MESSAGE_TYPE, message: NOT_CLONEABLE });
  }
}

interface Reporter {
  resolve(value: unknown): void;
  reject(reason: unknown): void;
}

/** The duplicate-key flag is read when the value is posted. */
function createReporter(globals: object, port: ReplyPort): Reporter {
  let settled = false;
  const postError = (reason: unknown): void => {
    post(port, { type: ERROR_MESSAGE_TYPE, message: describeFailure(reason) });
  };
  return {
    resolve(value) {
      if (settled) return;
      settled = true;
      Promise.resolve(value).then((resolved: unknown) => {
        post(port, { type: RESULT_MESSAGE_TYPE, value: resolved, jsonDuplicateKeys: Reflect.get(globals, "__klerosJsonDuplicateKeys") === true });
      }, postError);
    },
    reject(reason) {
      if (settled) return;
      settled = true;
      postError(reason);
    },
  };
}

function defineFixedGlobal(globals: object, name: string, value: unknown): void {
  Object.defineProperty(globals, name, { value, writable: false, configurable: false, enumerable: true });
}

function defineScriptGlobals(globals: object, params: ScriptParameters, reporter: Reporter): void {
  defineFixedGlobal(globals, "scriptParameters", Object.freeze({ ...params }));
  defineFixedGlobal(globals, "resolveScript", (value: unknown) => {
    reporter.resolve(value);
  });
  defineFixedGlobal(globals, "rejectScript", (reason: unknown) => {
    reporter.reject(reason);
  });
}

function run(env: RunnerEnvironment, { request, port }: AcceptedRun): void {
  const reporter = createReporter(env.globals, port);
  try {
    defineScriptGlobals(env.globals, request.params, reporter);
    installRpcRedirect(env.network, request.rpcRedirects);
    if (request.guardSource !== null) env.evaluate(request.guardSource);
    env.runScript(request.scriptText);
  } catch (error) {
    reporter.reject(error);
  }
}

/**
 * A refused request gets nothing, so no window learns whether a runner is alive. Results leave only through the
 * request's port.
 */
export function bootstrapRunner(env: RunnerEnvironment): void {
  if (!isSandboxedFrame(env)) return;
  let accepted = false;
  const removeListener = env.addMessageListener((event) => {
    if (accepted) return;
    const acceptedRun = acceptRun(env, event);
    if (acceptedRun === undefined) return;
    accepted = true;
    removeListener();
    acceptedRun.port.postMessage({ type: ACCEPTED_MESSAGE_TYPE });
    run(env, acceptedRun);
  });
}
