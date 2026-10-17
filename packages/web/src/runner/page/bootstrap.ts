import type { ScriptParameters } from "@dispute-resolver/core";
import { ERROR_MESSAGE_TYPE, RESULT_MESSAGE_TYPE } from "../protocol";
import type { ReplyPort, RunnerEnvironment, RunnerMessageEvent, RunnerReplyMessage, RunnerRequestMessage } from "../types";
import { parseRunRequest } from "./request";
import { installRpcRedirect } from "./rpcRedirect";

const OPAQUE_ORIGIN = "null";
const NOT_CLONEABLE = "The script's result cannot be copied out of the runner.";
const UNDESCRIBED_FAILURE = "The script reported a failure.";

/** One accepted run: the validated request and the port its reply goes through. */
interface AcceptedRun {
  readonly request: RunnerRequestMessage;
  readonly port: ReplyPort;
}

/** Step 1 (C4): run only in a sandboxed (opaque-origin) document that is framed. */
function isSandboxedFrame(env: RunnerEnvironment): boolean {
  return env.selfOrigin === OPAQUE_ORIGIN && !env.isTopLevel;
}

/**
 * Step 2 (C4): a request counts only when it comes from the parent window, on the app's origin (the runner URL's own
 * origin, which an opaque document still reports through `location.origin`), carries exactly one port and is a
 * well-formed run request.
 */
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

/** Posts one reply; a value the port cannot structured-clone becomes an error reply. */
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

/**
 * Settles the run once: the first resolve or reject wins, as with the promise of the old runner, and a promise given
 * to `resolve` is adopted. The duplicate-key flag is read when the value is posted.
 */
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

/** Step 3: the globals the pinned scripts rely on (spec §9.5). */
function defineScriptGlobals(globals: object, params: ScriptParameters, reporter: Reporter): void {
  defineFixedGlobal(globals, "scriptParameters", Object.freeze({ ...params }));
  defineFixedGlobal(globals, "resolveScript", (value: unknown) => {
    reporter.resolve(value);
  });
  defineFixedGlobal(globals, "rejectScript", (reason: unknown) => {
    reporter.reject(reason);
  });
}

/** Steps 3 to 6 for the accepted request. A synchronous failure at any step is reported once. */
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
 * The runner page (ADR 0004, ARCHITECTURE.md §7.2): checks it is a sandboxed frame, accepts one run request from its
 * parent, defines the script-facing globals, installs the RPC redirect and, for Reality scripts, the duplicate-key
 * guard, evaluates the script and calls `getMetaEvidence()`. Results leave only through the request's port.
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
    run(env, acceptedRun);
  });
}
