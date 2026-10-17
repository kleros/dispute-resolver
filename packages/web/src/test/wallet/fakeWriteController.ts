import type { WriteBuild } from "@dispute-resolver/core";
import { useCallback, useMemo, useState } from "react";
import type { WriteController, WriteOptions, WriteOutcome, WriteSequenceController, WriteSequenceStatus, WriteStatus } from "../../wallet";

const OUTCOME_PHASES: ReadonlySet<WriteStatus["phase"]> = new Set(["refused", "needs-wallet", "wrong-chain", "mined", "failed", "rejected"]);

function isOutcome(status: WriteStatus): status is WriteOutcome {
  return OUTCOME_PHASES.has(status.phase);
}

export interface FakeWriteOptions {
  /** The status before any `execute`; default `idle`. */
  readonly initial?: WriteStatus;
}

export interface FakeWriteController {
  /** A `useWrite` replacement, for `vi.mock` of the wallet index: `useWrite: () => fake.useWrite()`. */
  useWrite(): WriteController;
  /** A `useWriteSequence` replacement: plays the script once per build and stops at the first outcome other than `mined`. */
  useWriteSequence(): WriteSequenceController;
  /** Every `execute` call, in order, with the builds it received. */
  readonly executions: { readonly builds: readonly WriteBuild[]; readonly options: WriteOptions }[];
}

/** Plays `script`, one status per microtask, so each intermediate status renders. Returns the last status. */
async function play(script: readonly WriteStatus[], options: WriteOptions, report: (status: WriteStatus) => void, notifyMined: boolean): Promise<WriteOutcome> {
  let last: WriteStatus = { phase: "idle" };
  for (const status of script) {
    await Promise.resolve();
    if (status.phase === "mined" && notifyMined) await options.onMined?.(status.receipt);
    report(status);
    last = status;
  }
  if (!isOutcome(last)) throw new Error(`A fake write script must end with an outcome, not "${last.phase}".`);
  return last;
}

/**
 * Drives every `WriteStatus` without a wallet (ARCHITECTURE.md §1.5): each `execute` plays `script` (for example
 * pending → submitted → mined) and resolves with its last status, which must be an outcome. `onMined` runs before a
 * `mined` status is shown, as in the real hook (D-07).
 */
export function fakeWriteController(script: readonly WriteStatus[], options: FakeWriteOptions = {}): FakeWriteController {
  const { initial = { phase: "idle" } } = options;
  const executions: { builds: readonly WriteBuild[]; options: WriteOptions }[] = [];

  function useWrite(): WriteController {
    const [status, setStatus] = useState<WriteStatus>(initial);
    const execute = useCallback(async (build: WriteBuild, writeOptions: WriteOptions) => {
      executions.push({ builds: [build], options: writeOptions });
      return play(script, writeOptions, setStatus, true);
    }, []);
    const reset = useCallback(() => {
      setStatus({ phase: "idle" });
    }, []);
    return useMemo(() => ({ status, execute, reset }), [status, execute, reset]);
  }

  function useWriteSequence(): WriteSequenceController {
    const [status, setStatus] = useState<WriteSequenceStatus | null>(initial.phase === "idle" ? null : { index: 0, total: 1, current: initial });
    const execute = useCallback(async (builds: readonly WriteBuild[], writeOptions: WriteOptions) => {
      executions.push({ builds, options: writeOptions });
      let outcome: WriteOutcome = { phase: "refused", refusal: "withdraw-unsupported" };
      for (const index of builds.keys()) {
        outcome = await play(script, writeOptions, (current) => {
          setStatus({ index, total: builds.length, current });
        }, false);
        if (outcome.phase !== "mined") break;
      }
      if (outcome.phase === "mined") await writeOptions.onMined?.(outcome.receipt);
      return outcome;
    }, []);
    const reset = useCallback(() => {
      setStatus(null);
    }, []);
    return useMemo(() => ({ status, execute, reset }), [status, execute, reset]);
  }

  return { useWrite, useWriteSequence, executions };
}
