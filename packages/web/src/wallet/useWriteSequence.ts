import type { WriteBuild } from "@dispute-resolver/core";
import { useCallback, useId, useMemo, useState } from "react";
import type { WriteReceipt } from "../data";
import { performWrite, refreshAfter } from "./performWrite";
import type { WriteOutcome, WriteRun, WriteSequenceController, WriteSequenceOptions, WriteSequenceStatus, WriteStatus } from "./types";
import { useWriteEnvironment } from "./useWrite";
import { reportSafely, useWriteObserver } from "./writeObserver";

/**
 * Withdrawals in sequence: one transaction per build, in order, each signed only after the previous receipt is mined;
 * the chain guard runs before every signature. The sequence stops at the first outcome other than `mined`.
 * `options.onMined` runs once, after the last mined receipt or at a stop that follows at least one mined write, so the
 * withdrawable amount is refreshed once. A refused item refuses the sequence before any signature; an empty list is
 * refused as `withdraw-unsupported` (nothing to withdraw). The whole sequence is one attempt for the write observer,
 * each status with its item's wording and position; a refusal before any signature has no position, since nothing was
 * sent.
 */
export function useWriteSequence(): WriteSequenceController {
  const environment = useWriteEnvironment();
  const observe = useWriteObserver();
  const source = useId();
  const [status, setStatus] = useState<WriteSequenceStatus | null>(null);

  const execute = useCallback(
    async (builds: readonly WriteBuild[], options: WriteSequenceOptions): Promise<WriteOutcome> => {
      const attempt = observe(source);
      const total = builds.length;
      const report = (index: number) => (current: WriteStatus) => {
        setStatus({ index, total, current });
        reportSafely(attempt, current, options.wording(index), { index, total });
      };
      const run: WriteRun = { pageChainId: options.pageChainId };
      const refusedIndex = builds.findIndex((build) => !build.ok);
      const refused = builds[refusedIndex];
      if (refused !== undefined) {
        return performWrite(environment, refused, run, (current) => {
          setStatus({ index: refusedIndex, total, current });
          reportSafely(attempt, current, options.wording(refusedIndex));
        });
      }
      if (total === 0) {
        const nothing: WriteOutcome = { phase: "refused", refusal: "withdraw-unsupported" };
        setStatus({ index: 0, total, current: nothing });
        reportSafely(attempt, nothing, options.wording(0));
        return nothing;
      }

      let lastReceipt: WriteReceipt | null = null;
      let outcome: WriteOutcome | null = null;
      for (const [index, build] of builds.entries()) {
        outcome = await performWrite(environment, build, run, report(index));
        if (outcome.phase !== "mined") break;
        lastReceipt = outcome.receipt;
      }
      if (lastReceipt !== null) await refreshAfter(options, lastReceipt);
      return outcome ?? { phase: "refused", refusal: "withdraw-unsupported" };
    },
    [environment, observe, source],
  );

  const reset = useCallback(() => {
    setStatus(null);
  }, []);

  return useMemo(() => ({ status, execute, reset }), [status, execute, reset]);
}
