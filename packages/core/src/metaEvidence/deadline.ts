/** The longest delay a timer can hold; a larger one would fire at once. */
const MAX_TIMER_MS = 2_147_483_647;

/** Why a step stopped waiting: its load's signal aborted, at the deadline or by the caller. */
export class Interrupted extends Error {
  constructor() {
    super("The meta-evidence load was interrupted.");
    this.name = "Interrupted";
  }
}

/**
 * The single budget of one meta-evidence load (D-38). `signal` aborts when the budget runs out or the caller aborts, and
 * every request and script run of the load carries it.
 */
export interface Deadline {
  readonly signal: AbortSignal;
  remainingMs(): number;
  /** The budget is spent. */
  expired(): boolean;
  /** The caller aborted the load. */
  cancelled(): boolean;
  /** Stops the deadline timer and detaches from the caller's signal. */
  dispose(): void;
}

export function startDeadline(budgetMs: number, callerSignal: AbortSignal | undefined): Deadline {
  const budget = Number.isNaN(budgetMs) ? 0 : Math.min(Math.max(budgetMs, 0), MAX_TIMER_MS);
  const deadline = Date.now() + budget;
  const controller = new AbortController();
  const onCallerAbort = () => {
    controller.abort(new Interrupted());
  };
  if (callerSignal?.aborted === true) onCallerAbort();
  else callerSignal?.addEventListener("abort", onCallerAbort, { once: true });
  const timer = setTimeout(() => {
    controller.abort(new Interrupted());
  }, budget);
  return {
    signal: controller.signal,
    remainingMs: () => Math.max(0, deadline - Date.now()),
    expired: () => Date.now() >= deadline,
    cancelled: () => callerSignal?.aborted === true,
    dispose: () => {
      clearTimeout(timer);
      callerSignal?.removeEventListener("abort", onCallerAbort);
    },
  };
}

/**
 * Runs `task` and settles with it, or rejects with `Interrupted` as soon as `signal` aborts, so a request whose
 * implementation ignores its signal cannot hold the load past its budget. A synchronous throw of `task` is a rejection.
 */
export function untilAborted<T>(signal: AbortSignal, task: (signal: AbortSignal) => Promise<T>): Promise<T> {
  if (signal.aborted) return Promise.reject(new Interrupted());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      reject(new Interrupted());
    };
    signal.addEventListener("abort", onAbort, { once: true });
    Promise.resolve()
      .then(() => task(signal))
      .then(resolve, reject)
      .finally(() => {
        signal.removeEventListener("abort", onAbort);
      });
  });
}

/** Waits `ms`; resolves `false` early when `signal` aborts. */
export function pause(ms: number, signal: AbortSignal): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    const onAbort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve(true);
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
