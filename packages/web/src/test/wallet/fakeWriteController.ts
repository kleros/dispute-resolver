import type { WriteBuild } from "@dispute-resolver/core";
import { useCallback, useMemo, useState } from "react";
import type { WriteController, WriteOptions, WriteOutcome, WriteSequenceController, WriteSequenceStatus, WriteStatus } from "../../wallet";

const OUTCOME_PHASES: ReadonlySet<WriteStatus["phase"]> = new Set([
  "refused",
  "needs-wallet",
  "wrong-chain",
  "refused-by-contract",
  "insufficient-funds",
  "account-changed",
  "mined",
  "failed",
  "rejected",
]);

function isOutcome(status: WriteStatus): status is WriteOutcome {
  return OUTCOME_PHASES.has(status.phase);
}

export interface FakeWriteController {
  /** A `useWrite` replacement, for `vi.mock` of the wallet index: `useWrite: () => fake.useWrite()`. */
  useWrite(): WriteController;
  /** A `useWriteSequence` replacement: plays the script once per build and stops at the first outcome other than `mined`. */
  useWriteSequence(): WriteSequenceController;
  readonly executions: { readonly builds: readonly WriteBuild[]; readonly options: WriteOptions }[];
}

/** One status per microtask, so each intermediate status renders. */
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
 * Drives every `WriteStatus` without a wallet: each `execute` plays `script` (for example pending → submitted → mined)
 * and resolves with its last status, which must be an outcome. `onMined` runs before a `mined` status is shown, as in
 * the real hook.
 */
export function fakeWriteController(script: readonly WriteStatus[]): FakeWriteController {
  const executions: { builds: readonly WriteBuild[]; options: WriteOptions }[] = [];

  function useWrite(): WriteController {
    const [status, setStatus] = useState<WriteStatus>({ phase: "idle" });
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
    const [status, setStatus] = useState<WriteSequenceStatus | null>(null);
    const execute = useCallback(async (builds: readonly WriteBuild[], writeOptions: WriteOptions) => {
      executions.push({ builds, options: writeOptions });
      let outcome: WriteOutcome = { phase: "refused", refusal: "withdraw-unsupported" };
      for (const index of builds.keys()) {
        outcome = await play(
          script,
          writeOptions,
          (current) => {
            setStatus({ index, total: builds.length, current });
          },
          false,
        );
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
