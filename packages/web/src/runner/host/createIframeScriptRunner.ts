import type { ScriptResult, ScriptRunRequest, ScriptRunner } from "@dispute-resolver/core";
import type { IframeRunnerOptions, RunnerRequestMessage } from "../types";
import { createFrameContainer, createRunnerFrame } from "./frame";
import { ACKNOWLEDGEMENT_WINDOW_MS } from "../protocol";
import { MALFORMED_REPLY, failedResult, parsePortMessage } from "./parseReply";
import { createSlotQueue, type Slot } from "./slots";
import { buildRequestMessage } from "./validateRequest";

/** `setTimeout` fires at once for delays above this, so longer budgets are clipped to it. */
const MAX_TIMER_DELAY_MS = 2_147_483_647;

const INVALID_REQUEST = failedResult("runner-error", "The dynamic script's parameters are invalid.");
const ABORTED = failedResult("aborted", "The dynamic script run was aborted.");
const NO_FRAME = failedResult("runner-error", "The script runner frame could not be opened.");
const NO_ACKNOWLEDGEMENT = failedResult(
  "runner-error",
  `The dynamic script's runner did not start within ${String(ACKNOWLEDGEMENT_WINDOW_MS / 1000)} seconds; a content-blocking extension may be preventing the page from loading it.`,
);

/** Never throws, so `run` never rejects. */
function safeRequestMessage(request: ScriptRunRequest, options: IframeRunnerOptions): RunnerRequestMessage | undefined {
  try {
    return buildRequestMessage(request, options.rpcRedirects);
  } catch {
    return;
  }
}

function openFrame(container: HTMLElement, document: Document, runnerUrl: string, message: RunnerRequestMessage, settle: (result: ScriptResult) => void): () => void {
  const frame = createRunnerFrame(document, runnerUrl);
  let port: MessagePort | undefined;

  const onLoad = (): void => {
    const target = frame.contentWindow;
    if (target === null) {
      settle(NO_FRAME);
      return;
    }
    const channel = new MessageChannel();
    port = channel.port1;
    port.onmessage = (event: MessageEvent<unknown>) => {
      const message = parsePortMessage(event.data);
      // The acknowledgement only ends the window; a result or error settles the run whether or not one preceded it.
      if (message.kind === "acknowledged") clearTimeout(acknowledgementTimer);
      else settle(message.result);
    };
    port.onmessageerror = () => {
      settle(MALFORMED_REPLY);
    };
    // The target origin is "*" on purpose: it is the only one an opaque-origin document accepts. The reply can only
    // come back through the transferred port.
    // eslint-disable-next-line sonarjs/post-message -- an opaque-origin frame accepts no other target origin.
    target.postMessage(message, "*", [channel.port2]);
  };

  frame.addEventListener("load", onLoad, { once: true });
  container.append(frame);
  // Counted from the append, not from `load`, which a cancelled frame navigation may never fire.
  const acknowledgementTimer = setTimeout(() => {
    settle(NO_ACKNOWLEDGEMENT);
  }, ACKNOWLEDGEMENT_WINDOW_MS);

  return () => {
    clearTimeout(acknowledgementTimer);
    frame.removeEventListener("load", onLoad);
    if (port !== undefined) {
      port.onmessage = null;
      port.onmessageerror = null;
      port.close();
    }
    frame.remove();
  };
}

/**
 * Core's `ScriptRunner` over sandboxed runner frames. Each run validates its parameters, waits for one of
 * `maxConcurrent` slots, runs in its own frame and port and settles exactly once, on its reply, its timeout (counted
 * from the call, so time spent queued counts) or its abort, removing its frame. The promise never rejects.
 */
export function createIframeScriptRunner(options: IframeRunnerOptions): ScriptRunner {
  const queue = createSlotQueue(options.maxConcurrent);
  const container = createFrameContainer(options.document);

  const run = (request: ScriptRunRequest): Promise<ScriptResult> =>
    new Promise<ScriptResult>((resolve) => {
      const message = safeRequestMessage(request, options);
      if (message === undefined) {
        resolve(INVALID_REQUEST);
        return;
      }
      const timedOut = failedResult("timeout", `The dynamic script for dispute ${message.params.disputeID} timed out.`);
      if (request.signal?.aborted === true) {
        resolve(ABORTED);
        return;
      }
      if (Number.isNaN(request.timeoutMs) || request.timeoutMs <= 0) {
        resolve(timedOut);
        return;
      }

      let settled = false;
      let teardown: (() => void) | undefined;

      const onAbort = (): void => {
        settle(ABORTED);
      };
      const timer = setTimeout(
        () => {
          settle(timedOut);
        },
        Math.min(request.timeoutMs, MAX_TIMER_DELAY_MS),
      );

      function settle(result: ScriptResult): void {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        request.signal?.removeEventListener("abort", onAbort);
        teardown?.();
        slot.cancel();
        resolve(result);
      }

      request.signal?.addEventListener("abort", onAbort, { once: true });
      // `settle` runs only from asynchronous callbacks (load, port, timer, abort), so `slot` is always set by then.
      const slot: Slot = queue.acquire(() => {
        try {
          teardown = openFrame(container(), options.document, options.runnerUrl, message, settle);
        } catch {
          // Settled on the next microtask, once the slot this callback runs in has been handed back.
          queueMicrotask(() => {
            settle(NO_FRAME);
          });
        }
      });
    });

  return { run };
}
