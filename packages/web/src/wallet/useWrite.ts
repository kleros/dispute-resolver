import type { Address, Hex, WriteBuild, WriteCall } from "@dispute-resolver/core";
import { useCallback, useId, useMemo, useState } from "react";
import { useConfig } from "wagmi";
import { useCoreDeps } from "../data";
import { performWrite, type WriteEnvironment } from "./performWrite";
import type { WriteController, WriteOptions, WriteStatus } from "./types";
import { reportSafely, useWriteObserver } from "./writeObserver";

const IDLE: WriteStatus = { phase: "idle" };

export function useWriteEnvironment(): WriteEnvironment {
  const config = useConfig();
  const deps = useCoreDeps();
  return useMemo(
    () => ({
      config,
      waitForReceipt: (chainId: number, hash: Hex, onCannotConfirmYet?: () => void) => deps.waitForReceipt(chainId, hash, onCannotConfirmYet),
      simulate: (call: WriteCall, from: Address) => deps.simulate(call, from),
    }),
    [config, deps],
  );
}

/**
 * One write at a time with its status. Every status also goes to the write observer (the shell's toasts); screens keep
 * only the busy state. The attempt is taken at the press and reported from inside the write's own chain, so its
 * outcome arrives even when the pressing control unmounted while the receipt was awaited.
 */
export function useWrite(): WriteController {
  const environment = useWriteEnvironment();
  const observe = useWriteObserver();
  const source = useId();
  const [status, setStatus] = useState<WriteStatus>(IDLE);

  const execute = useCallback(
    (build: WriteBuild, options: WriteOptions) => {
      const attempt = observe(source);
      return performWrite(environment, build, options, (next) => {
        setStatus(next);
        reportSafely(attempt, next, options.wording);
      });
    },
    [environment, observe, source],
  );

  const reset = useCallback(() => {
    setStatus(IDLE);
  }, []);

  return useMemo(() => ({ status, execute, reset }), [status, execute, reset]);
}
