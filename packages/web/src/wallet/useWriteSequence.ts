import type { WriteBuild } from "@dispute-resolver/core";
import { useCallback, useMemo, useState } from "react";
import type { WriteReceipt } from "../data";
import { performWrite, refreshAfter } from "./performWrite";
import type { WriteOptions, WriteOutcome, WriteSequenceController, WriteSequenceStatus, WriteStatus } from "./types";
import { useWriteEnvironment } from "./useWrite";

/**
 * Withdrawals in sequence: one transaction per build, in order, each signed only after the previous receipt is mined;
 * the chain guard runs before every signature. The sequence stops at the first outcome other than `mined`.
 * `options.onMined` runs once, after the last mined receipt or at a stop that follows at least one mined write, so the
 * withdrawable amount is refreshed once. A refused item refuses the sequence before any signature; an empty list is
 * refused as `withdraw-unsupported` (nothing to withdraw).
 */
export function useWriteSequence(): WriteSequenceController {
  const environment = useWriteEnvironment();
  const [status, setStatus] = useState<WriteSequenceStatus | null>(null);

  const execute = useCallback(
    async (builds: readonly WriteBuild[], options: WriteOptions): Promise<WriteOutcome> => {
      const total = builds.length;
      const report = (index: number) => (current: WriteStatus) => {
        setStatus({ index, total, current });
      };
      const refusedIndex = builds.findIndex((build) => !build.ok);
      const refused = builds[refusedIndex];
      if (refused !== undefined) return performWrite(environment, refused, options, report(refusedIndex));
      if (total === 0) {
        const nothing: WriteOutcome = { phase: "refused", refusal: "withdraw-unsupported" };
        report(0)(nothing);
        return nothing;
      }

      const itemOptions: WriteOptions = { pageChainId: options.pageChainId };
      let lastReceipt: WriteReceipt | null = null;
      let outcome: WriteOutcome | null = null;
      for (const [index, build] of builds.entries()) {
        outcome = await performWrite(environment, build, itemOptions, report(index));
        if (outcome.phase !== "mined") break;
        lastReceipt = outcome.receipt;
      }
      if (lastReceipt !== null) await refreshAfter(options, lastReceipt);
      return outcome ?? { phase: "refused", refusal: "withdraw-unsupported" };
    },
    [environment],
  );

  const reset = useCallback(() => {
    setStatus(null);
  }, []);

  return useMemo(() => ({ status, execute, reset }), [status, execute, reset]);
}
