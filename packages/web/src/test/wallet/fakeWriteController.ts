import type { WriteBuild } from "@dispute-resolver/core";
import { useCallback, useId, useMemo, useState } from "react";
import type { WriteReceipt } from "../../data";
import {
  useWriteObserver,
  type WriteController,
  type WriteOptions,
  type WriteOutcome,
  type WriteRun,
  type WriteSequenceController,
  type WriteSequenceOptions,
  type WriteSequenceStatus,
  type WriteStatus,
} from "../../wallet";

const OUTCOME_PHASES: ReadonlySet<WriteStatus["phase"]> = new Set([
  "refused",
  "needs-wallet",
  "wrong-chain",
  "refused-by-contract",
  "insufficient-funds",
  "account-changed",
  "mined",
  "unconfirmed",
  "failed",
  "rejected",
]);

const NOTHING_TO_WITHDRAW: WriteOutcome = { phase: "refused", refusal: "withdraw-unsupported" };

function isOutcome(status: WriteStatus): status is WriteOutcome {
  return OUTCOME_PHASES.has(status.phase);
}

export interface FakeWriteController {
  /** A `useWrite` replacement, for `vi.mock` of the wallet index: `useWrite: () => fake.useWrite()`. */
  useWrite(): WriteController;
  /**
   * A `useWriteSequence` replacement: plays the script once per build (build i's own script when one is given) and stops
   * at the first outcome other than `mined`.
   */
  useWriteSequence(): WriteSequenceController;
  /** Every `execute`, refused builds included. */
  readonly executions: { readonly builds: readonly WriteBuild[]; readonly options: WriteOptions | WriteSequenceOptions }[];
}

/** As the real hooks do, a refresh that fails after mining leaves the write mined. */
async function refreshAfter(run: WriteRun, receipt: WriteReceipt): Promise<void> {
  try {
    await run.onMined?.(receipt);
  } catch {
    // The refresh failed; the transaction is mined all the same.
  }
}

/** One status per microtask, so each intermediate status renders. */
async function playSteps(script: readonly WriteStatus[], run: WriteRun, report: (status: WriteStatus) => void, from: WriteStatus): Promise<WriteStatus> {
  let last = from;
  for (const status of script) {
    await Promise.resolve();
    if (status.phase === "mined") await refreshAfter(run, status.receipt);
    report(status);
    last = status;
  }
  return last;
}

/** `held`: the rest of the script, played once it arrives. */
async function play(script: readonly WriteStatus[], run: WriteRun, report: (status: WriteStatus) => void, held?: Promise<readonly WriteStatus[]>): Promise<WriteOutcome> {
  let last = await playSteps(script, run, report, { phase: "idle" });
  if (held !== undefined) last = await playSteps(await held, run, report, last);
  if (!isOutcome(last)) throw new Error(`A fake write script must end with an outcome, not "${last.phase}".`);
  return last;
}

/** A refusal the real hooks report at once, before any script would start. */
function refusalOf(builds: readonly WriteBuild[]): WriteOutcome | null {
  const refused = builds.find((build) => !build.ok);
  if (refused !== undefined) return { phase: "refused", refusal: refused.refusal };
  return builds.length === 0 ? NOTHING_TO_WITHDRAW : null;
}

/**
 * Drives every `WriteStatus` without a wallet: each `execute` plays `script` (for example pending → submitted → mined)
 * and resolves with its last status, which must be an outcome. Every status also goes to the app's write observer, one
 * attempt per `execute`, as the real hooks report it. `onMined` runs before a `mined` status is shown, and its failure
 * leaves the write mined; a sequence runs it once, after its last mined build. `buildScripts[i]`, when given, replaces
 * `script` for a sequence's build i. A refused build is reported at once and plays nothing, as are a sequence with a
 * refused item (without a position) and an empty sequence. Not modelled: the chain guard, the call-chain check and the
 * contract check; a script plays those.
 */
export function fakeWriteController(script: readonly WriteStatus[], buildScripts: readonly (readonly WriteStatus[])[] = []): FakeWriteController {
  return createFakeWriteController(script, buildScripts, undefined);
}

export interface HeldWriteController extends FakeWriteController {
  /** Plays `rest` in every `execute` held so far and in any later one; its last status must be an outcome. */
  release(rest: readonly WriteStatus[]): void;
}

/** As `fakeWriteController`, but each `execute` of `useWrite` plays `before` and then waits for `release`. */
export function heldWriteController(before: readonly WriteStatus[]): HeldWriteController {
  let release: (rest: readonly WriteStatus[]) => void = () => undefined;
  const held = new Promise<readonly WriteStatus[]>((resolve) => {
    release = resolve;
  });
  return { ...createFakeWriteController(before, [], held), release };
}

function createFakeWriteController(script: readonly WriteStatus[], buildScripts: readonly (readonly WriteStatus[])[], held: Promise<readonly WriteStatus[]> | undefined): FakeWriteController {
  const executions: { builds: readonly WriteBuild[]; options: WriteOptions | WriteSequenceOptions }[] = [];

  function useWrite(): WriteController {
    const observe = useWriteObserver();
    const source = useId();
    const [status, setStatus] = useState<WriteStatus>({ phase: "idle" });
    const execute = useCallback(
      async (build: WriteBuild, writeOptions: WriteOptions) => {
        executions.push({ builds: [build], options: writeOptions });
        const attempt = observe(source);
        const report = (next: WriteStatus) => {
          setStatus(next);
          attempt.report(next, writeOptions.wording);
        };
        if (!build.ok) {
          const refused: WriteOutcome = { phase: "refused", refusal: build.refusal };
          report(refused);
          return refused;
        }
        return play(script, writeOptions, report, held);
      },
      [observe, source],
    );
    const reset = useCallback(() => {
      setStatus({ phase: "idle" });
    }, []);
    return useMemo(() => ({ status, execute, reset }), [status, execute, reset]);
  }

  function useWriteSequence(): WriteSequenceController {
    const observe = useWriteObserver();
    const source = useId();
    const [status, setStatus] = useState<WriteSequenceStatus | null>(null);
    const execute = useCallback(
      async (builds: readonly WriteBuild[], writeOptions: WriteSequenceOptions) => {
        executions.push({ builds, options: writeOptions });
        const attempt = observe(source);
        const total = builds.length;
        const refusal = refusalOf(builds);
        if (refusal !== null) {
          const index = Math.max(
            0,
            builds.findIndex((build) => !build.ok),
          );
          setStatus({ index, total, current: refusal });
          attempt.report(refusal, writeOptions.wording(index));
          return refusal;
        }
        let outcome: WriteOutcome = NOTHING_TO_WITHDRAW;
        let lastMined: Extract<WriteOutcome, { readonly phase: "mined" }> | null = null;
        for (const index of builds.keys()) {
          outcome = await play(buildScripts[index] ?? script, { pageChainId: writeOptions.pageChainId }, (current) => {
            setStatus({ index, total, current });
            attempt.report(current, writeOptions.wording(index), { index, total });
          });
          if (outcome.phase !== "mined") break;
          lastMined = outcome;
        }
        if (lastMined !== null) await refreshAfter(writeOptions, lastMined.receipt);
        return outcome;
      },
      [observe, source],
    );
    const reset = useCallback(() => {
      setStatus(null);
    }, []);
    return useMemo(() => ({ status, execute, reset }), [status, execute, reset]);
  }

  return { useWrite, useWriteSequence, executions };
}
